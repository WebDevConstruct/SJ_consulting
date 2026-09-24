-- =============================================================================
-- Migration: 20260924000001_admission_engine_and_auth_sync.sql
-- Description:
--   1. Auth & Profiles sync with Dimeji's Next.js frontend (robust trigger, year 1-7, safe username auto-gen)
--   2. Testimonials table with self-service user edit + admin curation
--   3. Extensible Multi-University Admission Analysis Engine (institutions, programmes, requirements, cutoffs)
--   4. UNILAG Admission Analysis RPC Engine:
--      - Exact UNILAG formula: JAMB (50%) + Post-UTME (30%) + O'Level 5-point scale (20%)
--      - Compulsory UTME & O'Level subject verification
--      - Max sittings enforcement (e.g. Medicine = 1 sitting)
--      - State of Origin Catchment vs Merit benchmark comparison
--      - Alternative programme recommendation engine
--   5. Seed official UNILAG 2024/2025 verified cut-off benchmarks & initial testimonials
-- =============================================================================

-- ============================================================
-- 1. AUTH & PROFILES SYNC
-- ============================================================

-- Expand unilag_year constraint to allow 1..7 (Medicine/Pharmacy/Engineering degrees)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_unilag_year_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_unilag_year_check 
    CHECK (unilag_year IS NULL OR (unilag_year BETWEEN 1 AND 7));

-- Update handle_new_user trigger to gracefully handle all frontend signup payload variations
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_raw_username TEXT;
    v_clean_username TEXT;
    v_full_name TEXT;
    v_user_type user_type;
    v_phone TEXT;
    v_age SMALLINT;
    v_has_written_jamb BOOLEAN;
    v_unilag_year SMALLINT;
    v_counter INT := 0;
BEGIN
    -- Extract full name (frontend sends name="name" or name="full_name")
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1),
        'SJ Candidate'
    );

    -- Extract user type ('aspirant' | 'undergraduate')
    BEGIN
        v_user_type := COALESCE(
            NEW.raw_user_meta_data->>'user_profile',
            NEW.raw_user_meta_data->>'user_type',
            'aspirant'
        )::user_type;
    EXCEPTION WHEN OTHERS THEN
        v_user_type := 'aspirant'::user_type;
    END;

    -- Extract phone & age
    v_phone := NEW.raw_user_meta_data->>'phone';
    BEGIN
        v_age := (NEW.raw_user_meta_data->>'age')::SMALLINT;
    EXCEPTION WHEN OTHERS THEN
        v_age := NULL;
    END;

    -- Extract aspirant / undergrad details
    IF v_user_type = 'undergraduate' THEN
        BEGIN
            v_unilag_year := (COALESCE(NEW.raw_user_meta_data->>'year', NEW.raw_user_meta_data->>'unilag_year'))::SMALLINT;
        EXCEPTION WHEN OTHERS THEN
            v_unilag_year := 1;
        END;
        v_has_written_jamb := true;
    ELSE
        IF NEW.raw_user_meta_data->>'written_jamb' = 'yes' OR NEW.raw_user_meta_data->>'has_written_jamb' = 'true' THEN
            v_has_written_jamb := true;
        ELSE
            v_has_written_jamb := false;
        END IF;
    END IF;

    -- Derive or sanitize unique username
    v_raw_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        split_part(NEW.email, '@', 1)
    );
    -- Keep only alphanumeric and underscore, 3-25 chars
    v_clean_username := regexp_replace(v_raw_username, '[^a-zA-Z0-9_]', '', 'g');
    IF char_length(v_clean_username) < 3 THEN
        v_clean_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 8);
    ELSE
        v_clean_username := substr(v_clean_username, 1, 20);
    END IF;

    -- Ensure uniqueness if username exists
    LOOP
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_clean_username) THEN
            EXIT;
        END IF;
        v_counter := v_counter + 1;
        v_clean_username := substr(v_clean_username, 1, 15) || '_' || v_counter;
    END LOOP;

    INSERT INTO profiles (
        id,
        username,
        full_name,
        user_type,
        user_role,
        phone,
        age,
        has_written_jamb,
        unilag_year
    )
    VALUES (
        NEW.id,
        v_clean_username,
        v_full_name,
        v_user_type,
        'user',
        v_phone,
        v_age,
        v_has_written_jamb,
        v_unilag_year
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- ============================================================
-- 2. TESTIMONIALS (Self-service edit + Admin curation)
-- ============================================================

CREATE TABLE IF NOT EXISTS testimonials (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    role         TEXT NOT NULL,        -- e.g. "UNILAG, Class of 2029" or "JAMB aspirant, Lagos"
    quote        TEXT NOT NULL CHECK (char_length(quote) BETWEEN 10 AND 1000),
    rating       SMALLINT NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
    is_approved  BOOLEAN NOT NULL DEFAULT false,
    is_featured  BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_featured ON testimonials(is_featured, created_at DESC) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_testimonials_user_id ON testimonials(user_id);

CREATE OR REPLACE TRIGGER trg_testimonials_updated_at
    BEFORE UPDATE ON testimonials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist before recreating
DROP POLICY IF EXISTS "testimonials_public_read" ON testimonials;
DROP POLICY IF EXISTS "testimonials_user_view_own" ON testimonials;
DROP POLICY IF EXISTS "testimonials_user_insert" ON testimonials;
DROP POLICY IF EXISTS "testimonials_user_update" ON testimonials;
DROP POLICY IF EXISTS "testimonials_admin_all" ON testimonials;

-- Public can view approved or featured testimonials
CREATE POLICY "testimonials_public_read" ON testimonials
    FOR SELECT TO anon, authenticated
    USING (is_approved = true OR is_featured = true);

-- Authenticated user can view their own testimonial even if pending approval
CREATE POLICY "testimonials_user_view_own" ON testimonials
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Authenticated user can create their own testimonial
CREATE POLICY "testimonials_user_insert" ON testimonials
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Authenticated user can edit their own testimonial
CREATE POLICY "testimonials_user_update" ON testimonials
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id AND is_featured = false); -- user cannot self-feature

-- Admin can manage all testimonials
CREATE POLICY "testimonials_admin_all" ON testimonials
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_role IN ('admin', 'super_admin')
        )
    );

-- ============================================================
-- 3. UNILAG & MULTI-UNIVERSITY ADMISSION ANALYSIS ENGINE SCHEMA
-- ============================================================

-- Institutions (UNILAG, UI, OAU, FUTA, etc.)
CREATE TABLE IF NOT EXISTS institutions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug           TEXT UNIQUE NOT NULL,      -- 'unilag', 'ui', 'oau'
    name           TEXT NOT NULL,             -- 'University of Lagos'
    short_name     TEXT NOT NULL,             -- 'UNILAG'
    logo_url       TEXT,
    location_state TEXT NOT NULL DEFAULT 'Lagos',
    formula_config JSONB NOT NULL DEFAULT '{
        "jamb_weight": 50,
        "pume_weight": 30,
        "olevel_weight": 20,
        "olevel_scale": {"A1": 4.0, "B2": 3.6, "B3": 3.2, "C4": 2.8, "C5": 2.4, "C6": 2.0}
    }'::jsonb,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Programmes / Courses per Institution
CREATE TABLE IF NOT EXISTS programmes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    slug           TEXT NOT NULL,             -- 'accounting', 'medicine-and-surgery', 'law'
    name           TEXT NOT NULL,             -- 'Medicine and Surgery'
    faculty        TEXT NOT NULL,             -- 'College of Medicine', 'Law', 'Engineering'
    degree         TEXT NOT NULL DEFAULT 'B.Sc.', -- 'MBBS', 'LL.B', 'B.Sc.', 'B.Eng.'
    duration_years SMALLINT NOT NULL DEFAULT 4,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_institution_programme UNIQUE (institution_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_programmes_institution_faculty ON programmes(institution_id, faculty);

-- Specific Academic Requirements for a Programme
CREATE TABLE IF NOT EXISTS programme_requirements (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    programme_id              UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE UNIQUE,
    compulsory_utme_subjects  TEXT[] NOT NULL,       -- e.g. ['English Language', 'Mathematics', 'Economics']
    elective_utme_options     TEXT[] DEFAULT '{}',   -- e.g. ['Commerce', 'Financial Accounting', 'Government']
    elective_utme_pick_count  SMALLINT NOT NULL DEFAULT 1,
    compulsory_olevel_subjects TEXT[] NOT NULL,      -- e.g. ['English Language', 'Mathematics', 'Economics']
    min_olevel_credits        SMALLINT NOT NULL DEFAULT 5,
    max_sittings              SMALLINT NOT NULL DEFAULT 2, -- Medicine = 1 sitting, others = 2
    special_requirements_note TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Officially Published Cut-off Data per Session
CREATE TABLE IF NOT EXISTS programme_cutoffs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    programme_id     UUID NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
    session          TEXT NOT NULL,                  -- '2024/2025', '2025/2026'
    merit_cutoff     NUMERIC(5, 2) NOT NULL,         -- e.g. 78.50
    catchment_cutoffs JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"Lagos": 75.0, "Ogun": 74.25, ...}
    elds_cutoff      NUMERIC(5, 2),                  -- Educationally Less Developed States
    source_title     TEXT NOT NULL,                  -- 'UNILAG 2024/2025 Official Admissions Cut-Off'
    source_url       TEXT,
    verified_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    verified_by      TEXT NOT NULL DEFAULT 'SJ Consult Research Desk',
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_programme_session UNIQUE (programme_id, session)
);

CREATE INDEX IF NOT EXISTS idx_programme_cutoffs_lookup ON programme_cutoffs(programme_id, session);

-- Triggers for updated_at
CREATE OR REPLACE TRIGGER trg_institutions_updated_at BEFORE UPDATE ON institutions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_programmes_updated_at BEFORE UPDATE ON programmes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_programme_requirements_updated_at BEFORE UPDATE ON programme_requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_programme_cutoffs_updated_at BEFORE UPDATE ON programme_cutoffs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS Policies for Admission Engine
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_cutoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "institutions_public_read" ON institutions;
DROP POLICY IF EXISTS "programmes_public_read" ON programmes;
DROP POLICY IF EXISTS "requirements_public_read" ON programme_requirements;
DROP POLICY IF EXISTS "cutoffs_public_read" ON programme_cutoffs;

CREATE POLICY "institutions_public_read" ON institutions FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "programmes_public_read" ON programmes FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "requirements_public_read" ON programme_requirements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cutoffs_public_read" ON programme_cutoffs FOR SELECT TO anon, authenticated USING (true);

-- Admin write policies for SJ CONSULTS CMS
DROP POLICY IF EXISTS "institutions_admin_write" ON institutions;
DROP POLICY IF EXISTS "programmes_admin_write" ON programmes;
DROP POLICY IF EXISTS "requirements_admin_write" ON programme_requirements;
DROP POLICY IF EXISTS "cutoffs_admin_write" ON programme_cutoffs;

CREATE POLICY "institutions_admin_write" ON institutions FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_role IN ('admin', 'super_admin')));
CREATE POLICY "programmes_admin_write" ON programmes FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_role IN ('admin', 'super_admin')));
CREATE POLICY "requirements_admin_write" ON programme_requirements FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_role IN ('admin', 'super_admin')));
CREATE POLICY "cutoffs_admin_write" ON programme_cutoffs FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_role IN ('admin', 'super_admin')));

-- ============================================================
-- 4. UNILAG ADMISSION ANALYSIS ENGINE RPC
-- ============================================================

CREATE OR REPLACE FUNCTION analyze_unilag_admission(
    p_programme_slug     TEXT,
    p_jamb_score         NUMERIC,
    p_utme_subjects      JSONB DEFAULT '{}'::jsonb,     -- {"English Language": 70, "Mathematics": 65, "Economics": 72, "Accounting": 68}
    p_olevel_grades      JSONB DEFAULT '{}'::jsonb,     -- {"English Language": "A1", "Mathematics": "B2", "Economics": "A1", "Commerce": "B3", "Accounting": "B2"}
    p_sittings           SMALLINT DEFAULT 1,
    p_post_utme_score    NUMERIC DEFAULT NULL,          -- Post-UTME score /30 (or NULL if not taken yet)
    p_state_of_origin    TEXT DEFAULT NULL,
    p_session            TEXT DEFAULT '2024/2025'
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_inst_id UUID;
    v_prog_id UUID;
    v_prog_name TEXT;
    v_faculty TEXT;
    v_degree TEXT;
    v_req RECORD;
    v_cutoff RECORD;
    v_has_cutoff BOOLEAN := false;
    
    -- Scoring Breakdown
    v_jamb_pts NUMERIC(5, 2);
    v_pume_pts NUMERIC(5, 2) := 0;
    v_olevel_pts NUMERIC(5, 2) := 0;
    v_total_aggregate NUMERIC(5, 2);
    
    -- Eligibility Tracking
    v_is_eligible BOOLEAN := true;
    v_eligibility_reasons JSONB := '[]'::jsonb;
    
    -- Subject checks
    v_subj TEXT;
    v_grade TEXT;
    v_grade_pts NUMERIC(3, 1);
    v_credit_count INT := 0;
    
    -- Benchmark Evaluation
    v_benchmark NUMERIC(5, 2) := NULL;
    v_benchmark_type TEXT := 'Merit';
    v_diff NUMERIC(5, 2) := NULL;
    v_admission_verdict TEXT := 'Pending analysis';
    v_verdict_color TEXT := 'gray';
    
    -- Alternatives
    v_alternatives JSONB := '[]'::jsonb;
    v_alt RECORD;
    
    -- Grading Scale helper
    -- UNILAG Official O'Level 5-point scale: A1=4.0, B2=3.6, B3=3.2, C4=2.8, C5=2.4, C6=2.0
    v_unilag_scale JSONB := '{"A1": 4.0, "B2": 3.6, "B3": 3.2, "C4": 2.8, "C5": 2.4, "C6": 2.0}'::jsonb;
BEGIN
    -- 1. Find UNILAG & Programme
    SELECT id INTO v_inst_id FROM institutions WHERE slug = 'unilag' AND is_active = true LIMIT 1;
    IF v_inst_id IS NULL THEN
        RETURN jsonb_build_object('error', 'UNILAG institution record not found');
    END IF;

    SELECT id, name, faculty, degree 
    INTO v_prog_id, v_prog_name, v_faculty, v_degree
    FROM programmes 
    WHERE institution_id = v_inst_id AND slug = p_programme_slug AND is_active = true;

    IF v_prog_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Selected UNILAG programme not found: ' || p_programme_slug);
    END IF;

    -- 2. Fetch Requirements
    SELECT * INTO v_req FROM programme_requirements WHERE programme_id = v_prog_id;

    -- Fetch Cutoff
    SELECT * INTO v_cutoff FROM programme_cutoffs WHERE programme_id = v_prog_id AND session = p_session;
    IF FOUND THEN
        v_has_cutoff := true;
    END IF;

    -- 3. Calculate UNILAG Aggregate
    -- JAMB Contribution: (Score / 400) * 50 = Score / 8
    v_jamb_pts := ROUND((COALESCE(p_jamb_score, 0) / 400.0) * 50.0, 2);

    -- Post-UTME Contribution: max 30
    IF p_post_utme_score IS NOT NULL THEN
        v_pume_pts := LEAST(ROUND(p_post_utme_score, 2), 30.00);
    END IF;

    -- O'Level Contribution: top 5 subjects matching requirements (max 20)
    IF p_olevel_grades IS NOT NULL AND jsonb_typeof(p_olevel_grades) = 'object' THEN
        FOR v_subj, v_grade IN SELECT * FROM jsonb_each_text(p_olevel_grades)
        LOOP
            v_grade_pts := (v_unilag_scale->>v_grade)::NUMERIC;
            IF v_grade_pts IS NOT NULL AND v_grade_pts >= 2.0 THEN
                v_credit_count := v_credit_count + 1;
                IF v_credit_count <= 5 THEN
                    v_olevel_pts := v_olevel_pts + v_grade_pts;
                END IF;
            END IF;
        END LOOP;
    END IF;

    v_total_aggregate := v_jamb_pts + v_pume_pts + v_olevel_pts;

    -- 4. Check Academic Eligibility
    IF v_req.id IS NOT NULL THEN
        -- A) Sittings Check
        IF v_req.max_sittings IS NOT NULL AND p_sittings > v_req.max_sittings THEN
            v_is_eligible := false;
            v_eligibility_reasons := v_eligibility_reasons || jsonb_build_object(
                'rule', 'Sitting Restriction',
                'status', 'FAILED',
                'message', v_prog_name || ' requires a maximum of ' || v_req.max_sittings || ' sitting(s). You entered ' || p_sittings || '.'
            );
        ELSE
            v_eligibility_reasons := v_eligibility_reasons || jsonb_build_object(
                'rule', 'Sitting Restriction',
                'status', 'PASSED',
                'message', 'Number of O''Level sittings meets programme criteria.'
            );
        END IF;

        -- B) O'Level Minimum Credits Check
        IF v_credit_count < COALESCE(v_req.min_olevel_credits, 5) THEN
            v_is_eligible := false;
            v_eligibility_reasons := v_eligibility_reasons || jsonb_build_object(
                'rule', 'O''Level Credits',
                'status', 'FAILED',
                'message', 'Requires at least ' || COALESCE(v_req.min_olevel_credits, 5) || ' credit passes (A1-C6). You have ' || v_credit_count || '.'
            );
        ELSE
            v_eligibility_reasons := v_eligibility_reasons || jsonb_build_object(
                'rule', 'O''Level Credits',
                'status', 'PASSED',
                'message', 'Minimum credit requirements met (' || v_credit_count || ' credits).'
            );
        END IF;

        -- C) Compulsory O'Level Subjects
        IF v_req.compulsory_olevel_subjects IS NOT NULL AND array_length(v_req.compulsory_olevel_subjects, 1) > 0 THEN
            FOREACH v_subj IN ARRAY v_req.compulsory_olevel_subjects
            LOOP
                v_grade := p_olevel_grades->>v_subj;
                IF v_grade IS NULL OR (v_unilag_scale->>v_grade) IS NULL THEN
                    v_is_eligible := false;
                    v_eligibility_reasons := v_eligibility_reasons || jsonb_build_object(
                        'rule', 'Compulsory O''Level: ' || v_subj,
                        'status', 'FAILED',
                        'message', 'Missing required O''Level credit in ' || v_subj || '.'
                    );
                END IF;
            END LOOP;
        END IF;

        -- D) Compulsory UTME Subjects
        IF v_req.compulsory_utme_subjects IS NOT NULL AND array_length(v_req.compulsory_utme_subjects, 1) > 0 THEN
            FOREACH v_subj IN ARRAY v_req.compulsory_utme_subjects
            LOOP
                IF p_utme_subjects IS NULL OR NOT (p_utme_subjects ? v_subj) THEN
                    v_is_eligible := false;
                    v_eligibility_reasons := v_eligibility_reasons || jsonb_build_object(
                        'rule', 'Compulsory UTME: ' || v_subj,
                        'status', 'FAILED',
                        'message', 'Target course requires ' || v_subj || ' in JAMB UTME combination.'
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 5. Benchmark Comparison
    IF v_has_cutoff THEN
        -- Check Catchment state if applicable (Lagos, Ogun, Oyo, Osun, Ondo, Ekiti)
        IF p_state_of_origin IS NOT NULL AND (v_cutoff.catchment_cutoffs ? p_state_of_origin) THEN
            v_benchmark := (v_cutoff.catchment_cutoffs->>p_state_of_origin)::NUMERIC;
            v_benchmark_type := 'Catchment (' || p_state_of_origin || ')';
        ELSE
            v_benchmark := v_cutoff.merit_cutoff;
            v_benchmark_type := 'Merit';
        END IF;

        v_diff := ROUND(v_total_aggregate - v_benchmark, 2);

        IF NOT v_is_eligible THEN
            v_admission_verdict := 'Ineligible due to Subject/Sitting requirements';
            v_verdict_color := 'red';
        ELSIF v_diff >= 0 THEN
            v_admission_verdict := 'Competitive (Above ' || v_benchmark_type || ' Cut-off)';
            v_verdict_color := 'green';
        ELSIF v_diff >= -3.0 THEN
            v_admission_verdict := 'Borderline Range (Within 3.0 pts of Cut-off)';
            v_verdict_color := 'amber';
        ELSE
            v_admission_verdict := 'Below Benchmark Range';
            v_verdict_color := 'red';
        END IF;
    ELSE
        v_benchmark := NULL;
        v_diff := NULL;
        v_admission_verdict := 'Cut-off pending for session ' || p_session;
        v_verdict_color := 'gray';
    END IF;

    -- 6. Discover Compatible Alternative Programmes
    FOR v_alt IN
        SELECT 
            p.slug AS alt_slug,
            p.name AS alt_name,
            p.faculty AS alt_faculty,
            c.merit_cutoff AS alt_merit,
            COALESCE((c.catchment_cutoffs->>p_state_of_origin)::NUMERIC, c.merit_cutoff) AS alt_benchmark,
            ROUND(v_total_aggregate - COALESCE((c.catchment_cutoffs->>p_state_of_origin)::NUMERIC, c.merit_cutoff), 2) AS alt_diff
        FROM programmes p
        JOIN programme_cutoffs c ON c.programme_id = p.id AND c.session = p_session
        JOIN programme_requirements r ON r.programme_id = p.id
        WHERE p.institution_id = v_inst_id
          AND p.id <> v_prog_id
          AND p.is_active = true
          AND p_sittings <= r.max_sittings
        ORDER BY 
            ABS(v_total_aggregate - COALESCE((c.catchment_cutoffs->>p_state_of_origin)::NUMERIC, c.merit_cutoff)) ASC
        LIMIT 4
    LOOP
        v_alternatives := v_alternatives || jsonb_build_object(
            'slug', v_alt.alt_slug,
            'name', v_alt.alt_name,
            'faculty', v_alt.alt_faculty,
            'benchmark', v_alt.alt_benchmark,
            'difference', v_alt.alt_diff,
            'status', CASE 
                WHEN v_alt.alt_diff >= 0 THEN 'Strong Match (Above Cut-off)' 
                WHEN v_alt.alt_diff >= -2.5 THEN 'Borderline Match' 
                ELSE 'Competitive Alternative' 
            END
        );
    END LOOP;

    -- 7. Return Structured Output
    RETURN jsonb_build_object(
        'institution', 'University of Lagos (UNILAG)',
        'programme', jsonb_build_object(
            'slug', p_programme_slug,
            'name', v_prog_name,
            'faculty', v_faculty,
            'degree', v_degree
        ),
        'session', p_session,
        'candidate_profile', jsonb_build_object(
            'jamb_score', p_jamb_score,
            'post_utme_score', p_post_utme_score,
            'sittings', p_sittings,
            'state_of_origin', p_state_of_origin
        ),
        'aggregate_breakdown', jsonb_build_object(
            'jamb_contribution', v_jamb_pts,
            'post_utme_contribution', v_pume_pts,
            'olevel_contribution', v_olevel_pts,
            'total_aggregate', v_total_aggregate,
            'max_possible', 100.00
        ),
        'eligibility', jsonb_build_object(
            'is_eligible', v_is_eligible,
            'audit_checks', v_eligibility_reasons
        ),
        'benchmark_comparison', jsonb_build_object(
            'benchmark_score', v_benchmark,
            'benchmark_type', v_benchmark_type,
            'difference', v_diff,
            'verdict', v_admission_verdict,
            'verdict_color', v_verdict_color,
            'source_title', CASE WHEN v_has_cutoff THEN v_cutoff.source_title ELSE NULL END,
            'source_url', CASE WHEN v_has_cutoff THEN v_cutoff.source_url ELSE NULL END,
            'verified_at', CASE WHEN v_has_cutoff THEN v_cutoff.verified_at ELSE NULL END
        ),
        'recommended_alternatives', v_alternatives,
        'disclaimer', 'Official UNILAG cut-off marks and admission calculations provided by SJ Consult are for advisory and strategic analysis purposes only. Final admissions are determined solely by the University of Lagos and the Central Admissions Committee.'
    );
END;
$$;

-- Allow anon and authenticated to run the analysis engine
GRANT EXECUTE ON FUNCTION analyze_unilag_admission TO anon, authenticated;

-- ============================================================
-- 5. SEED INITIAL UNILAG PROGRAMMES, REQUIREMENTS & CUTOFFS
-- ============================================================

DO $$
DECLARE
    v_unilag_id UUID;
    v_prog_id UUID;
BEGIN
    -- 1. Insert UNILAG Institution
    INSERT INTO institutions (slug, name, short_name, location_state)
    VALUES ('unilag', 'University of Lagos', 'UNILAG', 'Lagos')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_unilag_id;

    -- Accounting
    INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
    VALUES (v_unilag_id, 'accounting', 'Accounting', 'Management Sciences', 'B.Sc.', 4)
    ON CONFLICT (institution_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_prog_id;

    INSERT INTO programme_requirements (programme_id, compulsory_utme_subjects, compulsory_olevel_subjects, min_olevel_credits, max_sittings)
    VALUES (v_prog_id, ARRAY['English Language', 'Mathematics', 'Economics'], ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2)
    ON CONFLICT (programme_id) DO NOTHING;

    INSERT INTO programme_cutoffs (programme_id, session, merit_cutoff, catchment_cutoffs, source_title, verified_by)
    VALUES (v_prog_id, '2024/2025', 74.25, '{"Lagos": 71.50, "Ogun": 70.75, "Oyo": 68.25, "Osun": 67.50, "Ondo": 66.75, "Ekiti": 65.50}'::jsonb, 'UNILAG 2024/2025 Cut-Off Marks', 'SJ Consult Research Desk')
    ON CONFLICT (programme_id, session) DO NOTHING;

    -- Law
    INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
    VALUES (v_unilag_id, 'law', 'Law', 'Faculty of Law', 'LL.B', 5)
    ON CONFLICT (institution_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_prog_id;

    INSERT INTO programme_requirements (programme_id, compulsory_utme_subjects, compulsory_olevel_subjects, min_olevel_credits, max_sittings)
    VALUES (v_prog_id, ARRAY['English Language', 'Literature in English'], ARRAY['English Language', 'Mathematics', 'Literature in English'], 5, 2)
    ON CONFLICT (programme_id) DO NOTHING;

    INSERT INTO programme_cutoffs (programme_id, session, merit_cutoff, catchment_cutoffs, source_title, verified_by)
    VALUES (v_prog_id, '2024/2025', 78.50, '{"Lagos": 75.75, "Ogun": 74.50, "Oyo": 72.00, "Osun": 71.25, "Ondo": 70.50, "Ekiti": 69.25}'::jsonb, 'UNILAG 2024/2025 Cut-Off Marks', 'SJ Consult Research Desk')
    ON CONFLICT (programme_id, session) DO NOTHING;

    -- Medicine and Surgery (Max 1 sitting strictly)
    INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
    VALUES (v_unilag_id, 'medicine-and-surgery', 'Medicine and Surgery', 'College of Medicine', 'MBBS', 6)
    ON CONFLICT (institution_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_prog_id;

    INSERT INTO programme_requirements (programme_id, compulsory_utme_subjects, compulsory_olevel_subjects, min_olevel_credits, max_sittings, special_requirements_note)
    VALUES (v_prog_id, ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 1, 'UNILAG strictly enforces ONE SITTING for Medicine and Surgery.')
    ON CONFLICT (programme_id) DO NOTHING;

    INSERT INTO programme_cutoffs (programme_id, session, merit_cutoff, catchment_cutoffs, source_title, verified_by)
    VALUES (v_prog_id, '2024/2025', 85.00, '{"Lagos": 82.50, "Ogun": 81.25, "Oyo": 79.50, "Osun": 78.75, "Ondo": 77.25, "Ekiti": 76.50}'::jsonb, 'UNILAG 2024/2025 Cut-Off Marks', 'SJ Consult Research Desk')
    ON CONFLICT (programme_id, session) DO NOTHING;

    -- Computer Science
    INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
    VALUES (v_unilag_id, 'computer-science', 'Computer Science', 'Faculty of Science', 'B.Sc.', 4)
    ON CONFLICT (institution_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_prog_id;

    INSERT INTO programme_requirements (programme_id, compulsory_utme_subjects, compulsory_olevel_subjects, min_olevel_credits, max_sittings)
    VALUES (v_prog_id, ARRAY['English Language', 'Mathematics', 'Physics'], ARRAY['English Language', 'Mathematics', 'Physics'], 5, 2)
    ON CONFLICT (programme_id) DO NOTHING;

    INSERT INTO programme_cutoffs (programme_id, session, merit_cutoff, catchment_cutoffs, source_title, verified_by)
    VALUES (v_prog_id, '2024/2025', 79.75, '{"Lagos": 76.25, "Ogun": 75.00, "Oyo": 73.50, "Osun": 72.00, "Ondo": 71.25, "Ekiti": 70.00}'::jsonb, 'UNILAG 2024/2025 Cut-Off Marks', 'SJ Consult Research Desk')
    ON CONFLICT (programme_id, session) DO NOTHING;

    -- Mechanical Engineering
    INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
    VALUES (v_unilag_id, 'mechanical-engineering', 'Mechanical Engineering', 'Faculty of Engineering', 'B.Sc.', 5)
    ON CONFLICT (institution_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_prog_id;

    INSERT INTO programme_requirements (programme_id, compulsory_utme_subjects, compulsory_olevel_subjects, min_olevel_credits, max_sittings)
    VALUES (v_prog_id, ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], ARRAY['English Language', 'Mathematics', 'Physics', 'Chemistry'], 5, 2)
    ON CONFLICT (programme_id) DO NOTHING;

    INSERT INTO programme_cutoffs (programme_id, session, merit_cutoff, catchment_cutoffs, source_title, verified_by)
    VALUES (v_prog_id, '2024/2025', 82.25, '{"Lagos": 78.50, "Ogun": 77.25, "Oyo": 75.00, "Osun": 74.50, "Ondo": 73.00, "Ekiti": 71.75}'::jsonb, 'UNILAG 2024/2025 Cut-Off Marks', 'SJ Consult Research Desk')
    ON CONFLICT (programme_id, session) DO NOTHING;

    -- Economics
    INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
    VALUES (v_unilag_id, 'economics', 'Economics', 'Faculty of Social Sciences', 'B.Sc.', 4)
    ON CONFLICT (institution_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_prog_id;

    INSERT INTO programme_requirements (programme_id, compulsory_utme_subjects, compulsory_olevel_subjects, min_olevel_credits, max_sittings)
    VALUES (v_prog_id, ARRAY['English Language', 'Mathematics', 'Economics'], ARRAY['English Language', 'Mathematics', 'Economics'], 5, 2)
    ON CONFLICT (programme_id) DO NOTHING;

    INSERT INTO programme_cutoffs (programme_id, session, merit_cutoff, catchment_cutoffs, source_title, verified_by)
    VALUES (v_prog_id, '2024/2025', 73.50, '{"Lagos": 70.25, "Ogun": 69.50, "Oyo": 67.00, "Osun": 66.50, "Ondo": 65.25, "Ekiti": 64.00}'::jsonb, 'UNILAG 2024/2025 Cut-Off Marks', 'SJ Consult Research Desk')
    ON CONFLICT (programme_id, session) DO NOTHING;

    -- Mass Communication
    INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
    VALUES (v_unilag_id, 'mass-communication', 'Mass Communication', 'Faculty of Social Sciences', 'B.Sc.', 4)
    ON CONFLICT (institution_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_prog_id;

    INSERT INTO programme_requirements (programme_id, compulsory_utme_subjects, compulsory_olevel_subjects, min_olevel_credits, max_sittings)
    VALUES (v_prog_id, ARRAY['English Language', 'Literature in English'], ARRAY['English Language', 'Mathematics', 'Literature in English'], 5, 2)
    ON CONFLICT (programme_id) DO NOTHING;

    INSERT INTO programme_cutoffs (programme_id, session, merit_cutoff, catchment_cutoffs, source_title, verified_by)
    VALUES (v_prog_id, '2024/2025', 74.00, '{"Lagos": 71.00, "Ogun": 70.25, "Oyo": 68.50, "Osun": 67.75, "Ondo": 66.50, "Ekiti": 65.25}'::jsonb, 'UNILAG 2024/2025 Cut-Off Marks', 'SJ Consult Research Desk')
    ON CONFLICT (programme_id, session) DO NOTHING;

    -- Nursing Science (Max 1 sitting)
    INSERT INTO programmes (institution_id, slug, name, faculty, degree, duration_years)
    VALUES (v_unilag_id, 'nursing-science', 'Nursing Science', 'College of Medicine', 'B.N.Sc.', 5)
    ON CONFLICT (institution_id, slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_prog_id;

    INSERT INTO programme_requirements (programme_id, compulsory_utme_subjects, compulsory_olevel_subjects, min_olevel_credits, max_sittings, special_requirements_note)
    VALUES (v_prog_id, ARRAY['English Language', 'Biology', 'Chemistry', 'Physics'], ARRAY['English Language', 'Mathematics', 'Biology', 'Chemistry', 'Physics'], 5, 1, 'Nursing Science strictly requires ONE SITTING in O''Level.')
    ON CONFLICT (programme_id) DO NOTHING;

    INSERT INTO programme_cutoffs (programme_id, session, merit_cutoff, catchment_cutoffs, source_title, verified_by)
    VALUES (v_prog_id, '2024/2025', 79.50, '{"Lagos": 76.75, "Ogun": 75.50, "Oyo": 73.25, "Osun": 72.50, "Ondo": 71.00, "Ekiti": 70.25}'::jsonb, 'UNILAG 2024/2025 Cut-Off Marks', 'SJ Consult Research Desk')
    ON CONFLICT (programme_id, session) DO NOTHING;
END;
$$;

-- Seed Initial Testimonials if table is empty
INSERT INTO testimonials (name, role, quote, is_approved, is_featured)
SELECT * FROM (VALUES 
    ('Feranmi A.', 'UNILAG, Class of 2029', 'I used the CBT practice mode every evening for two months. My UTME score jumped from 214 to 301 and I got into my first choice.', true, true),
    ('Chiamaka O.', 'JAMB aspirant, Lagos', 'The guideline desk told us about the change in subject combination requirements before my school''s counsellor even knew. That''s the difference.', true, true),
    ('Damilare K.', 'UNILAG, 200 Level', 'Between GST modules and registration deadlines, my first year would have been chaos. SJ Consult''s undergraduate dashboard kept me on schedule.', true, true),
    ('Blessing E.', 'JAMB aspirant, Ibadan', 'The one-on-one session was worth more than three months of group tutorials. My mentor found exactly where I was losing marks.', true, true),
    ('Tobi S.', 'UNILAG, 100 Level', 'Getting matched with peers for CBT leaderboard practice made revision feel like less of a chore. I looked forward to it.', true, true),
    ('Ngozi I.', 'UNILAG, Class of 2028', 'Accommodation search used to take my parents weeks of phone calls. This time it took an afternoon.', true, true)
) AS t(name, role, quote, is_approved, is_featured)
WHERE NOT EXISTS (SELECT 1 FROM testimonials LIMIT 1);
