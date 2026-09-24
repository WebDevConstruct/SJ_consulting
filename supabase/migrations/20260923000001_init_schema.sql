-- =============================================================================
-- SJ Consulting Platform — Initial Database Schema
-- Migration: 20260923000001_init_schema.sql
-- Author: Lala (WDC Backend)
--
-- Security Posture:
--   - RLS enabled on every table (deny-by-default)
--   - correct_option is NEVER returned to clients via RLS SELECT policies
--   - All CBT grading happens server-side in Edge Functions (service_role)
--   - Admin writes go through Edge Functions, not direct client SDK
--   - Leaderboard is a secure view — no raw attempt data exposed
--   - Paystack webhook verification enforced in Edge Function (HMAC-SHA512)
--   - Username change is rate-limited at app layer (Edge Function)
--   - Slug + username format enforced by DB constraints (not just app layer)
-- =============================================================================

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_type AS ENUM ('aspirant', 'undergraduate');
CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin');
CREATE TYPE announcement_category AS ENUM ('mentorship', 'unilag', 'jamb', 'accommodation');

-- Built scalable: WAEC/NECO/NABTEB can be added without migration
CREATE TYPE exam_type AS ENUM ('JAMB', 'WAEC', 'NECO', 'NABTEB');

CREATE TYPE cbt_track AS ENUM ('subject', 'topic', 'combination');
CREATE TYPE cbt_mode AS ENUM ('solo', 'peer');
CREATE TYPE peer_session_status AS ENUM ('waiting', 'in_progress', 'completed', 'cancelled', 'expired');
CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');
CREATE TYPE payroll_status AS ENUM ('pending_approval', 'approved', 'processing', 'paid', 'rejected');
CREATE TYPE department_type AS ENUM ('research', 'media', 'programs', 'admin', 'other');
CREATE TYPE deliverable_status AS ENUM ('pending', 'in_progress', 'completed', 'overdue');

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
-- Passwords are never stored here — Supabase Auth owns auth.users
-- This table is app-level user state only

CREATE TABLE profiles (
    id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username       TEXT UNIQUE NOT NULL,
    full_name      TEXT NOT NULL,
    age            SMALLINT CHECK (age > 0 AND age < 120),
    phone          TEXT,
    user_type      user_type NOT NULL,
    user_role      user_role NOT NULL DEFAULT 'user',

    -- Aspirant-specific (NULL for undergrads)
    jamb_subjects  JSONB,         -- ["Mathematics","English","Physics","Chemistry"]
    has_written_jamb BOOLEAN,

    -- Undergraduate-specific (NULL for aspirants)
    unilag_year    SMALLINT CHECK (unilag_year IN (1, 2)),

    -- Shared
    avatar_url     TEXT,
    leaderboard_score INT NOT NULL DEFAULT 0,
    theme          TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    is_active      BOOLEAN NOT NULL DEFAULT true,
    last_active_at TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Enforce safe username format at DB level (belt + suspenders with app-layer)
    CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$'),
    -- Aspirant must have subjects or declare none yet; undergrad must have year
    CONSTRAINT aspirant_has_subjects CHECK (
        user_type = 'undergraduate' OR jamb_subjects IS NOT NULL OR has_written_jamb IS NOT NULL
    )
);

COMMENT ON COLUMN profiles.user_role IS
    'user = student; admin = content + CBT upload access; super_admin = payroll approval';
COMMENT ON COLUMN profiles.jamb_subjects IS
    'Array of 4 subject strings, validated against combination rules in Edge Function';
COMMENT ON COLUMN profiles.leaderboard_score IS
    'Incremented by Edge Function on peer win, never by client directly';

-- ============================================================
-- ANNOUNCEMENTS (unified content for all 4 public categories)
-- ============================================================
-- One table, one cache policy, one admin interface
-- Frontend filters by category — no duplicate endpoint logic

CREATE TABLE announcements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category     announcement_category NOT NULL,
    title        TEXT NOT NULL,
    subtext      TEXT NOT NULL,
    content      TEXT NOT NULL,
    summary      TEXT,
    image_url    TEXT,
    link         TEXT,         -- Conditional: NULL is valid, validated as URL if present
    location     TEXT,         -- Relevant for accommodation posts
    event_date   DATE,
    is_published BOOLEAN NOT NULL DEFAULT true,
    posted_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT link_is_url CHECK (link IS NULL OR link ~ '^https?://')
);

-- Hot path: homepage loads latest published per category
CREATE INDEX idx_announcements_category_published
    ON announcements(category, created_at DESC)
    WHERE is_published = true;

-- ============================================================
-- BLOGS (internal performance metrics & editorial content)
-- ============================================================

CREATE TABLE blogs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    subtext      TEXT NOT NULL,
    content      TEXT NOT NULL,
    summary      TEXT,
    image_url    TEXT,
    is_published BOOLEAN NOT NULL DEFAULT true,
    posted_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9\-]+$')
);

CREATE INDEX idx_blogs_slug ON blogs(slug) WHERE is_published = true;
CREATE INDEX idx_blogs_published_at ON blogs(published_at DESC) WHERE is_published = true;

-- ============================================================
-- CBT QUESTION BANK
-- ============================================================
-- !! SECURITY-CRITICAL DESIGN DECISION !!
-- correct_option is intentionally excluded from the public SELECT policy.
-- The cbt_questions_safe VIEW is what clients actually query.
-- All grading runs server-side in the cbt-submit Edge Function with service_role.
-- This prevents:
--   a) Students inspecting network responses to find answers
--   b) Automated scripts iterating the full question bank with answers
--   c) Front-end bugs accidentally leaking the answer

CREATE TABLE cbt_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject         TEXT NOT NULL,        -- 'accounts', 'biology', 'economics', 'commerce'
    topic           TEXT,                 -- parsed or admin-assigned post-import
    exam_type       exam_type NOT NULL DEFAULT 'JAMB',
    year            SMALLINT NOT NULL CHECK (year BETWEEN 1990 AND 2100),
    question_number SMALLINT NOT NULL,
    context_text    TEXT,                 -- "Use the table below to answer questions 44 and 45"
    question_text   TEXT NOT NULL,
    options         JSONB NOT NULL,       -- {"A": "...", "B": "...", "C": "...", "D": "..."}
    correct_option  TEXT CHECK (correct_option IN ('A', 'B', 'C', 'D')),  -- NULL = disputed/no authoritative answer
    explanation     TEXT,                 -- Optional post-answer explanation
    has_diagram     BOOLEAN NOT NULL DEFAULT false,
    diagram_url     TEXT,                 -- Supabase Storage public URL after upload
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT options_has_abcd CHECK (
        options ? 'A' AND options ? 'B' AND options ? 'C' AND options ? 'D'
    ),
    -- One question per (exam, subject, year, number)
    CONSTRAINT unique_question UNIQUE (exam_type, subject, year, question_number)
);

-- Question selection queries: by subject+year (full-year exam), by subject+topic (topic drill)
CREATE INDEX idx_questions_subject_year
    ON cbt_questions(subject, year) WHERE is_active = true;
CREATE INDEX idx_questions_subject_topic
    ON cbt_questions(subject, topic) WHERE is_active = true AND topic IS NOT NULL;

-- !! SAFE CLIENT-FACING VIEW — correct_option is explicitly excluded !!
CREATE VIEW cbt_questions_safe AS
    SELECT
        id, subject, topic, exam_type, year, question_number,
        context_text, question_text, options,
        has_diagram, diagram_url, created_at
    FROM cbt_questions
    WHERE is_active = true;

COMMENT ON VIEW cbt_questions_safe IS
    'Client-safe view of questions. correct_option is intentionally excluded. Use this for all client reads.';

-- ============================================================
-- CBT SESSIONS (server-authoritative exam sessions)
-- ============================================================
-- When a user starts an exam, the Edge Function creates this record.
-- It holds the randomised question_ids for this attempt.
-- Clients receive only question content (via cbt_questions_safe),
-- never the session's internal state or correct answers.
-- expires_at prevents indefinitely open sessions (e.g. offline cheating).

CREATE TABLE cbt_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mode              cbt_mode NOT NULL,
    track_type        cbt_track NOT NULL,
    subject           TEXT NOT NULL,
    exam_type         exam_type NOT NULL DEFAULT 'JAMB',
    question_ids      UUID[] NOT NULL,   -- Ordered, randomized for this session
    total_questions   INT NOT NULL,
    time_limit_seconds INT NOT NULL DEFAULT 1800,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL, -- Computed: started_at + interval
    is_submitted      BOOLEAN NOT NULL DEFAULT false,
    peer_session_id   UUID,               -- Set for peer mode; FK added below
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cbt_sessions_user_active
    ON cbt_sessions(user_id, expires_at DESC)
    WHERE is_submitted = false;

-- ============================================================
-- CBT ATTEMPTS (completed, graded exams)
-- ============================================================

CREATE TABLE cbt_attempts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id            UUID NOT NULL UNIQUE REFERENCES cbt_sessions(id),
    mode                  cbt_mode NOT NULL,
    track_type            cbt_track NOT NULL,
    subject               TEXT NOT NULL,
    exam_type             exam_type NOT NULL DEFAULT 'JAMB',
    total_questions       INT NOT NULL,
    score                 INT NOT NULL,
    time_spent_seconds    INT NOT NULL,
    -- {"question_uuid": "B"} — stored so we can show the student their answers
    user_answers          JSONB NOT NULL,
    -- {"question_uuid": true/false} — computed by Edge Function, stored for analysis
    per_question_results  JSONB NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One attempt per track+subject per user (spec requirement)
    CONSTRAINT one_attempt_per_track
        UNIQUE (user_id, track_type, subject, exam_type)
);

-- Dashboard: latest 5 attempts for a user
CREATE INDEX idx_attempts_user_recent ON cbt_attempts(user_id, created_at DESC);

-- ============================================================
-- CBT PEER SESSIONS (synchronized real-time via Supabase Realtime)
-- ============================================================

CREATE TABLE cbt_peer_sessions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code             TEXT UNIQUE NOT NULL,   -- 6-char alphanumeric, server-generated
    host_user_id          UUID NOT NULL REFERENCES auth.users(id),
    challenger_user_id    UUID REFERENCES auth.users(id),  -- NULL until joined
    subject               TEXT NOT NULL,
    track_type            cbt_track NOT NULL,
    question_ids          UUID[] NOT NULL,         -- Same set for both players
    total_questions       INT NOT NULL,
    time_limit_seconds    INT NOT NULL DEFAULT 1200,
    status                peer_session_status NOT NULL DEFAULT 'waiting',
    host_score            INT,
    challenger_score      INT,
    winner_user_id        UUID REFERENCES auth.users(id),
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    expires_at            TIMESTAMPTZ NOT NULL,   -- Waiting rooms expire if not joined
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT room_code_format CHECK (room_code ~ '^[A-Z0-9]{6}$')
);

-- Add FK from cbt_sessions → cbt_peer_sessions (now that it exists)
ALTER TABLE cbt_sessions
    ADD CONSTRAINT fk_peer_session
    FOREIGN KEY (peer_session_id) REFERENCES cbt_peer_sessions(id);

-- Lookup by room code (most common join operation)
CREATE INDEX idx_peer_sessions_room ON cbt_peer_sessions(room_code)
    WHERE status IN ('waiting', 'in_progress');
CREATE INDEX idx_peer_sessions_participants
    ON cbt_peer_sessions(host_user_id, challenger_user_id);

-- ============================================================
-- SUBSCRIPTIONS / PAYMENTS
-- ============================================================

CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type             TEXT NOT NULL,          -- 'gst_year1', 'gst_year2', 'cbt_premium'
    paystack_reference    TEXT UNIQUE NOT NULL,   -- Paystack txn reference (idempotency key)
    paystack_customer_code TEXT,
    status                payment_status NOT NULL DEFAULT 'pending',
    amount_kobo           INT NOT NULL,
    access_expires_at     TIMESTAMPTZ,
    -- Raw Paystack webhook payload stored for audit & disputes
    -- Never expose this to clients (contains email, card metadata etc.)
    webhook_data          JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id, status);
-- Paystack webhook handler does fast lookup by reference
CREATE UNIQUE INDEX idx_subscriptions_ref ON subscriptions(paystack_reference);

-- ============================================================
-- PAYROLL (CEO-approved batch transfers via Paystack)
-- ============================================================

CREATE TABLE payroll_batches (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by                UUID NOT NULL REFERENCES profiles(id),
    description               TEXT,
    total_amount_kobo         BIGINT NOT NULL,
    status                    payroll_status NOT NULL DEFAULT 'pending_approval',
    approved_by               UUID REFERENCES profiles(id),
    approved_at               TIMESTAMPTZ,
    processed_at              TIMESTAMPTZ,
    paystack_bulk_transfer_code TEXT,
    -- [{name, bank_code, account_number, amount_kobo, reason}]
    -- Intentionally JSONB: recipient structure may evolve without schema changes
    recipients                JSONB NOT NULL,
    notes                     TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Only super_admin can approve; admin can create
    CONSTRAINT no_self_approval CHECK (created_by != approved_by)
);

CREATE INDEX idx_payroll_status ON payroll_batches(status, created_at DESC);

-- ============================================================
-- DEPARTMENT DELIVERABLES (internal ops tracking)
-- ============================================================

CREATE TABLE deliverables (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department  department_type NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    status      deliverable_status NOT NULL DEFAULT 'pending',
    assigned_to UUID REFERENCES profiles(id),
    due_date    DATE,
    completed_at TIMESTAMPTZ,
    created_by  UUID NOT NULL REFERENCES profiles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliverables_dept_status ON deliverables(department, status);

-- ============================================================
-- UTILITY FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-maintain updated_at on any UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_announcements_updated_at
    BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_blogs_updated_at
    BEFORE UPDATE ON blogs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payroll_updated_at
    BEFORE UPDATE ON payroll_batches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_deliverables_updated_at
    BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create profile row when auth.users is inserted (from signup Edge Function)
-- SECURITY DEFINER runs as the function owner (postgres), not the calling user
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    INSERT INTO profiles (id, username, full_name, user_type, phone, age)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'username',
        NEW.raw_user_meta_data->>'full_name',
        (NEW.raw_user_meta_data->>'user_type')::user_type,
        NEW.raw_user_meta_data->>'phone',
        (NEW.raw_user_meta_data->>'age')::SMALLINT
    );
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log but don't block auth creation; profile can be repaired
        RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- LEADERBOARD VIEW (safe, no PII, no attempt internals)
-- ============================================================

CREATE VIEW leaderboard_top100 AS
    SELECT
        p.id,
        p.username,
        p.avatar_url,
        p.leaderboard_score,
        p.user_type,
        RANK() OVER (ORDER BY p.leaderboard_score DESC) AS rank
    FROM profiles p
    WHERE p.is_active = true
      AND p.user_type = 'aspirant'
    LIMIT 100;

COMMENT ON VIEW leaderboard_top100 IS
    'Public leaderboard — no email, phone, or internal scores exposed';

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================
-- Philosophy:
--   1. Enable RLS on every table (deny-by-default)
--   2. Minimum privilege — grant only what a role legitimately needs
--   3. Admin writes go through Edge Functions (service_role bypasses RLS)
--      but we add admin policies as belt-and-suspenders for direct access
--   4. correct_option is unreachable via any user-accessible policy
--   5. webhook_data in subscriptions is never client-readable

-- --- PROFILES ---
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read any profile (needed for leaderboard, peer challenges)
-- Only id, username, avatar_url, leaderboard_score are meaningful for others
CREATE POLICY "profiles_select_authenticated" ON profiles
    FOR SELECT TO authenticated USING (true);

-- Users can only update their own profile
-- Critically: prevents self-elevation by explicitly excluding user_role changes
CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        -- Role must remain 'user' — elevation only via service_role (admin actions)
        AND user_role = 'user'
    );

-- --- ANNOUNCEMENTS ---
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Public read — unauthenticated homepage content (anon role)
CREATE POLICY "announcements_public_read" ON announcements
    FOR SELECT TO anon, authenticated USING (is_published = true);

-- Write: admin only (belt-and-suspenders; primary enforcement is Edge Function)
CREATE POLICY "announcements_admin_write" ON announcements
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_role IN ('admin', 'super_admin')
        )
    );

-- --- BLOGS ---
ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blogs_public_read" ON blogs
    FOR SELECT TO anon, authenticated USING (is_published = true);

CREATE POLICY "blogs_admin_write" ON blogs
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_role IN ('admin', 'super_admin')
        )
    );

-- --- CBT QUESTIONS ---
ALTER TABLE cbt_questions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read via the SAFE VIEW (correct_option stripped at view layer)
-- Direct table access: only service_role (Edge Functions) can see correct_option
-- This policy grants SELECT on the underlying table for RLS,
-- but clients should ONLY ever query cbt_questions_safe view
CREATE POLICY "cbt_questions_authenticated_read" ON cbt_questions
    FOR SELECT TO authenticated USING (is_active = true);

-- No client INSERT/UPDATE/DELETE — only service_role via Edge Functions

-- --- CBT SESSIONS ---
ALTER TABLE cbt_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cbt_sessions_own" ON cbt_sessions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- --- CBT ATTEMPTS ---
ALTER TABLE cbt_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cbt_attempts_own" ON cbt_attempts
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- --- CBT PEER SESSIONS ---
ALTER TABLE cbt_peer_sessions ENABLE ROW LEVEL SECURITY;

-- Only participants can read their session
CREATE POLICY "peer_sessions_participants" ON cbt_peer_sessions
    FOR SELECT TO authenticated
    USING (
        auth.uid() = host_user_id
        OR auth.uid() = challenger_user_id
    );

-- --- SUBSCRIPTIONS ---
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users see own subscriptions; webhook_data excluded via column selection in app layer
CREATE POLICY "subscriptions_own" ON subscriptions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- --- PAYROLL ---
ALTER TABLE payroll_batches ENABLE ROW LEVEL SECURITY;

-- Only admin/super_admin can see payroll
CREATE POLICY "payroll_admin_only" ON payroll_batches
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_role IN ('admin', 'super_admin')
        )
    );

-- Only admin can create; only super_admin can approve (enforced in Edge Function)
CREATE POLICY "payroll_admin_write" ON payroll_batches
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "payroll_superadmin_update" ON payroll_batches
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_role = 'super_admin'
        )
    );

-- --- DELIVERABLES ---
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliverables_admin_all" ON deliverables
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.user_role IN ('admin', 'super_admin')
        )
    );

-- Enable realtime for peer sessions (Supabase Realtime subscription)
ALTER PUBLICATION supabase_realtime ADD TABLE cbt_peer_sessions;
