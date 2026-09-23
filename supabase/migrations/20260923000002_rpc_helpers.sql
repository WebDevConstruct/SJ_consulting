-- Migration: 20260923000002_rpc_helpers.sql
-- Helper RPC functions called by Edge Functions
-- These run as SECURITY DEFINER to perform privileged updates
-- without exposing the underlying table logic to clients

-- ============================================================
-- increment_leaderboard_score
-- ============================================================
-- Called by cbt-submit Edge Function after grading.
-- Using a dedicated function instead of a direct UPDATE prevents
-- clients from calling the profiles UPDATE endpoint with arbitrary scores.
-- The function is only callable with service_role (enforced by RLS + the
-- fact that anon/authenticated roles cannot call SECURITY DEFINER functions
-- that touch privileged data without explicit GRANT).

CREATE OR REPLACE FUNCTION increment_leaderboard_score(
    p_user_id UUID,
    p_points INT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
    UPDATE profiles
    SET
        leaderboard_score = leaderboard_score + p_points,
        updated_at = now()
    WHERE id = p_user_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE WARNING 'increment_leaderboard_score: user % not found or inactive', p_user_id;
    END IF;
END;
$$;

-- Revoke from public/anon — only service_role (Edge Functions) should call this
REVOKE ALL ON FUNCTION increment_leaderboard_score(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_leaderboard_score(UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION increment_leaderboard_score(UUID, INT) FROM authenticated;
-- service_role retains access by default in Supabase

COMMENT ON FUNCTION increment_leaderboard_score IS
    'Atomically increment leaderboard_score for a user. Only callable via service_role (Edge Functions).';
