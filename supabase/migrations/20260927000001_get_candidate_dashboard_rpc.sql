-- =============================================================================
-- Migration: 20260927000001_get_candidate_dashboard_rpc.sql
-- Description:
--   Single-call dashboard aggregation RPC for authenticated aspirant users.
--
--   Replaces the doc's three separate API calls:
--     api/v1/dashboard/cbt_history  (max 5)
--     api/v1/dashboard/analysis
--     api/v1/dashboard/leaderboard
--   …with one function call: get_candidate_dashboard(p_user_id)
--
--   What it returns (all in one JSONB payload):
--     1. recent_attempts  — last 5 CBT attempts (date, subject, track, score %)
--     2. analysis         — overall stats (avg score, total tests, best/worst subject)
--     3. subject_trend    — per-subject breakdown ready for a chart
--     4. leaderboard      — caller's rank + 5 peers above + 5 below (contextual)
--     5. pending_duels    — open peer challenges waiting on this user
--
--   Security:
--     - SECURITY DEFINER: runs as the function owner (postgres), but we
--       immediately validate that p_user_id matches auth.uid() so a
--       user cannot pass another user's id to read their private data.
--     - Exposes NO sensitive columns (no email, phone, webhook_data,
--       correct_option, or per_question_results).
--     - set search_path = public prevents schema-injection attacks.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_candidate_dashboard(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_type     TEXT;
    v_user_score    INT;
    v_user_rank     BIGINT;
    v_total_users   BIGINT;

    v_recent_attempts   JSONB;
    v_analysis          JSONB;
    v_subject_trend     JSONB;
    v_leaderboard       JSONB;
    v_pending_duels     JSONB;
BEGIN
    -- ── Security gate ────────────────────────────────────────────────────
    -- Caller must be authenticated and may only fetch their own dashboard.
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: you may only access your own dashboard';
    END IF;

    -- ── Validate user exists and is an active aspirant ──────────────────
    SELECT user_type, leaderboard_score
      INTO v_user_type, v_user_score
      FROM profiles
     WHERE id = p_user_id
       AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found or account inactive';
    END IF;

    -- Dashboard is aspirant-only for now (undergrads have a separate route)
    IF v_user_type != 'aspirant' THEN
        RAISE EXCEPTION 'Dashboard not available for undergraduate accounts';
    END IF;

    -- ── 1. Recent 5 CBT attempts ─────────────────────────────────────────
    -- Returns just enough info for the dashboard history cards.
    -- per_question_results and user_answers are intentionally omitted
    -- (they belong on the full Analysis page, not the dashboard summary).
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id',               a.id,
                'subject',          a.subject,
                'track_type',       a.track_type,
                'mode',             a.mode,
                'exam_type',        a.exam_type,
                'total_questions',  a.total_questions,
                'score',            a.score,
                'score_pct',        ROUND(
                                        (a.score::NUMERIC / NULLIF(a.total_questions, 0)) * 100,
                                        1
                                    ),
                'time_spent_seconds', a.time_spent_seconds,
                'attempted_at',     a.created_at
            )
            ORDER BY a.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_recent_attempts
    FROM (
        SELECT *
          FROM cbt_attempts
         WHERE user_id = p_user_id
         ORDER BY created_at DESC
         LIMIT 5
    ) a;

    -- ── 2. Overall analytics ─────────────────────────────────────────────
    -- Aggregated stats for the chart widget on the dashboard.
    SELECT jsonb_build_object(
        'total_attempts',       COUNT(*),
        'avg_score_pct',        ROUND(
                                    AVG(
                                        (score::NUMERIC / NULLIF(total_questions, 0)) * 100
                                    ),
                                    1
                                ),
        'best_score_pct',       ROUND(
                                    MAX(
                                        (score::NUMERIC / NULLIF(total_questions, 0)) * 100
                                    ),
                                    1
                                ),
        'total_questions_done', SUM(total_questions),
        'total_time_seconds',   SUM(time_spent_seconds)
    )
    INTO v_analysis
    FROM cbt_attempts
    WHERE user_id = p_user_id;

    -- ── 3. Per-subject breakdown (for chart) ─────────────────────────────
    -- Returns one row per subject the candidate has practiced.
    -- The frontend can render this as a bar chart or radar chart.
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'subject',          subject,
                'attempts',         COUNT(*),
                'avg_score_pct',    ROUND(
                                        AVG(
                                            (score::NUMERIC / NULLIF(total_questions, 0)) * 100
                                        ),
                                        1
                                    ),
                'best_score_pct',   ROUND(
                                        MAX(
                                            (score::NUMERIC / NULLIF(total_questions, 0)) * 100
                                        ),
                                        1
                                    )
            )
            ORDER BY subject ASC
        ),
        '[]'::jsonb
    )
    INTO v_subject_trend
    FROM cbt_attempts
    WHERE user_id = p_user_id
    GROUP BY subject;

    -- ── 4. Leaderboard (caller's rank + contextual peers) ────────────────
    -- We compute the full rank of the caller first, then return 5 users
    -- directly above and 5 directly below them so the display feels
    -- personal ("you're at #14, here's who's around you") rather than
    -- just showing a generic top-10.
    --
    -- If the caller is in the top 5, the "above" slice is naturally
    -- smaller; the query handles that gracefully.
    WITH ranked AS (
        SELECT
            p.id,
            p.username,
            p.avatar_url,
            p.leaderboard_score,
            RANK() OVER (ORDER BY p.leaderboard_score DESC) AS rank
        FROM profiles p
        WHERE p.is_active = true
          AND p.user_type = 'aspirant'
    ),
    caller_row AS (
        SELECT rank AS caller_rank
          FROM ranked
         WHERE id = p_user_id
    ),
    total_count AS (
        SELECT COUNT(*) AS total FROM ranked
    )
    SELECT jsonb_build_object(
        'caller_rank',  (SELECT caller_rank FROM caller_row),
        'caller_score', v_user_score,
        'total_users',  (SELECT total FROM total_count),
        'nearby',       COALESCE(
                            (
                                SELECT jsonb_agg(
                                    jsonb_build_object(
                                        'rank',             r.rank,
                                        'username',         r.username,
                                        'avatar_url',       r.avatar_url,
                                        'leaderboard_score', r.leaderboard_score,
                                        'is_caller',        (r.id = p_user_id)
                                    )
                                    ORDER BY r.rank ASC
                                )
                                FROM ranked r
                                WHERE r.rank BETWEEN
                                    GREATEST(1, (SELECT caller_rank FROM caller_row) - 5)
                                    AND
                                    (SELECT caller_rank FROM caller_row) + 5
                            ),
                            '[]'::jsonb
                        )
    )
    INTO v_leaderboard;

    -- ── 5. Pending peer duels ────────────────────────────────────────────
    -- Open challenges where this user is the named challenger (invited by
    -- someone else) or where they are the host waiting for someone to join.
    -- Expired sessions are excluded.
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id',           ps.id,
                'room_code',    ps.room_code,
                'subject',      ps.subject,
                'track_type',   ps.track_type,
                'status',       ps.status,
                'role',         CASE
                                    WHEN ps.host_user_id = p_user_id THEN 'host'
                                    ELSE 'challenger'
                                END,
                'opponent_username', opp.username,
                'opponent_avatar',   opp.avatar_url,
                'expires_at',   ps.expires_at,
                'created_at',   ps.created_at
            )
            ORDER BY ps.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_pending_duels
    FROM cbt_peer_sessions ps
    LEFT JOIN profiles opp ON opp.id = CASE
        WHEN ps.host_user_id = p_user_id THEN ps.challenger_user_id
        ELSE ps.host_user_id
    END
    WHERE (ps.host_user_id = p_user_id OR ps.challenger_user_id = p_user_id)
      AND ps.status IN ('waiting', 'in_progress')
      AND ps.expires_at > now();

    -- ── Compose and return ───────────────────────────────────────────────
    RETURN jsonb_build_object(
        'recent_attempts',  v_recent_attempts,
        'analysis',         v_analysis,
        'subject_trend',    v_subject_trend,
        'leaderboard',      v_leaderboard,
        'pending_duels',    v_pending_duels
    );
END;
$$;

COMMENT ON FUNCTION get_candidate_dashboard(UUID) IS
    'Single-call dashboard aggregation for aspirant users. '
    'Returns recent 5 attempts, overall stats, per-subject chart data, '
    'contextual leaderboard rank, and pending peer duels. '
    'Caller must pass their own auth.uid() — any mismatch raises an error.';

-- Grant execute to authenticated users only (anon cannot call this)
GRANT EXECUTE ON FUNCTION get_candidate_dashboard(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION get_candidate_dashboard(UUID) FROM anon;
