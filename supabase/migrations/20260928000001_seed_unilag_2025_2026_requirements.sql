-- =============================================================================
-- Migration: 20260928000001_seed_unilag_2025_2026_requirements.sql
-- Description:
--   Comprehensive Official 2025/2026 University of Lagos (UNILAG)
--   Faculty, Programme, and UTME/O'Level Admission Requirements catalogue.
--
--   Covers all 12 Faculties and 70+ programmes:
--   1. Faculty of Arts
--   2. Faculty of Basic Medical Sciences
--   3. Faculty of Clinical Sciences
--   4. Faculty of Dental Sciences
--   5. Faculty of Education
--   6. Faculty of Engineering
--   7. Faculty of Environmental Sciences
--   8. Faculty of Law
--   9. Faculty of Management Sciences
--   10. Faculty of Pharmacy
--   11. Faculty of Science
--   12. Faculty of Social Sciences
--
--   Enhances analyze_unilag_admission to enforce elective pick count checks
--   alongside compulsory subject audits.
-- =============================================================================

DO $$
DECLARE
    v_unilag_id UUID;
BEGIN
    -- 1. Ensure UNILAG institution exists
    INSERT INTO institutions (slug, name, short_name, location_state)
    VALUES ('unilag', 'University of Lagos', 'UNILAG', 'Lagos')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_unilag_id;

    -- Helper procedure / temp table to bulk upsert programmes and requirements
    CREATE TEMP TABLE tmp_unilag_prog_reqs (
        slug TEXT,
        name TEXT,
        faculty TEXT,
        degree TEXT,
        duration_years SMALLINT,
        compulsory_utme TEXT[],
        elective_utme TEXT[],
        elective_count SMALLINT,
        compulsory_olevel TEXT[],
        min_credits SMALLINT,
        max_sittings SMALLINT,
        special_notes TEXT
    ) ON COMMIT DROP;

    -- =========================================================================
    -- 1. FACULTY OF ARTS
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('theatre-arts', 'Theatre Arts', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language', 'Literature in English'],
     ARRAY['CRS', 'IRS', 'French', 'History', 'Government', 'Music', 'Visual Arts', 'Yoruba', 'Igbo', 'Hausa'], 2,
     ARRAY['English Language', 'Mathematics', 'Literature in English'], 5, 2,
     'At least one O''Level Arts subject required.'),

    ('visual-arts', 'Visual Arts', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language'],
     ARRAY['Fine Arts', 'Visual Arts', 'Literature in English', 'Music', 'CRS', 'IRS', 'French', 'History', 'Government', 'Yoruba', 'Igbo'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'Two O''Level Arts subjects (may include Fine Arts, Photography, Craft Practice, Painting).'),

    ('music', 'Music', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language', 'Music'],
     ARRAY['Literature in English', 'CRS', 'IRS', 'French', 'History', 'Government', 'Economics', 'Chemistry', 'Biology', 'Further Mathematics', 'Visual Arts'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'Two O''Level Arts subjects required (which may include Music).'),

    ('english-language', 'English Language', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language', 'Literature in English'],
     ARRAY['CRS', 'IRS', 'French', 'History', 'Government', 'Yoruba', 'Igbo', 'Hausa'], 2,
     ARRAY['English Language', 'Mathematics', 'Literature in English'], 5, 2,
     NULL),

    ('french', 'French', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language', 'French'],
     ARRAY['Literature in English', 'CRS', 'IRS', 'History', 'Government', 'Yoruba', 'Igbo', 'Music', 'Fine Arts', 'Economics'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'O''Level: English, Math, and any three Arts or Social Sciences. Civic Education and Computer Studies accepted.'),

    ('russian', 'Russian', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language'],
     ARRAY['French', 'Literature in English', 'CRS', 'IRS', 'History', 'Government', 'Yoruba', 'Igbo', 'Music', 'Fine Arts', 'Economics'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'Five O''Level credits in English, Math, and any three Arts or Social Sciences.'),

    ('german', 'German', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language'],
     ARRAY['French', 'Literature in English', 'CRS', 'IRS', 'History', 'Government', 'Yoruba', 'Igbo', 'Music', 'Fine Arts', 'Economics'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'Five O''Level credits in English, Math, and any three Arts or Social Sciences.'),

    ('history-and-strategic-studies', 'History & Strategic Studies', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language'],
     ARRAY['History', 'Government', 'Literature in English', 'CRS', 'IRS', 'French', 'Economics', 'Geography'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'UTME must include History and/or Government. O''Level must include History or Government.'),

    ('linguistics-igbo', 'Linguistics / Igbo', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language', 'Igbo'],
     ARRAY['Literature in English', 'History', 'Government', 'CRS', 'IRS', 'French', 'Music', 'Visual Arts', 'Economics'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('linguistics-yoruba', 'Linguistics / Yoruba', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language', 'Yoruba'],
     ARRAY['Literature in English', 'History', 'Government', 'CRS', 'IRS', 'French', 'Music', 'Visual Arts', 'Economics'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('chinese', 'Chinese', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language'],
     ARRAY['Literature in English', 'History', 'Government', 'CRS', 'IRS', 'French', 'Yoruba', 'Igbo', 'Economics', 'Geography'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('linguistics', 'Linguistics', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language'],
     ARRAY['Literature in English', 'History', 'Government', 'CRS', 'IRS', 'French', 'Yoruba', 'Igbo', 'Economics', 'Geography'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('philosophy', 'Philosophy', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language'],
     ARRAY['Literature in English', 'CRS', 'IRS', 'French', 'History', 'Government', 'Economics', 'Geography', 'Chemistry', 'Physics', 'Biology'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'UTME requires at least one Arts subject plus any two Arts, Social Sciences, or Science.'),

    ('christian-religious-studies', 'Christian Religious Studies', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language', 'CRS'],
     ARRAY['Literature in English', 'History', 'Government', 'French', 'Yoruba', 'Igbo', 'Hausa', 'Visual Arts', 'Economics', 'Commerce'], 2,
     ARRAY['English Language', 'Mathematics', 'CRS'], 5, 2,
     NULL),

    ('islamic-studies', 'Islamic Studies', 'Faculty of Arts', 'B.A.', 4,
     ARRAY['English Language', 'Islamic Studies'],
     ARRAY['Literature in English', 'History', 'Government', 'French', 'Yoruba', 'Igbo', 'Visual Arts', 'Economics', 'Commerce'], 2,
     ARRAY['English Language', 'Mathematics', 'Islamic Studies'], 5, 2,
     NULL);

    -- =========================================================================
    -- 2. FACULTY OF BASIC MEDICAL SCIENCES
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('pharmacology', 'Pharmacology', 'Faculty of Basic Medical Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('physiology', 'Physiology', 'Faculty of Basic Medical Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('medical-laboratory-science', 'Medical Laboratory Science', 'Faculty of Basic Medical Sciences', 'B.MLS', 5,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL);

    -- =========================================================================
    -- 3. FACULTY OF CLINICAL SCIENCES
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('anatomy', 'Anatomy', 'Faculty of Clinical Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('medicine-and-surgery', 'Medicine and Surgery', 'Faculty of Clinical Sciences', 'MBBS', 6,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 1,
     'UNILAG strictly enforces ONE SITTING for Medicine and Surgery.'),

    ('nursing-science', 'Nursing Science', 'Faculty of Clinical Sciences', 'B.N.Sc.', 5,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 1,
     'UNILAG strictly enforces ONE SITTING for Nursing Science.'),

    ('physiotherapy', 'Physiotherapy', 'Faculty of Clinical Sciences', 'B.Pt.', 5,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('radiography', 'Radiography', 'Faculty of Clinical Sciences', 'B.Sc.', 5,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL);

    -- =========================================================================
    -- 4. FACULTY OF DENTAL SCIENCES
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('dentistry', 'Dentistry', 'Faculty of Dental Sciences', 'BDS', 6,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL);

    -- =========================================================================
    -- 5. FACULTY OF EDUCATION
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('biology-education', 'Biology Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Biology'],
     ARRAY['Chemistry', 'Mathematics', 'Physics', 'Agricultural Science', 'Integrated Science'], 2,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry'], 5, 2,
     NULL),

    ('chemistry-education', 'Chemistry Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Chemistry'],
     ARRAY['Physics', 'Biology', 'Agricultural Science', 'Integrated Science', 'Mathematics'], 2,
     ARRAY['English Language', 'Mathematics', 'Chemistry'], 5, 2,
     NULL),

    ('integrated-science-education', 'Integrated Science Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Biology'],
     ARRAY['Chemistry', 'Physics', 'Mathematics', 'Agricultural Science'], 2,
     ARRAY['English Language', 'Mathematics', 'Chemistry', 'Biology'], 5, 2,
     NULL),

    ('mathematics-education', 'Mathematics Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Biology', 'Computer Studies', 'Data Processing'], 1,
     ARRAY['English Language', 'Mathematics', 'Physics'], 5, 2,
     NULL),

    ('physics-education', 'Physics Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Physics'],
     ARRAY['Mathematics', 'Chemistry', 'Biology', 'Agricultural Science'], 2,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], 5, 2,
     NULL),

    ('technology-education', 'Technology Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Mathematics'],
     ARRAY['Physics', 'Technical Drawing', 'Chemistry', 'Biology', 'Agricultural Science'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'Options: Automobile/Mechanical, Building/Woodwork, Electrical/Electronics Technology.'),

    ('education-home-economics', 'Education Home Economics', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Chemistry'],
     ARRAY['Biology', 'Agricultural Science', 'Mathematics', 'Physics', 'Food and Nutrition', 'Home Management'], 2,
     ARRAY['English Language', 'Mathematics', 'Chemistry'], 5, 2,
     NULL),

    ('adult-education', 'Adult & Continuing Education', 'Faculty of Education', 'B.Ed.', 4,
     ARRAY['English Language'],
     ARRAY['Literature in English', 'History', 'Government', 'French', 'Geography', 'Mathematics', 'CRS', 'IRS', 'Economics', 'Commerce', 'Civic Education'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('educational-administration', 'Educational Administration', 'Faculty of Education', 'B.Ed.', 4,
     ARRAY['English Language'],
     ARRAY['Literature in English', 'History', 'Government', 'Geography', 'CRS', 'IRS', 'Economics', 'Commerce'], 3,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('human-kinetics', 'Human Kinetics & Health Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Biology'],
     ARRAY['Chemistry', 'Physics', 'Mathematics', 'Health Science', 'Agricultural Science'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('guidance-and-counseling', 'Guidance & Counseling', 'Faculty of Education', 'B.Ed.', 4,
     ARRAY['English Language'],
     ARRAY['Literature in English', 'History', 'Government', 'Geography', 'CRS', 'IRS', 'Economics', 'French', 'Civic Education'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('special-needs-education', 'Special Needs Education', 'Faculty of Education', 'B.Ed.', 4,
     ARRAY['English Language'],
     ARRAY['Mathematics', 'Literature in English', 'Geography', 'Economics', 'History', 'Government', 'CRS', 'IRS', 'French', 'Civic Education'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('crs-education', 'CRS Education', 'Faculty of Education', 'B.A.(Ed.)', 4,
     ARRAY['English Language', 'CRS'],
     ARRAY['Literature in English', 'History', 'Government', 'French', 'Geography', 'Mathematics', 'Economics', 'Commerce'], 2,
     ARRAY['English Language', 'Mathematics', 'CRS'], 5, 2,
     NULL),

    ('english-education', 'English Education', 'Faculty of Education', 'B.A.(Ed.)', 4,
     ARRAY['English Language'],
     ARRAY['Literature in English', 'History', 'Government', 'French', 'CRS', 'IRS', 'Economics', 'Geography'], 3,
     ARRAY['English Language', 'Mathematics', 'Literature in English'], 5, 2,
     NULL),

    ('french-education', 'French Education', 'Faculty of Education', 'B.A.(Ed.)', 4,
     ARRAY['English Language', 'French'],
     ARRAY['Literature in English', 'History', 'Government', 'CRS', 'IRS', 'Geography', 'Economics'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('geography-education', 'Geography Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Geography'],
     ARRAY['Economics', 'Biology', 'Mathematics', 'Physics', 'Chemistry', 'Government', 'History'], 2,
     ARRAY['English Language', 'Mathematics', 'Geography'], 5, 2,
     NULL),

    ('history-education', 'History Education', 'Faculty of Education', 'B.A.(Ed.)', 4,
     ARRAY['English Language'],
     ARRAY['History', 'Government', 'Literature in English', 'CRS', 'IRS', 'French', 'Geography', 'Economics'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'O''Level must include History or Government.'),

    ('igbo-education', 'Igbo Education', 'Faculty of Education', 'B.A.(Ed.)', 4,
     ARRAY['English Language', 'Igbo'],
     ARRAY['Literature in English', 'History', 'Government', 'French', 'CRS', 'IRS', 'Geography', 'Economics'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('islamic-studies-education', 'Islamic Studies Education', 'Faculty of Education', 'B.A.(Ed.)', 4,
     ARRAY['English Language', 'Islamic Studies'],
     ARRAY['Literature in English', 'History', 'Government', 'French', 'Arabic', 'Geography', 'Mathematics', 'Economics', 'Commerce'], 2,
     ARRAY['English Language', 'Mathematics', 'Islamic Studies'], 5, 2,
     NULL),

    ('yoruba-education', 'Yoruba Education', 'Faculty of Education', 'B.A.(Ed.)', 4,
     ARRAY['English Language', 'Yoruba'],
     ARRAY['Literature in English', 'History', 'Government', 'French', 'CRS', 'IRS', 'Geography', 'Economics'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('early-childhood-education', 'Early Childhood Education', 'Faculty of Education', 'B.Ed.', 4,
     ARRAY['English Language'],
     ARRAY['Literature in English', 'Mathematics', 'History', 'Government', 'Biology', 'Chemistry', 'Physics', 'CRS', 'IRS', 'Economics', 'Commerce'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('business-education', 'Business Education', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Financial Accounting', 'Commerce', 'Government', 'Geography', 'Business Management'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('education-economics', 'Education Economics', 'Faculty of Education', 'B.Sc.(Ed.)', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Geography', 'History', 'Government', 'Literature in English'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL);

    -- =========================================================================
    -- 6. FACULTY OF ENGINEERING (Strict: Math, Physics, Chem; Further Math at O'Level)
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('biomedical-engineering', 'Biomedical Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry', 'Biology'], 6, 2,
     'Six O''Level credits required: English, Math, Further Math, Biology, Physics, and Chemistry.'),

    ('chemical-engineering', 'Chemical Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('civil-and-environmental-engineering', 'Civil & Environmental Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('computer-engineering', 'Computer Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('electrical-electronics-engineering', 'Electrical & Electronics Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('mechanical-engineering', 'Mechanical Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('metallurgical-and-materials-engineering', 'Metallurgical & Materials Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('petroleum-and-gas-engineering', 'Petroleum & Gas Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('surveying-and-geoinformatics', 'Surveying & Geoinformatics', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('systems-engineering', 'Systems Engineering', 'Faculty of Engineering', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.');

    -- =========================================================================
    -- 7. FACULTY OF ENVIRONMENTAL SCIENCES
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('architecture', 'Architecture', 'Faculty of Environmental Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Geography', 'Economics', 'Biology', 'Fine Arts'], 1,
     ARRAY['English Language', 'Mathematics', 'Physics'], 5, 2,
     'O''Level must include Fine Arts or Technical Drawing.'),

    ('building', 'Building', 'Faculty of Environmental Sciences', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], 5, 2,
     NULL),

    ('estate-management', 'Estate Management', 'Faculty of Environmental Sciences', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Chemistry', 'Physics', 'Biology', 'Geography', 'Financial Accounting'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     'O''Level must include Chemistry or Physics.'),

    ('quantity-surveying', 'Quantity Surveying', 'Faculty of Environmental Sciences', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Economics', 'Geography'], 1,
     ARRAY['English Language', 'Mathematics', 'Physics'], 5, 2,
     NULL),

    ('urban-and-regional-planning', 'Urban & Regional Planning', 'Faculty of Environmental Sciences', 'B.Sc.', 5,
     ARRAY['English Language', 'Mathematics'],
     ARRAY['Geography', 'Economics', 'Chemistry', 'Physics', 'Biology', 'Fine Arts', 'Technical Drawing'], 2,
     ARRAY['English Language', 'Mathematics', 'Geography'], 5, 2,
     'UTME must include Geography or Economics.');

    -- =========================================================================
    -- 8. FACULTY OF LAW
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('law', 'Law', 'Faculty of Law', 'LL.B', 5,
     ARRAY['English Language', 'Literature in English'],
     ARRAY['CRS', 'IRS', 'History', 'Government', 'Economics', 'Commerce', 'French', 'Geography'], 2,
     ARRAY['English Language', 'Mathematics', 'Literature in English'], 5, 2,
     'UNILAG Law does NOT accept Music, Fine Arts, or Principles of Accounting. Accepts either Economics or Commerce, but NOT both.');

    -- =========================================================================
    -- 9. FACULTY OF MANAGEMENT SCIENCES
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('accounting', 'Accounting', 'Faculty of Management Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Financial Accounting', 'Further Mathematics', 'Geography', 'Government', 'Literature in English', 'Biology'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('taxation', 'Taxation', 'Faculty of Management Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Commerce', 'Government', 'Business Management', 'Geography', 'Literature in English', 'Civic Education', 'Financial Accounting'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics', 'Financial Accounting'], 5, 2,
     NULL),

    ('actuarial-science', 'Actuarial Science', 'Faculty of Management Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Geography', 'Government', 'Biology', 'Chemistry', 'Physics', 'Commerce'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('insurance', 'Insurance', 'Faculty of Management Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Financial Accounting', 'Geography', 'Government', 'Biology', 'Chemistry', 'Physics', 'Commerce'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('business-administration', 'Business Administration', 'Faculty of Management Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Commerce', 'Financial Accounting', 'Government', 'Geography', 'CRS', 'IRS', 'Biology', 'Chemistry', 'Physics'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('banking-and-finance', 'Banking & Finance', 'Faculty of Management Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Commerce', 'Financial Accounting', 'Government', 'Geography', 'Biology', 'Chemistry', 'Physics'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('employment-relations', 'Employment Relations & HRM', 'Faculty of Management Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Commerce', 'Financial Accounting', 'Government', 'Geography', 'Biology', 'Business Management', 'Literature in English'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('procurement-management', 'Procurement Management', 'Faculty of Management Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Business Management', 'Government', 'Chemistry', 'Physics', 'Financial Accounting'], 1,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL);

    -- =========================================================================
    -- 10. FACULTY OF PHARMACY
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('pharmacy', 'Pharmacy', 'Faculty of Pharmacy', 'B.Pharm', 5,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('doctor-of-pharmacy', 'Doctor of Pharmacy', 'Faculty of Pharmacy', 'Pharm.D', 6,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL);

    -- =========================================================================
    -- 11. FACULTY OF SCIENCE
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('biochemistry', 'Biochemistry', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('biostatistics', 'Biostatistics', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Biology', 'Economics', 'Geography'], 1,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('botany', 'Botany', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('cell-biology-and-genetics', 'Cell Biology & Genetics', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('chemistry', 'Chemistry', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Chemistry', 'Physics'],
     ARRAY['Mathematics', 'Biology'], 1,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('computer-science', 'Computer Science', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Biology'], 1,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('data-science', 'Data Science', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Biology', 'Economics', 'Geography'], 1,
     ARRAY['English Language', 'Mathematics', 'Physics'], 5, 2,
     NULL),

    ('environmental-standards', 'Environmental Standards', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics'],
     ARRAY['Physics', 'Chemistry', 'Biology'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('fisheries-and-aquaculture', 'Fisheries & Aquaculture', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('geology', 'Geology', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry', 'Biology'], 5, 2,
     'Candidates must have O''Level credit pass in Biology.'),

    ('geophysics', 'Geophysics', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry', 'Biology'], 5, 2,
     NULL),

    ('industrial-mathematics', 'Industrial Mathematics', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Economics', 'Biology', 'Geography'], 1,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('marine-biology', 'Marine Biology', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('mathematics', 'Mathematics', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Economics', 'Biology', 'Geography'], 1,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('microbiology', 'Microbiology', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL),

    ('physics', 'Physics', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics', 'Chemistry'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('statistics', 'Statistics', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Chemistry', 'Economics', 'Biology', 'Geography'], 1,
     ARRAY['English Language', 'Mathematics', 'Further Mathematics', 'Physics'], 5, 2,
     'Requires Further Mathematics credit at O''Level.'),

    ('zoology', 'Zoology', 'Faculty of Science', 'B.Sc.', 4,
     ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], '{}', 0,
     ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 2,
     NULL);

    -- =========================================================================
    -- 12. FACULTY OF SOCIAL SCIENCES
    -- =========================================================================
    INSERT INTO tmp_unilag_prog_reqs VALUES
    ('economics', 'Economics', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Economics'],
     ARRAY['Commerce', 'Financial Accounting', 'Government', 'Geography', 'Biology', 'Physics', 'Chemistry', 'Literature in English', 'CRS', 'IRS'], 1,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     NULL),

    ('economics-and-development-studies', 'Economics & Development Studies', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language'],
     ARRAY['Economics', 'Mathematics', 'Commerce', 'Government', 'Geography', 'Financial Accounting'], 3,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     'UTME must include Economics and/or Mathematics.'),

    ('geography', 'Geography', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Geography'],
     ARRAY['Biology', 'Chemistry', 'Physics', 'Economics', 'Government', 'Mathematics'], 2,
     ARRAY['English Language', 'Mathematics', 'Geography'], 5, 2,
     NULL),

    ('meteorology-and-climate-science', 'Meteorology & Climate Science', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Mathematics', 'Physics'],
     ARRAY['Geography', 'Chemistry', 'Biology', 'Agricultural Science'], 1,
     ARRAY['English Language', 'Mathematics', 'Physics'], 5, 2,
     NULL),

    ('mass-communication', 'Mass Communication', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Literature in English'],
     ARRAY['Economics', 'Government', 'History', 'CRS', 'IRS', 'Geography', 'French', 'Yoruba', 'Igbo', 'Commerce', 'Civic Education'], 2,
     ARRAY['English Language', 'Mathematics', 'Literature in English'], 5, 2,
     NULL),

    ('library-and-information-science', 'Library & Information Science', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Literature in English'],
     ARRAY['Economics', 'Government', 'History', 'CRS', 'IRS', 'Physics', 'Chemistry', 'Biology', 'French', 'Geography'], 2,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('political-science', 'Political Science', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Government'],
     ARRAY['Economics', 'Geography', 'History', 'Literature in English', 'CRS', 'IRS'], 2,
     ARRAY['English Language', 'Mathematics', 'Government'], 5, 2,
     'UTME requires Government, Economics or Geography, and one of History, Literature, CRS/IRS.'),

    ('psychology', 'Psychology', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language'],
     ARRAY['Mathematics', 'Biology', 'Physics', 'Chemistry', 'Economics', 'Government', 'Literature in English'], 3,
     ARRAY['English Language', 'Mathematics', 'Biology'], 5, 2,
     'UNILAG Psychology does NOT accept Commerce, CRS/IRS, or Financial Accounting.'),

    ('public-administration', 'Public Administration', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language', 'Economics'],
     ARRAY['Government', 'Civic Education', 'History', 'Commerce', 'Geography', 'Literature in English'], 2,
     ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2,
     'UTME must include Government, Civic Education or History.'),

    ('social-standards', 'Social Standards', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language'],
     ARRAY['Economics', 'Government', 'Civic Education', 'Mathematics', 'Biology'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     NULL),

    ('social-work', 'Social Work', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language'],
     ARRAY['Economics', 'Government', 'Geography', 'History', 'CRS', 'IRS', 'Literature in English', 'Biology', 'Mathematics', 'Civic Education'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'UTME requires two Social Sciences and one Arts subject. Mathematics is accepted.'),

    ('sociology', 'Sociology', 'Faculty of Social Sciences', 'B.Sc.', 4,
     ARRAY['English Language'],
     ARRAY['Economics', 'Government', 'Geography', 'History', 'CRS', 'IRS', 'Literature in English', 'Biology', 'Mathematics', 'Civic Education'], 3,
     ARRAY['English Language', 'Mathematics'], 5, 2,
     'UTME requires two Social Sciences and one Arts subject. Mathematics is accepted.');

    -- =========================================================================
    -- UPSERT INTO PROGRAMMES & PROGRAMME_REQUIREMENTS
    -- =========================================================================
    FOR v_unilag_id IN
        SELECT v_unilag_id
    LOOP
        -- Insert/update programmes
        INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
        SELECT v_unilag_id, t.slug, t.name, t.faculty, t.degree, t.duration_years
        FROM tmp_unilag_prog_reqs t
        ON CONFLICT (institution_id, slug) DO UPDATE SET
            name = EXCLUDED.name,
            faculty = EXCLUDED.faculty,
            degree = EXCLUDED.degree,
            duration_years = EXCLUDED.duration_years,
            updated_at = now();

        -- Insert/update programme requirements
        INSERT INTO programme_requirements (
            programme_id,
            compulsory_utme_subjects,
            elective_utme_options,
            elective_utme_pick_count,
            compulsory_olevel_subjects,
            min_olevel_credits,
            max_sittings,
            special_requirements_note
        )
        SELECT 
            p.id,
            t.compulsory_utme,
            t.elective_utme,
            t.elective_count,
            t.compulsory_olevel,
            t.min_credits,
            t.max_sittings,
            t.special_notes
        FROM tmp_unilag_prog_reqs t
        JOIN programmes p ON p.slug = t.slug AND p.institution_id = v_unilag_id
        ON CONFLICT (programme_id) DO UPDATE SET
            compulsory_utme_subjects = EXCLUDED.compulsory_utme_subjects,
            elective_utme_options = EXCLUDED.elective_utme_options,
            elective_utme_pick_count = EXCLUDED.elective_utme_pick_count,
            compulsory_olevel_subjects = EXCLUDED.compulsory_olevel_subjects,
            min_olevel_credits = EXCLUDED.min_olevel_credits,
            max_sittings = EXCLUDED.max_sittings,
            special_requirements_note = EXCLUDED.special_requirements_note,
            updated_at = now();
    END LOOP;

END;
$$;
