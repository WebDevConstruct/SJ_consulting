#!/usr/bin/env python3
"""
JAMB Past Questions PDF Parser
SJ Consulting Platform — WDC
Author: Lala

Ingests JAMB Past Question PDFs from toppers.com.ng and produces:
  - scripts/seeds/<subject>.json   (structured question data)
  - scripts/seeds/seed_all.sql     (ready-to-run Supabase INSERT)
  - assets/diagrams/<subject>_p<page>_img<n>.jpg (embedded diagram images)

Usage:
  python3 scripts/parse_jamb.py

PDF format assumptions (verified via deep_scan.py):
  - One PDF per subject (Accounts, Biology, Commerce, Economics)
  - Each PDF contains years 2010-2018, consecutive pages per year
  - Year headers: "PAPER TYPE: X" at top of first page of each year
  - Questions: "1. [text]\n\nA. ...\nB. ...\nC. ...\nD. ..."
  - Answer keys: "ANSWER KEYS\n\n1. C 2. D 3. A ..."
  - Diagrams: embedded JPEG images extracted via pypdf
  - "Use the [diagram|table|information] below to answer question[s] X [and Y]"
    precedes grouped questions — captured as context_text

Known quirks handled:
  - Some options lack period after letter: "B Type B" vs "B. Type B"
  - Answer keys may span multiple lines and break at different widths
  - "NO OPTION" or "--" in answer keys means answer is disputed/unclear
  - Page 1 is cover, Page 2+ are questions
  - toppers.com.ng watermark appears at top of most pages (stripped)
"""

import os
import re
import json
import uuid
import logging
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional
from pypdf import PdfReader

# ============================================================
# CONFIG
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(message)s"
)
log = logging.getLogger(__name__)

PDFS = {
    "accounts": "/mnt/c/Users/Suleiman Muhammed O/OneDrive/Documents/JAMB-ACCOUNTS-PAST-QUESTIONS.pdf",
    "biology":  "/mnt/c/Users/Suleiman Muhammed O/OneDrive/Documents/JAMB-BIOLOGY-PAST-QUESTIONS.pdf",
    "commerce": "/mnt/c/Users/Suleiman Muhammed O/OneDrive/Documents/JAMB-COMMERCE-PAST-QUESTIONS.pdf",
    "economics":"/mnt/c/Users/Suleiman Muhammed O/OneDrive/Documents/JAMB-ECONOMICS-PAST-QUESTIONS.pdf",
}

# Output paths relative to project root
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
SEEDS_DIR = SCRIPT_DIR / "seeds"
DIAGRAMS_DIR = PROJECT_ROOT / "assets" / "diagrams"

SEEDS_DIR.mkdir(parents=True, exist_ok=True)
DIAGRAMS_DIR.mkdir(parents=True, exist_ok=True)

# Noise to strip from the top of each extracted page
STRIP_PATTERNS = [
    r"www\.toppers\.com\.ng\s*",
    r"NOT FOR SALE.*",
    r"All JAMB past questions are FREE.*",
    r"If someone sold this.*",
    r"Years:\s*[\d\s]+",
]

# ============================================================
# DATA MODEL
# ============================================================

@dataclass
class Question:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    subject: str = ""
    topic: Optional[str] = None       # Not in PDFs, assigned by admin later
    exam_type: str = "JAMB"
    year: int = 0
    question_number: int = 0
    context_text: Optional[str] = None
    question_text: str = ""
    options: dict = field(default_factory=dict)  # {"A": "...", "B": "...", ...}
    correct_option: Optional[str] = None          # "A"|"B"|"C"|"D"|None (disputed)
    explanation: Optional[str] = None
    has_diagram: bool = False
    diagram_url: Optional[str] = None             # Set after upload to Supabase Storage
    diagram_local_path: Optional[str] = None      # Local path for upload reference

    def is_valid(self) -> bool:
        """Minimum viable question for seeding."""
        return (
            bool(self.question_text.strip())
            and len(self.options) >= 3          # Some JAMB questions had 3 opts historically
            and self.year > 0
            and self.question_number > 0
        )

# ============================================================
# TEXT CLEANING
# ============================================================

def clean_page_text(text: str) -> str:
    """Strip watermarks, ads, and noise from extracted page text."""
    for pattern in STRIP_PATTERNS:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE | re.DOTALL)
    # Collapse excessive blank lines to single blank line
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def clean_option_text(text: str) -> str:
    """Remove trailing period, excess whitespace from option text."""
    return re.sub(r"\s+", " ", text).strip().rstrip(".")

def clean_question_text(text: str) -> str:
    """Normalize question stem."""
    return re.sub(r"\s+", " ", text).strip()

# ============================================================
# YEAR BLOCK EXTRACTION
# ============================================================

# Locked-in authoritative answer key for Commerce 2011 (omitted from toppers PDF)
COMMERCE_2011_FALLBACK_ANSWERS: dict[int, str] = {
    1: "C", 2: "C", 3: "D", 4: "C", 5: "B", 6: "C", 7: "B", 8: "D", 9: "A", 10: "B",
    11: "D", 12: "C", 13: "B", 14: "A", 15: "D", 16: "B", 17: "B", 18: "A", 19: "B", 20: "A",
    21: "C", 22: "C", 23: "D", 24: "A", 25: "C", 26: "B", 27: "B", 28: "D", 29: "B", 30: "B",
    31: "A", 32: "B", 33: "D", 34: "A", 35: "C", 36: "A", 37: "D", 38: "C", 39: "B", 40: "B",
    41: "C", 42: "A", 43: "C", 44: "B", 45: "D", 46: "C", 47: "D", 48: "C", 49: "A", 50: "A",
}

# Header regex matching years 2010-2018 across all subjects
# Matches both pre-2015 and post-2015 CBT headers: e.g. "2015 JAMB COMMERCE QUESTIONS"
YEAR_HEADER_RE = re.compile(r'(201\d)\s+JAMB\s+[A-Z\s]+?\s+QUESTIONS', re.IGNORECASE)
PAPER_TYPE_RE = re.compile(r'PAPER\s+TYPE\s*:\s*[A-Z]', re.IGNORECASE)

# Answer block markers: covers "ANSWER KEYS", "ANSWER KEY:", "ANSWERS", etc.
ANSWER_BLOCK_RE = re.compile(r'(?:^|\n)\s*(?:ANSWER\s*KEYS?|ANSWERS)\s*[:.]?\s*\n', re.IGNORECASE)

def detect_year_from_page_range(page_texts: list[str], _unused) -> dict[int, Optional[int]]:
    """
    Map page index → year by detecting '(201X) JAMB [SUBJECT] QUESTIONS' headers.

    Strategy:
      - Page 0 is the cover — always None.
      - Each year start page contains '[YEAR] JAMB [SUBJECT] QUESTIONS'.
      - All pages between two year headers belong to the earlier year.
      - Fallback: if header is missing, detect via 'PAPER TYPE: X'.
    """
    year_starts: list[tuple[int, int]] = []  # (page_idx, year)
    years_in_pdf = list(range(2010, 2019))

    for i, text in enumerate(page_texts):
        if i == 0:
            continue  # Cover page
        m = YEAR_HEADER_RE.search(text)
        if m:
            yr = int(m.group(1))
            if not any(y == yr for _, y in year_starts):
                year_starts.append((i, yr))

    # Fallback to PAPER TYPE if no explicit year headers matched
    if not year_starts:
        for i, text in enumerate(page_texts):
            if i == 0:
                continue
            if PAPER_TYPE_RE.search(text):
                idx = len(year_starts)
                yr = years_in_pdf[idx] if idx < len(years_in_pdf) else years_in_pdf[-1]
                year_starts.append((i, yr))

    year_starts.sort(key=lambda x: x[0])
    year_map: dict[int, Optional[int]] = {0: None}

    if not year_starts:
        for i in range(1, len(page_texts)):
            year_map[i] = 2010
        return year_map

    for page_idx in range(1, len(page_texts)):
        assigned_year = year_starts[0][1]
        for start_page, yr in year_starts:
            if page_idx >= start_page:
                assigned_year = yr
            else:
                break
        year_map[page_idx] = assigned_year

    return year_map


def build_year_pages(year_map: dict[int, Optional[int]]) -> dict[int, list[int]]:
    """Invert year_map → {year: [page_indices]} for diagram scoping."""
    result: dict[int, list[int]] = {}
    for page_idx, year in year_map.items():
        if year is None:
            continue
        result.setdefault(year, []).append(page_idx)
    return result

# ============================================================
# ANSWER KEY PARSING
# ============================================================

def parse_answer_key(text: str) -> dict[int, Optional[str]]:
    """
    Parse the ANSWER KEYS section into {question_number: "A"|"B"|"C"|"D"|None}.
    Handles:
      - "1. C 2. D 3. A" (inline)
      - "1. C\n2. D\n3. A" (one per line)
      - "1. C 2. D\n3. A 4. B" (mixed)
      - "NO OPTION" or "--" (disputed answers → None)
    """
    answers: dict[int, Optional[str]] = {}
    # Match: number, dot, optional space, answer or NO OPTION
    pattern = re.compile(
        r'(\d+)\.\s*([A-D]|NO\s*OPTION|--)',
        re.IGNORECASE
    )
    for m in pattern.finditer(text):
        q_num = int(m.group(1))
        raw_ans = m.group(2).strip().upper()
        if raw_ans in ("A", "B", "C", "D"):
            answers[q_num] = raw_ans
        else:
            answers[q_num] = None  # Disputed — flag but don't block seeding
    return answers

# ============================================================
# QUESTION BLOCK PARSING
# ============================================================

# Matches: "1. ", "1) ", or "1 " at the start of a line
QUESTION_START_RE = re.compile(r'^\s*(\d{1,2})[.)]?\s+(?=[A-Z₦\"\'])', re.MULTILINE)

# Matches option: "A. text", "B text" (without period), "C. text"
OPTION_RE = re.compile(
    r'(?:^|\n)\s*([A-D])\.?\s+(.+?)(?=(?:\n\s*[A-D]\.?\s+)|\n\n|$)',
    re.DOTALL
)

# Context prompt patterns (before grouped questions)
CONTEXT_RE = re.compile(
    r'(Use the (?:diagram|table|information|figure|chart|graph) below '
    r'to answer (?:this )?question[s]?\s+[\d\s,and]+\.?)',
    re.IGNORECASE
)

def parse_question_block(
    block: str,
    subject: str,
    year: int,
    answer_key: dict[int, Optional[str]],
    context_buffer: Optional[str],
    has_diagram_on_page: bool,
    diagram_local_path: Optional[str],
) -> Optional[Question]:
    """
    Parse a single question block (from "N. [text]" to next question start).
    Returns a Question or None if parsing fails.
    """
    # Extract question number
    num_match = QUESTION_START_RE.match(block.strip())
    if not num_match:
        return None

    q_num = int(num_match.group(1))
    remainder = block[num_match.end():]

    # Extract options (A, B, C, D)
    options: dict[str, str] = {}
    option_matches = list(OPTION_RE.finditer(remainder))

    if not option_matches:
        # Try simpler line-by-line fallback
        for line in remainder.split("\n"):
            line = line.strip()
            m = re.match(r'^([A-D])\.?\s+(.+)', line)
            if m:
                options[m.group(1)] = clean_option_text(m.group(2))
    else:
        for m in option_matches:
            options[m.group(1)] = clean_option_text(m.group(2))

    # Question stem = everything before first option
    if option_matches:
        stem_end = option_matches[0].start()
        stem = remainder[:stem_end]
    else:
        # Try splitting on first [A-D]. pattern
        stem_match = re.split(r'\n\s*[A-D]\.?\s+', remainder, maxsplit=1)
        stem = stem_match[0] if stem_match else remainder

    stem = clean_question_text(stem)

    # Determine if this question references a diagram
    is_diagram_q = bool(
        has_diagram_on_page
        or bool(re.search(r'diagram|figure|chart|graph', stem, re.IGNORECASE))
        or (context_buffer and re.search(r'diagram|figure', context_buffer, re.IGNORECASE))
    )

    q = Question(
        subject=subject,
        year=year,
        question_number=q_num,
        context_text=context_buffer,
        question_text=stem,
        options=options,
        correct_option=answer_key.get(q_num),
        has_diagram=is_diagram_q,
        diagram_local_path=diagram_local_path if is_diagram_q else None,
    )
    return q if q.is_valid() else None

# ============================================================
# DIAGRAM EXTRACTION
# ============================================================

def extract_diagrams_from_page(
    page,
    subject: str,
    page_num: int,
) -> list[str]:
    """
    Extract embedded images from a PDF page.
    Saves to assets/diagrams/<subject>_p<page>_img<n>.jpg
    Returns list of local file paths.
    """
    paths = []
    if not hasattr(page, "images") or not page.images:
        return paths

    for i, image in enumerate(page.images):
        fname = f"{subject}_p{page_num}_img{i+1}.jpg"
        out_path = DIAGRAMS_DIR / fname
        try:
            with open(out_path, "wb") as f:
                f.write(image.data)
            paths.append(str(out_path))
            log.info(f"  Extracted diagram: {fname}")
        except Exception as e:
            log.warning(f"  Failed to extract image from page {page_num}: {e}")
    return paths

# ============================================================
# MAIN PARSER
# ============================================================

def parse_subject_pdf(subject: str, pdf_path: str) -> list[Question]:
    """
    Full pipeline for a single subject PDF:
      1. Extract text from all pages
      2. Detect year boundaries
      3. Parse answer keys
      4. Extract questions
      5. Extract diagrams
      6. Merge correct answers into questions
    """
    log.info(f"\n{'='*60}")
    log.info(f"Parsing: {subject.upper()} ({pdf_path})")
    log.info(f"{'='*60}")

    reader = PdfReader(pdf_path)
    page_texts = [
        clean_page_text(p.extract_text() or "")
        for p in reader.pages
    ]

    total_pages = len(reader.pages)
    log.info(f"  Pages: {total_pages}")

    # Detect year per page and build year → [pages] index
    year_map = detect_year_from_page_range(page_texts, [])
    year_pages = build_year_pages(year_map)  # {year: [page_indices]}

    detected_years = sorted(year_pages.keys())
    log.info(f"  Detected years: {detected_years}")

    # Concatenate page texts per year
    full_text_by_year: dict[int, str] = {}
    for page_idx, year in year_map.items():
        if year is None:
            continue
        full_text_by_year.setdefault(year, "")
        full_text_by_year[year] += "\n" + page_texts[page_idx]

    # Extract diagrams per page index (skip cover)
    diagrams_by_page: dict[int, list[str]] = {}
    for page_idx, page in enumerate(reader.pages):
        if page_idx == 0:
            continue
        imgs = extract_diagrams_from_page(page, subject, page_idx + 1)
        if imgs:
            diagrams_by_page[page_idx] = imgs

    # Pre-compute per-year diagram presence and first diagram path
    # FIX: scope diagram checks to this year's pages only, not the whole PDF
    year_has_diagram: dict[int, bool] = {}
    year_first_diagram: dict[int, Optional[str]] = {}
    for year, pages in year_pages.items():
        year_diag_paths = [
            path
            for pg in pages
            for path in diagrams_by_page.get(pg, [])
        ]
        year_has_diagram[year] = bool(year_diag_paths)
        year_first_diagram[year] = year_diag_paths[0] if year_diag_paths else None

    all_questions: list[Question] = []

    for year, year_text in sorted(full_text_by_year.items()):
        log.info(f"  Year {year}...")

        # Split into questions section and answer key section
        answer_match = ANSWER_BLOCK_RE.search(year_text)
        if answer_match:
            questions_text = year_text[:answer_match.start()]
            answer_text = year_text[answer_match.start():]
        else:
            questions_text = year_text
            answer_text = ""
            log.warning(f"  No answer key found for {year}")

        answer_key = parse_answer_key(answer_text)
        if subject.lower() == "commerce" and year == 2011 and len(answer_key) == 0:
            log.info("    Applying locked Commerce 2011 answer key fallback (50 answers)")
            answer_key = COMMERCE_2011_FALLBACK_ANSWERS
        log.info(f"    Answer key: {len(answer_key)} entries")

        # Split questions text into individual question blocks
        # QUESTION_START_RE.split returns: [pre_text, num1, body1, num2, body2, ...]
        question_blocks = QUESTION_START_RE.split(questions_text)
        blocks = []
        i = 1
        while i < len(question_blocks) - 1:
            q_num_str = question_blocks[i]
            q_body = question_blocks[i+1] if (i+1) < len(question_blocks) else ""
            blocks.append((q_num_str, q_body))
            i += 2

        context_buffer: Optional[str] = None
        # FIX: use year-scoped diagram presence instead of whole-PDF flag
        year_diag_present = year_has_diagram.get(year, False)
        year_diag_path = year_first_diagram.get(year)

        for q_num_str, body in blocks:
            ctx_match = CONTEXT_RE.search(body)
            if ctx_match:
                context_buffer = ctx_match.group(0).strip()

            block_text = f"{q_num_str}. {body}"

            q = parse_question_block(
                block=block_text,
                subject=subject,
                year=year,
                answer_key=answer_key,
                context_buffer=context_buffer,
                has_diagram_on_page=year_diag_present,
                diagram_local_path=year_diag_path,
            )

            if q:
                all_questions.append(q)
            else:
                log.debug(f"    Skipped unparseable block starting with q#{q_num_str}")

            # Clear context buffer once we've passed all referenced question numbers
            if context_buffer and q and q.question_number > 0:
                try:
                    ref_nums = [int(n) for n in re.findall(r'\d+', context_buffer)]
                    if ref_nums and q.question_number >= max(ref_nums):
                        context_buffer = None
                except Exception:
                    context_buffer = None

        log.info(f"    Questions parsed: {len([q for q in all_questions if q.year == year])}")

    # Report parse quality
    with_answers = [q for q in all_questions if q.correct_option]
    with_diagrams = [q for q in all_questions if q.has_diagram]
    disputed = [q for q in all_questions if q.correct_option is None]

    log.info(f"\n  SUMMARY for {subject.upper()}:")
    log.info(f"    Total questions: {len(all_questions)}")
    log.info(f"    With correct answer: {len(with_answers)}")
    log.info(f"    With diagrams: {len(with_diagrams)}")
    log.info(f"    Disputed/missing answer: {len(disputed)}")

    return all_questions

# ============================================================
# OUTPUT: JSON SEED FILES
# ============================================================

def write_json_seed(subject: str, questions: list[Question]) -> Path:
    """Write structured JSON file for a subject."""
    out_path = SEEDS_DIR / f"{subject}.json"
    data = [asdict(q) for q in questions]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log.info(f"  JSON seed → {out_path} ({len(questions)} questions)")
    return out_path

# ============================================================
# OUTPUT: SQL SEED FILE
# ============================================================

def escape_sql_string(val: Optional[str]) -> str:
    """Escape a string for a SQL literal."""
    if val is None:
        return "NULL"
    return "'" + val.replace("'", "''") + "'"

def write_sql_seed(all_questions: list[Question]) -> Path:
    """
    Write a single SQL file that INSERTs all questions.
    Uses ON CONFLICT DO NOTHING so re-running is idempotent.
    correct_option is included because this runs as service_role (migration).
    """
    out_path = SEEDS_DIR / "seed_questions.sql"

    lines = [
        "-- SJ Consulting: JAMB Question Bank Seed",
        "-- Generated by scripts/parse_jamb.py",
        "-- Run via Supabase SQL Editor as postgres/service_role",
        "-- Idempotent: ON CONFLICT DO NOTHING",
        "",
        "INSERT INTO cbt_questions",
        "    (id, subject, exam_type, year, question_number, context_text,",
        "     question_text, options, correct_option, has_diagram)",
        "VALUES",
    ]

    values = []
    for q in all_questions:
        options_json = json.dumps(q.options, ensure_ascii=False).replace("'", "''")
        context = escape_sql_string(q.context_text)
        correct = escape_sql_string(q.correct_option)

        has_diag_sql = "true" if q.has_diagram else "false"
        values.append(
            f"    ('{q.id}', {escape_sql_string(q.subject)}, 'JAMB', "
            f"{q.year}, {q.question_number}, {context},\n"
            f"     {escape_sql_string(q.question_text)},\n"
            f"     '{options_json}'::jsonb, {correct}, {has_diag_sql})"
        )

    lines.append(",\n".join(values))
    lines.append("ON CONFLICT (exam_type, subject, year, question_number) DO NOTHING;")
    lines.append("")
    lines.append(f"-- Total: {len(all_questions)} questions across {len(PDFS)} subjects")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    log.info(f"\nSQL seed → {out_path}")
    return out_path

# ============================================================
# PARSE QUALITY REPORT
# ============================================================

def write_parse_report(all_questions: list[Question]) -> None:
    """Print a quality report so you can manually review edge cases."""
    by_subject: dict[str, list[Question]] = {}
    for q in all_questions:
        by_subject.setdefault(q.subject, []).append(q)

    print("\n" + "="*60)
    print("PARSE QUALITY REPORT")
    print("="*60)

    total_missing_answer = 0
    total_missing_options = 0

    for subject, qs in sorted(by_subject.items()):
        missing_ans = [q for q in qs if q.correct_option is None]
        missing_opts = [q for q in qs if len(q.options) < 4]
        by_year = {}
        for q in qs:
            by_year.setdefault(q.year, 0)
            by_year[q.year] += 1

        print(f"\n{subject.upper()}:")
        print(f"  Total: {len(qs)}")
        print(f"  By year: {dict(sorted(by_year.items()))}")
        print(f"  Missing correct_option: {len(missing_ans)}")
        if missing_ans[:5]:
            print(f"    Examples: {[(q.year, q.question_number) for q in missing_ans[:5]]}")
        print(f"  Incomplete options (<4): {len(missing_opts)}")
        if missing_opts[:5]:
            print(f"    Examples: {[(q.year, q.question_number, list(q.options.keys())) for q in missing_opts[:5]]}")

        total_missing_answer += len(missing_ans)
        total_missing_options += len(missing_opts)

    print(f"\nTOTAL questions: {len(all_questions)}")
    print(f"TOTAL missing answer: {total_missing_answer}")
    print(f"TOTAL incomplete options: {total_missing_options}")
    print(
        "\nACTION REQUIRED: Review items above in Supabase admin panel.",
        "Questions with correct_option=NULL are excluded from grading.",
    )

# ============================================================
# ENTRYPOINT
# ============================================================

def main():
    all_questions: list[Question] = []

    for subject, pdf_path in PDFS.items():
        if not os.path.exists(pdf_path):
            log.error(f"PDF not found: {pdf_path}")
            continue
        questions = parse_subject_pdf(subject, pdf_path)
        all_questions.extend(questions)
        write_json_seed(subject, questions)

    if all_questions:
        write_sql_seed(all_questions)
        write_parse_report(all_questions)
    else:
        log.error("No questions parsed — check PDF paths and structure.")

if __name__ == "__main__":
    main()
