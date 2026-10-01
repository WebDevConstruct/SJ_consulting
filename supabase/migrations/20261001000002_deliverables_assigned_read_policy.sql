-- Migration: Add deliverables_assigned_read policy
-- Date: 2026-10-01
--
-- Enables authenticated staff and tutors to view deliverables assigned directly to them,
-- alongside the existing deliverables_admin_all policy for admin/super_admin.

DROP POLICY IF EXISTS "deliverables_assigned_read" ON deliverables;

CREATE POLICY "deliverables_assigned_read" ON deliverables
    FOR SELECT TO authenticated
    USING (assigned_to = auth.uid());
