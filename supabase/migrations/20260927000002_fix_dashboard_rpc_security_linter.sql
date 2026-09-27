-- =============================================================================
-- Migration: 20260927000002_fix_dashboard_rpc_security_linter.sql
-- Description:
--   Remediates 2 Supabase Security Advisor findings on get_candidate_dashboard:
--
--   Warning 1 — "Public Can Execute SECURITY DEFINER Function"
--     Fix: REVOKE EXECUTE FROM PUBLIC (and explicitly from anon).
--          PostgreSQL grants EXECUTE to PUBLIC by default on new functions,
--          which includes the anon role. We already had REVOKE FROM anon in
--          the original migration, but the implicit PUBLIC grant overrode it.
--
--   Warning 2 — "Signed-In Users Can Execute SECURITY DEFINER Function"
--     Fix: Switch from SECURITY DEFINER → SECURITY INVOKER.
--          auth.uid() is a session-level variable set from the JWT — it is
--          available under SECURITY INVOKER because it is part of the
--          connection context, not the function owner context.
--          Our internal guard (IF auth.uid() != p_user_id) still fires.
--          RLS on all queried tables (profiles, cbt_attempts, cbt_peer_sessions)
--          continues to enforce per-row data isolation for the calling user.
--          This is the same pattern used for analyze_unilag_admission in
--          migration 20260924000002_fix_security_linter.sql.
-- =============================================================================

-- Step 1: Switch to SECURITY INVOKER
-- This eliminates the "Signed-In Users Can Execute SECURITY DEFINER Function"
-- warning because SECURITY INVOKER functions run as the calling user, not
-- as a privileged role, so there is no privilege escalation risk.
ALTER FUNCTION public.get_candidate_dashboard(UUID) SECURITY INVOKER;

-- Step 2: Lock down EXECUTE to authenticated only
-- The default PostgreSQL PUBLIC grant includes anon. Explicitly revoke both
-- PUBLIC and anon, then grant solely to authenticated role.
-- This eliminates the "Public Can Execute SECURITY DEFINER Function" warning.
REVOKE ALL ON FUNCTION public.get_candidate_dashboard(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_candidate_dashboard(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_candidate_dashboard(UUID) TO authenticated;
