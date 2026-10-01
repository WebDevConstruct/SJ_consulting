-- =============================================================================
-- Migration: 20260927000003_admin_content_rls.sql
-- Description:
--   Two targeted fixes for the Admin Dashboard:
--
--   1. Admin SELECT on unpublished content:
--      The existing policies ("announcements_public_read", "blogs_public_read")
--      only surface is_published=true rows. Admin users querying directly via
--      the Supabase JS client (not via service_role Edge Functions) cannot see
--      their own drafts. These new policies add a SELECT grant for admin /
--      super_admin so the admin dashboard list views work without special-casing.
--
--   2. Admin SELECT on all profiles (for user management view):
--      The existing "profiles_select_authenticated" policy allows any authenticated
--      user to read any profile — this is intentional for leaderboard/peer features.
--      No new policy needed here; getAdminUsers() in admin-api.ts already works.
--      (Documented here so future devs know this was considered, not missed.)
-- =============================================================================

-- ── 1a. Allow admins to read ALL announcements (including drafts) ───────────

DROP POLICY IF EXISTS "announcements_admin_read_all" ON announcements;
CREATE POLICY "announcements_admin_read_all" ON announcements
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
             WHERE profiles.id = auth.uid()
               AND profiles.user_role IN ('admin', 'super_admin')
               AND profiles.is_active = true
        )
    );

-- ── 1b. Allow admins to read ALL blog posts (including drafts) ─────────────

DROP POLICY IF EXISTS "blogs_admin_read_all" ON blogs;
CREATE POLICY "blogs_admin_read_all" ON blogs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
             WHERE profiles.id = auth.uid()
               AND profiles.user_role IN ('admin', 'super_admin')
               AND profiles.is_active = true
        )
    );
