-- =============================================================================
-- Migration: 20260924000002_fix_security_linter.sql
-- Description:
--   Remediates all 9 Supabase Security Advisor Linter findings:
--   1 & 2. Fix SECURITY DEFINER views (cbt_questions_safe, leaderboard_top100) -> security_invoker = true
--   3. Fix mutable search_path on set_updated_at -> SET search_path = public
--   4 & 7. Switch analyze_unilag_admission to SECURITY INVOKER (it only reads public tables)
--   5 & 8. Revoke public/anon/authenticated EXECUTE from handle_new_user (auth trigger, not an RPC)
--   6 & 9. Revoke public/anon/authenticated EXECUTE from rls_auto_enable (internal helper, not an RPC)
-- =============================================================================

-- ------------------------------------------------------------
-- 1 & 2. FIX SECURITY DEFINER VIEWS
-- ------------------------------------------------------------
-- In Postgres 15+, views without security_invoker run as the view creator,
-- bypassing RLS on underlying tables. Setting security_invoker = true ensures
-- that RLS on the underlying tables is enforced for the querying client.

ALTER VIEW public.cbt_questions_safe SET (security_invoker = true);
ALTER VIEW public.leaderboard_top100 SET (security_invoker = true);

-- Allow public/anon homepage visitors to read aspirant leaderboard scores safely
DROP POLICY IF EXISTS "profiles_select_leaderboard_public" ON profiles;
CREATE POLICY "profiles_select_leaderboard_public" ON profiles
    FOR SELECT TO anon
    USING (is_active = true AND user_type = 'aspirant');

-- ------------------------------------------------------------
-- 3. FIX MUTABLE SEARCH_PATH ON set_updated_at
-- ------------------------------------------------------------
-- Prevents potential search_path injection by fixing it to 'public'
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- ------------------------------------------------------------
-- 4 & 7. SWITCH analyze_unilag_admission TO SECURITY INVOKER
-- ------------------------------------------------------------
-- Since institutions, programmes, requirements, and cutoffs are already
-- readable by both anon and authenticated users, this function does not need
-- elevated SECURITY DEFINER privileges. Running as SECURITY INVOKER eliminates
-- the security warning while remaining fully callable from the frontend.

ALTER FUNCTION public.analyze_unilag_admission(
    TEXT, NUMERIC, JSONB, JSONB, INT, NUMERIC, TEXT, TEXT
) SECURITY INVOKER;

-- ------------------------------------------------------------
-- 5 & 8. REVOKE PUBLIC EXECUTE ON handle_new_user TRIGGER
-- ------------------------------------------------------------
-- handle_new_user() is an internal auth.users AFTER INSERT trigger.
-- In Postgres, functions in public are granted EXECUTE to PUBLIC by default,
-- which caused Supabase to expose it at POST /rest/v1/rpc/handle_new_user.
-- Revoking EXECUTE from anon & authenticated closes the HTTP API endpoint,
-- while the auth trigger continues to run with system privileges.

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- ------------------------------------------------------------
-- 6 & 9. REVOKE PUBLIC EXECUTE ON rls_auto_enable
-- ------------------------------------------------------------
-- Internal helper function should not be accessible over HTTP via PostgREST RPC.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;';
    END IF;
END $$;
