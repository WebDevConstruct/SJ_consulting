/**
 * Edge Function: cbt-submit
 *
 * POST /functions/v1/cbt-submit
 *
 * Server-side CBT grading. Accepts user answers, grades against correct_option
 * (which never left the server), commits the attempt, and updates leaderboard score.
 *
 * Security:
 *   - JWT required
 *   - session_id must belong to the authenticated user
 *   - Session must not be expired (expires_at checked server-side)
 *   - Session must not already be submitted (idempotency guard)
 *   - correct_option fetched server-side ONLY — never returned to client
 *   - Leaderboard score incremented atomically via RPC to prevent race conditions
 */

import {
  corsHeaders,
  ok,
  err,
  requireAuth,
  serviceClient,
} from "../_shared/utils.ts";

// Points awarded per correct answer (tunable)
const POINTS_PER_CORRECT = 10;
const POINTS_PEER_WIN_BONUS = 50;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return err("Method not allowed", 405, origin);

  // ---- Auth ----
  const auth = await requireAuth(req);
  if (!auth) return err("Unauthorized", 401, origin);
  const { user } = auth;

  // ---- Parse body ----
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400, origin);
  }

  const { session_id, answers } = body;

  if (typeof session_id !== "string" || !session_id) {
    return err("session_id is required", 400, origin);
  }
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
    return err("answers must be an object: {question_uuid: 'A'|'B'|'C'|'D'}", 400, origin);
  }

  // Validate each answer value
  const answerMap = answers as Record<string, unknown>;
  for (const [qId, ans] of Object.entries(answerMap)) {
    if (!["A", "B", "C", "D"].includes(ans as string)) {
      return err(`Invalid answer '${ans}' for question ${qId}. Must be A, B, C, or D.`, 400, origin);
    }
  }

  const svc = serviceClient();

  // ---- Fetch and validate session ----
  const { data: session, error: sessionErr } = await svc
    .from("cbt_sessions")
    .select("id, user_id, question_ids, is_submitted, expires_at, subject, track_type, mode, exam_type, started_at, peer_session_id")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) return err("Session not found", 404, origin);
  if (session.user_id !== user.id) return err("Forbidden", 403, origin);

  if (session.is_submitted) {
    return err("This session has already been submitted", 409, origin);
  }

  const now = new Date();
  const expiresAt = new Date(session.expires_at);
  // Allow a 30-second grace period for network latency
  const gracePeriodMs = 30_000;
  if (now.getTime() > expiresAt.getTime() + gracePeriodMs) {
    return err("Session has expired. Time limit exceeded.", 410, origin);
  }

  // ---- Fetch correct answers (service_role — correct_option never left server) ----
  const { data: questionAnswers, error: ansErr } = await svc
    .from("cbt_questions")
    .select("id, correct_option")
    .in("id", session.question_ids)
    .eq("is_active", true);

  if (ansErr || !questionAnswers) {
    console.error("Answer fetch error:", ansErr);
    return err("Failed to grade session. Please try again.", 500, origin);
  }

  // ---- Grade answers ----
  const correctMap: Record<string, string | null> = {};
  for (const q of questionAnswers) {
    correctMap[q.id] = q.correct_option;
  }

  let score = 0;
  const perQuestionResults: Record<string, boolean> = {};

  for (const qId of session.question_ids) {
    const userAnswer = answerMap[qId] as string | undefined;
    const correctAnswer = correctMap[qId];

    if (correctAnswer && userAnswer && userAnswer === correctAnswer) {
      score++;
      perQuestionResults[qId] = true;
    } else {
      perQuestionResults[qId] = false;
    }
  }

  const totalQuestions = session.question_ids.length;
  const timeSpent = Math.floor((now.getTime() - new Date(session.started_at).getTime()) / 1000);

  // ---- Commit attempt (idempotent: UNIQUE constraint on session_id) ----
  const { error: attemptErr } = await svc
    .from("cbt_attempts")
    .insert({
      user_id: user.id,
      session_id: session.id,
      mode: session.mode,
      track_type: session.track_type,
      subject: session.subject,
      exam_type: session.exam_type,
      total_questions: totalQuestions,
      score,
      time_spent_seconds: Math.min(timeSpent, session.expires_at ? 9999 : timeSpent),
      user_answers: answerMap,
      per_question_results: perQuestionResults,
    });

  if (attemptErr) {
    // Could be duplicate submission race — check if already exists
    if (attemptErr.code === "23505") {
      return err("Session already submitted", 409, origin);
    }
    console.error("Attempt insert error:", attemptErr);
    return err("Failed to save results. Please contact support.", 500, origin);
  }

  // ---- Mark session as submitted ----
  await svc
    .from("cbt_sessions")
    .update({ is_submitted: true })
    .eq("id", session.id);

  // ---- Update leaderboard score ----
  // Atomic increment via RPC to handle concurrent updates safely
  const pointsEarned = score * POINTS_PER_CORRECT;
  await svc.rpc("increment_leaderboard_score", {
    p_user_id: user.id,
    p_points: pointsEarned,
  });

  // ---- Handle peer session result ----
  if (session.mode === "peer" && session.peer_session_id) {
    await handlePeerSessionResult(
      svc,
      session.peer_session_id,
      user.id,
      score,
      POINTS_PEER_WIN_BONUS,
    );
  }

  // Return score but NOT correct answers (client will show on analysis page via own attempts)
  return ok({
    score,
    total_questions: totalQuestions,
    percentage: Math.round((score / totalQuestions) * 100),
    time_spent_seconds: timeSpent,
    points_earned: pointsEarned,
  }, origin);
});

// ============================================================
// PEER SESSION RESULT HANDLER
// ============================================================

async function handlePeerSessionResult(
  svc: ReturnType<typeof serviceClient>,
  peerSessionId: string,
  userId: string,
  score: number,
  winBonus: number,
): Promise<void> {
  const { data: peerSession } = await svc
    .from("cbt_peer_sessions")
    .select("host_user_id, challenger_user_id, host_score, challenger_score, status")
    .eq("id", peerSessionId)
    .single();

  if (!peerSession || peerSession.status === "completed") return;

  const isHost = peerSession.host_user_id === userId;
  const updateField = isHost ? "host_score" : "challenger_score";

  const updatedScores = {
    [updateField]: score,
  };

  // Check if both scores are now in
  const otherScore = isHost ? peerSession.challenger_score : peerSession.host_score;

  if (otherScore !== null) {
    // Both submitted — determine winner
    const myScore = score;
    const theirScore = otherScore;
    const winnerId =
      myScore > theirScore
        ? userId
        : myScore < theirScore
        ? (isHost ? peerSession.challenger_user_id : peerSession.host_user_id)
        : null; // draw

    Object.assign(updatedScores, {
      status: "completed",
      completed_at: new Date().toISOString(),
      winner_user_id: winnerId,
    });

    // Award win bonus to winner
    if (winnerId) {
      await svc.rpc("increment_leaderboard_score", {
        p_user_id: winnerId,
        p_points: winBonus,
      });
    }
  }

  await svc
    .from("cbt_peer_sessions")
    .update(updatedScores)
    .eq("id", peerSessionId);
}
