/**
 * SJ Consulting Platform — Authoritative UNILAG 2025/2026 Subject Combination Validator
 *
 * Implements official admission requirements across all 12 Faculties:
 * - English Language is mandatory across all courses.
 * - Strictly validates 4 UTME subjects (no duplicates, no unauthorized substitutes).
 * - Implements faculty-specific special constraints (e.g., Law restrictions, Psychology blocks).
 */

export interface ProgrammeRequirement {
  slug: string;
  name: string;
  faculty: string;
  degree: string;
  durationYears: number;
  compulsoryUtme: string[];
  electiveUtme: string[];
  electivePickCount: number;
  compulsoryOLevel: string[];
  minOLevelCredits: number;
  maxSittings: number;
  specialNotes?: string;
  track: "science" | "commercial" | "arts";
}

export interface SubjectValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  programme?: {
    slug: string;
    name: string;
    faculty: string;
    degree: string;
  };
  compulsorySubjects: string[];
  allowedElectives: string[];
  electivePickCount: number;
}

// =============================================================================
// OFFICIAL 2025/2026 UNILAG PROGRAMMES CATALOGUE
// =============================================================================

export const UNILAG_PROGRAMMES: Record<string, ProgrammeRequirement> = {
  // --- FACULTY OF ARTS ---
  "theatre-arts": {
    slug: "theatre-arts",
    name: "Theatre Arts",
    faculty: "Faculty of Arts",
    degree: "B.A.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Literature in English"],
    electiveUtme: [
      "CRS",
      "IRS",
      "French",
      "History",
      "Government",
      "Music",
      "Visual Arts",
      "Yoruba",
      "Igbo",
      "Hausa",
    ],
    electivePickCount: 2,
    compulsoryOLevel: ["English Language", "Mathematics", "Literature in English"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "arts",
  },
  "visual-arts": {
    slug: "visual-arts",
    name: "Visual Arts",
    faculty: "Faculty of Arts",
    degree: "B.A.",
    durationYears: 4,
    compulsoryUtme: ["English Language"],
    electiveUtme: [
      "Fine Arts",
      "Visual Arts",
      "Literature in English",
      "Music",
      "CRS",
      "IRS",
      "French",
      "History",
      "Government",
      "Yoruba",
      "Igbo",
    ],
    electivePickCount: 3,
    compulsoryOLevel: ["English Language", "Mathematics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "arts",
  },
  "music": {
    slug: "music",
    name: "Music",
    faculty: "Faculty of Arts",
    degree: "B.A.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Music"],
    electiveUtme: [
      "Literature in English",
      "CRS",
      "IRS",
      "French",
      "History",
      "Government",
      "Economics",
      "Chemistry",
      "Biology",
      "Further Mathematics",
      "Visual Arts",
    ],
    electivePickCount: 2,
    compulsoryOLevel: ["English Language", "Mathematics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "arts",
  },
  "english-language": {
    slug: "english-language",
    name: "English Language",
    faculty: "Faculty of Arts",
    degree: "B.A.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Literature in English"],
    electiveUtme: [
      "CRS",
      "IRS",
      "French",
      "History",
      "Government",
      "Yoruba",
      "Igbo",
      "Hausa",
    ],
    electivePickCount: 2,
    compulsoryOLevel: ["English Language", "Mathematics", "Literature in English"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "arts",
  },
  "history-and-strategic-studies": {
    slug: "history-and-strategic-studies",
    name: "History & Strategic Studies",
    faculty: "Faculty of Arts",
    degree: "B.A.",
    durationYears: 4,
    compulsoryUtme: ["English Language"],
    electiveUtme: [
      "History",
      "Government",
      "Literature in English",
      "CRS",
      "IRS",
      "French",
      "Economics",
      "Geography",
    ],
    electivePickCount: 3,
    compulsoryOLevel: ["English Language", "Mathematics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "UTME combination must include History and/or Government.",
    track: "arts",
  },
  "philosophy": {
    slug: "philosophy",
    name: "Philosophy",
    faculty: "Faculty of Arts",
    degree: "B.A.",
    durationYears: 4,
    compulsoryUtme: ["English Language"],
    electiveUtme: [
      "Literature in English",
      "CRS",
      "IRS",
      "French",
      "History",
      "Government",
      "Economics",
      "Geography",
      "Chemistry",
      "Physics",
      "Biology",
    ],
    electivePickCount: 3,
    compulsoryOLevel: ["English Language", "Mathematics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "arts",
  },
  "christian-religious-studies": {
    slug: "christian-religious-studies",
    name: "Christian Religious Studies",
    faculty: "Faculty of Arts",
    degree: "B.A.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "CRS"],
    electiveUtme: [
      "Literature in English",
      "History",
      "Government",
      "French",
      "Yoruba",
      "Igbo",
      "Hausa",
      "Visual Arts",
      "Economics",
      "Commerce",
    ],
    electivePickCount: 2,
    compulsoryOLevel: ["English Language", "Mathematics", "CRS"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "arts",
  },
  "islamic-studies": {
    slug: "islamic-studies",
    name: "Islamic Studies",
    faculty: "Faculty of Arts",
    degree: "B.A.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Islamic Studies"],
    electiveUtme: [
      "Literature in English",
      "History",
      "Government",
      "French",
      "Yoruba",
      "Igbo",
      "Visual Arts",
      "Economics",
      "Commerce",
    ],
    electivePickCount: 2,
    compulsoryOLevel: ["English Language", "Mathematics", "Islamic Studies"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "arts",
  },

  // --- BASIC MEDICAL & CLINICAL SCIENCES ---
  "medicine-and-surgery": {
    slug: "medicine-and-surgery",
    name: "Medicine and Surgery",
    faculty: "Faculty of Clinical Sciences",
    degree: "MBBS",
    durationYears: 6,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 1,
    specialNotes: "UNILAG strictly enforces ONE SITTING for Medicine and Surgery.",
    track: "science",
  },
  "nursing-science": {
    slug: "nursing-science",
    name: "Nursing Science",
    faculty: "Faculty of Clinical Sciences",
    degree: "B.N.Sc.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 1,
    specialNotes: "UNILAG strictly enforces ONE SITTING for Nursing Science.",
    track: "science",
  },
  "dentistry": {
    slug: "dentistry",
    name: "Dentistry",
    faculty: "Faculty of Dental Sciences",
    degree: "BDS",
    durationYears: 6,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "pharmacy": {
    slug: "pharmacy",
    name: "Pharmacy",
    faculty: "Faculty of Pharmacy",
    degree: "B.Pharm",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "pharmacology": {
    slug: "pharmacology",
    name: "Pharmacology",
    faculty: "Faculty of Basic Medical Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "physiology": {
    slug: "physiology",
    name: "Physiology",
    faculty: "Faculty of Basic Medical Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "medical-laboratory-science": {
    slug: "medical-laboratory-science",
    name: "Medical Laboratory Science",
    faculty: "Faculty of Basic Medical Sciences",
    degree: "B.MLS",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "physiotherapy": {
    slug: "physiotherapy",
    name: "Physiotherapy",
    faculty: "Faculty of Clinical Sciences",
    degree: "B.Pt.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "radiography": {
    slug: "radiography",
    name: "Radiography",
    faculty: "Faculty of Clinical Sciences",
    degree: "B.Sc.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },

  // --- FACULTY OF ENGINEERING ---
  "mechanical-engineering": {
    slug: "mechanical-engineering",
    name: "Mechanical Engineering",
    faculty: "Faculty of Engineering",
    degree: "B.Sc.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Mathematics", "Physics", "Chemistry"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Further Mathematics", "Physics", "Chemistry"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "Requires Further Mathematics credit at O'Level.",
    track: "science",
  },
  "computer-engineering": {
    slug: "computer-engineering",
    name: "Computer Engineering",
    faculty: "Faculty of Engineering",
    degree: "B.Sc.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Mathematics", "Physics", "Chemistry"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Further Mathematics", "Physics", "Chemistry"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "Requires Further Mathematics credit at O'Level.",
    track: "science",
  },
  "electrical-electronics-engineering": {
    slug: "electrical-electronics-engineering",
    name: "Electrical & Electronics Engineering",
    faculty: "Faculty of Engineering",
    degree: "B.Sc.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Mathematics", "Physics", "Chemistry"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Further Mathematics", "Physics", "Chemistry"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "Requires Further Mathematics credit at O'Level.",
    track: "science",
  },
  "civil-and-environmental-engineering": {
    slug: "civil-and-environmental-engineering",
    name: "Civil & Environmental Engineering",
    faculty: "Faculty of Engineering",
    degree: "B.Sc.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Mathematics", "Physics", "Chemistry"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Further Mathematics", "Physics", "Chemistry"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "Requires Further Mathematics credit at O'Level.",
    track: "science",
  },
  "chemical-engineering": {
    slug: "chemical-engineering",
    name: "Chemical Engineering",
    faculty: "Faculty of Engineering",
    degree: "B.Sc.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Mathematics", "Physics", "Chemistry"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Further Mathematics", "Physics", "Chemistry"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "Requires Further Mathematics credit at O'Level.",
    track: "science",
  },
  "systems-engineering": {
    slug: "systems-engineering",
    name: "Systems Engineering",
    faculty: "Faculty of Engineering",
    degree: "B.Sc.",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Mathematics", "Physics", "Chemistry"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Further Mathematics", "Physics", "Chemistry"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "Requires Further Mathematics credit at O'Level.",
    track: "science",
  },

  // --- FACULTY OF LAW ---
  "law": {
    slug: "law",
    name: "Law",
    faculty: "Faculty of Law",
    degree: "LL.B",
    durationYears: 5,
    compulsoryUtme: ["English Language", "Literature in English"],
    electiveUtme: [
      "CRS",
      "IRS",
      "History",
      "Government",
      "Economics",
      "Commerce",
      "French",
      "Geography",
    ],
    electivePickCount: 2,
    compulsoryOLevel: ["English Language", "Mathematics", "Literature in English"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes:
      "UNILAG Law does NOT accept Music, Fine Arts, or Principles of Accounting. Accepts either Economics or Commerce, but NOT both.",
    track: "arts",
  },

  // --- FACULTY OF MANAGEMENT SCIENCES ---
  "accounting": {
    slug: "accounting",
    name: "Accounting",
    faculty: "Faculty of Management Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Mathematics", "Economics"],
    electiveUtme: [
      "Financial Accounting",
      "Further Mathematics",
      "Geography",
      "Government",
      "Literature in English",
      "Biology",
    ],
    electivePickCount: 1,
    compulsoryOLevel: ["English Language", "Mathematics", "Economics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "commercial",
  },
  "business-administration": {
    slug: "business-administration",
    name: "Business Administration",
    faculty: "Faculty of Management Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Mathematics", "Economics"],
    electiveUtme: [
      "Commerce",
      "Financial Accounting",
      "Government",
      "Geography",
      "CRS",
      "IRS",
      "Biology",
      "Chemistry",
      "Physics",
    ],
    electivePickCount: 1,
    compulsoryOLevel: ["English Language", "Mathematics", "Economics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "commercial",
  },
  "banking-and-finance": {
    slug: "banking-and-finance",
    name: "Banking & Finance",
    faculty: "Faculty of Management Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Mathematics", "Economics"],
    electiveUtme: [
      "Commerce",
      "Financial Accounting",
      "Government",
      "Geography",
      "Biology",
      "Chemistry",
      "Physics",
    ],
    electivePickCount: 1,
    compulsoryOLevel: ["English Language", "Mathematics", "Economics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "commercial",
  },
  "actuarial-science": {
    slug: "actuarial-science",
    name: "Actuarial Science",
    faculty: "Faculty of Management Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Mathematics", "Economics"],
    electiveUtme: [
      "Geography",
      "Government",
      "Biology",
      "Chemistry",
      "Physics",
      "Commerce",
    ],
    electivePickCount: 1,
    compulsoryOLevel: ["English Language", "Mathematics", "Economics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "commercial",
  },

  // --- FACULTY OF SCIENCE ---
  "computer-science": {
    slug: "computer-science",
    name: "Computer Science",
    faculty: "Faculty of Science",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Mathematics", "Physics"],
    electiveUtme: ["Chemistry", "Biology"],
    electivePickCount: 1,
    compulsoryOLevel: ["English Language", "Mathematics", "Further Mathematics", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "Requires Further Mathematics credit at O'Level.",
    track: "science",
  },
  "data-science": {
    slug: "data-science",
    name: "Data Science",
    faculty: "Faculty of Science",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Mathematics", "Physics"],
    electiveUtme: ["Chemistry", "Biology", "Economics", "Geography"],
    electivePickCount: 1,
    compulsoryOLevel: ["English Language", "Mathematics", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "biochemistry": {
    slug: "biochemistry",
    name: "Biochemistry",
    faculty: "Faculty of Science",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "microbiology": {
    slug: "microbiology",
    name: "Microbiology",
    faculty: "Faculty of Science",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Biology", "Chemistry", "Physics"],
    electiveUtme: [],
    electivePickCount: 0,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology", "Chemistry", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "science",
  },
  "mathematics": {
    slug: "mathematics",
    name: "Mathematics",
    faculty: "Faculty of Science",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Mathematics", "Physics"],
    electiveUtme: ["Chemistry", "Economics", "Biology", "Geography"],
    electivePickCount: 1,
    compulsoryOLevel: ["English Language", "Mathematics", "Further Mathematics", "Physics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "Requires Further Mathematics credit at O'Level.",
    track: "science",
  },

  // --- FACULTY OF SOCIAL SCIENCES ---
  "economics": {
    slug: "economics",
    name: "Economics",
    faculty: "Faculty of Social Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Mathematics", "Economics"],
    electiveUtme: [
      "Commerce",
      "Financial Accounting",
      "Government",
      "Geography",
      "Biology",
      "Physics",
      "Chemistry",
      "Literature in English",
      "CRS",
      "IRS",
    ],
    electivePickCount: 1,
    compulsoryOLevel: ["English Language", "Mathematics", "Economics"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "commercial",
  },
  "mass-communication": {
    slug: "mass-communication",
    name: "Mass Communication",
    faculty: "Faculty of Social Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Literature in English"],
    electiveUtme: [
      "Economics",
      "Government",
      "History",
      "CRS",
      "IRS",
      "Geography",
      "French",
      "Yoruba",
      "Igbo",
      "Commerce",
      "Civic Education",
    ],
    electivePickCount: 2,
    compulsoryOLevel: ["English Language", "Mathematics", "Literature in English"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "arts",
  },
  "political-science": {
    slug: "political-science",
    name: "Political Science",
    faculty: "Faculty of Social Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language", "Government"],
    electiveUtme: [
      "Economics",
      "Geography",
      "History",
      "Literature in English",
      "CRS",
      "IRS",
    ],
    electivePickCount: 2,
    compulsoryOLevel: ["English Language", "Mathematics", "Government"],
    minOLevelCredits: 5,
    maxSittings: 2,
    track: "commercial",
  },
  "psychology": {
    slug: "psychology",
    name: "Psychology",
    faculty: "Faculty of Social Sciences",
    degree: "B.Sc.",
    durationYears: 4,
    compulsoryUtme: ["English Language"],
    electiveUtme: [
      "Mathematics",
      "Biology",
      "Physics",
      "Chemistry",
      "Economics",
      "Government",
      "Literature in English",
    ],
    electivePickCount: 3,
    compulsoryOLevel: ["English Language", "Mathematics", "Biology"],
    minOLevelCredits: 5,
    maxSittings: 2,
    specialNotes: "UNILAG Psychology does NOT accept Commerce, CRS/IRS, or Financial Accounting.",
    track: "science",
  },
};

// =============================================================================
// VALIDATION LOGIC
// =============================================================================

function normalizeSubject(subj: string): string {
  const s = subj.trim().toLowerCase();
  if (s.includes("english") && !s.includes("literature")) return "English Language";
  if (s.includes("literature")) return "Literature in English";
  if (s.includes("further math")) return "Further Mathematics";
  if (s === "math" || s.includes("mathematics")) return "Mathematics";
  if (s.includes("accounting") || s.includes("principles of account")) return "Financial Accounting";
  if (s.includes("commerce")) return "Commerce";
  if (s.includes("economics")) return "Economics";
  if (s.includes("government")) return "Government";
  if (s.includes("biology")) return "Biology";
  if (s.includes("chemistry")) return "Chemistry";
  if (s.includes("physics")) return "Physics";
  if (s.includes("geography")) return "Geography";
  if (s.includes("crs") || s.includes("christian")) return "CRS";
  if (s.includes("irs") || s.includes("islamic")) return "IRS";
  if (s.includes("french")) return "French";
  if (s.includes("history")) return "History";
  if (s.includes("music")) return "Music";
  if (s.includes("fine art") || s.includes("visual art")) return "Visual Arts";
  if (s.includes("civic")) return "Civic Education";
  return subj.trim();
}

/**
 * Validates a candidate's 4 UTME subjects against UNILAG 2025/2026 official requirements.
 */
export function validateSubjectCombination(params: {
  programmeSlug: string;
  subjects: string[];
}): SubjectValidationResult {
  const { programmeSlug, subjects } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  const prog = UNILAG_PROGRAMMES[programmeSlug];
  if (!prog) {
    return {
      isValid: false,
      errors: [`Unknown programme slug '${programmeSlug}'.`],
      warnings: [],
      compulsorySubjects: [],
      allowedElectives: [],
      electivePickCount: 0,
    };
  }

  // 1. Basic Count check
  if (!Array.isArray(subjects) || subjects.length !== 4) {
    errors.push(`UTME requires exactly 4 subjects. You provided ${subjects?.length ?? 0}.`);
  }

  // 2. Normalize and check uniqueness
  const normalized = (subjects || []).map(normalizeSubject);
  const uniqueSet = new Set(normalized);
  if (uniqueSet.size !== normalized.length) {
    errors.push("Duplicate subjects detected. All 4 UTME subjects must be distinct.");
  }

  // 3. Universal Rule: English Language is mandatory
  if (!uniqueSet.has("English Language")) {
    errors.push("English Language is compulsory for all UTME candidate registrations.");
  }

  // 4. Compulsory Subjects Check
  for (const comp of prog.compulsoryUtme) {
    if (!uniqueSet.has(comp)) {
      errors.push(`${prog.name} strictly requires ${comp} in your UTME combination.`);
    }
  }

  // 5. Electives Check
  if (prog.electiveUtme.length > 0 && prog.electivePickCount > 0) {
    const matchedElectives = prog.electiveUtme.filter((e) => uniqueSet.has(e));
    if (matchedElectives.length < prog.electivePickCount) {
      errors.push(
        `${prog.name} requires at least ${prog.electivePickCount} subject(s) from: ${prog.electiveUtme.join(
          ", "
        )}. You matched ${matchedElectives.length}.`
      );
    }
  }

  // 6. Programme-Specific Special Constraints
  if (prog.slug === "law") {
    // Law: cannot take both Economics and Commerce
    if (uniqueSet.has("Economics") && uniqueSet.has("Commerce")) {
      errors.push("UNILAG Faculty of Law accepts either Economics or Commerce, but NOT both.");
    }
    // Law: does not accept Music, Fine Arts, Principles of Accounting
    if (uniqueSet.has("Music") || uniqueSet.has("Visual Arts") || uniqueSet.has("Financial Accounting")) {
      errors.push("UNILAG Faculty of Law does not accept Music, Fine/Visual Arts, or Principles of Accounting.");
    }
  }

  if (prog.slug === "psychology") {
    if (uniqueSet.has("Commerce") || uniqueSet.has("CRS") || uniqueSet.has("IRS") || uniqueSet.has("Financial Accounting")) {
      errors.push("UNILAG Psychology does not accept Commerce, CRS/IRS, or Financial Accounting.");
    }
  }

  if (prog.specialNotes) {
    warnings.push(prog.specialNotes);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    programme: {
      slug: prog.slug,
      name: prog.name,
      faculty: prog.faculty,
      degree: prog.degree,
    },
    compulsorySubjects: prog.compulsoryUtme,
    allowedElectives: prog.electiveUtme,
    electivePickCount: prog.electivePickCount,
  };
}

/**
 * Returns all programmes for a given track (science, commercial, arts)
 */
export function getProgrammesByTrack(track: "science" | "commercial" | "arts"): ProgrammeRequirement[] {
  return Object.values(UNILAG_PROGRAMMES).filter((p) => p.track === track);
}

/**
 * Returns all programmes for a given faculty
 */
export function getProgrammesByFaculty(faculty: string): ProgrammeRequirement[] {
  return Object.values(UNILAG_PROGRAMMES).filter((p) => p.faculty.toLowerCase() === faculty.toLowerCase());
}
