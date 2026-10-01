-- Migration: Relax one_attempt_per_track constraint for subscribers
-- Date: 2026-10-01
--
-- Drops the rigid UNIQUE constraint on (user_id, track_type, subject, exam_type).
-- Subscribed candidates (cbt_premium) can take unlimited attempts to practice and track trends.
-- Free-tier trial enforcement (1 trial per track) is handled authoritatively by cbt-start-session.

ALTER TABLE cbt_attempts DROP CONSTRAINT IF EXISTS one_attempt_per_track;
