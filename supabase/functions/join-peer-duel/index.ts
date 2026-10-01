/**
 * Edge Function: join-peer-duel
 *
 * POST /functions/v1/join-peer-duel
 *
 * Called by the challenger to join an existing waiting peer session.
 * Works for both invite methods:
 *
 *   Named invite: The challenger taps "Accept" on the Realtime notification.
 *     Their frontend passes the peer_session_id directly.
 *
 *   Room code: The challenger types or pastes the 6-char code.
 *     Their frontend passes room_code.
 *
 * Request body (one of):
 *   { "room_code": "JAMB9K" }
 *   { "peer_session_id": "uuid..." }
 *
 * What this function does:
 *   1. Authenticates the challenger.
 *   2. Looks up the peer session by room_code OR peer_session_id.
 *   3. Validates:
 *        - Session is in 'waiting' status (not already started/expired).
 *        - Session has not expired (expires_at check).
 *        - Challenger is not the host (can't join your own room).
 *        - If challenger_user_id was pre-set (named invite), the caller must
 *          match it — prevents someone else stealing a private invite.
 *   4. Updates cbt_peer_sessions:
 *        - challenger_user_id = caller (if not already set)
 *        - status = 'in_progress'
 *        - started_at = now()
 *   5. Creates two cbt_sessions rows (one per player) using the SAME
 *      question_ids stored on cbt_peer_sessions. This is the fairness
 *      guarantee — both players get identical questions.
 *   6. Returns both cbt_session_ids plus the full question content
 *      (from cbt_questions_safe — correct_option is never included).
 *
 * Security:
 *   - JWT required.
 *   - Private invites are enforced: if challenger_user_id is already set,
 *     only that exact user may join.
 *   - All writes use service_role (bypasses RLS); RLS is the read-time guard.
 *   - correct_option is never fetched or returned.
 */

import {
  corsHeaders,
  ok,
  err,
  requireAuth,
  serviceClient,
  isValidRoomCode,
} from "../_shared/utils.ts";

const TIME_LIMIT_SECONDS = 1200; // 20 minutes per player

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return err("Method not allowed", 405, origin);

  // ── Auth ──────────────────────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth) return err("Unauthorized", 401, origin);
  const { user } = auth;

  // ── Parse body ────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400, origin);
  }

  const { room_code = null, peer_session_id = null } = body;

  if (!room_code && !peer_session_id) {
    return err("Provide either room_code or peer_session_id", 400, origin);
  }
  if (room_code && !isValidRoomCode(room_code)) {
    return err("Invalid room code format. Must be 6 uppercase letters/digits.", 400, origin);
  }

  const svc = serviceClient();

  // ── Fetch the peer session ────────────────────────────────────────────
  let query = svc
    .from("cbt_peer_sessions")
    .select(
      "id, room_code, host_user_id, challenger_user_id, subject, track_type, " +
      "question_ids, total_questions, time_limit_seconds, status, expires_at",
    );

  if (peer_session_id) {
    query = query.eq("id", peer_session_id as string);
  } else {
    query = query.eq("room_code", (room_code as string).toUpperCase().trim());
  }

  const { data: peerSession, error: fetchErr } = await query.single();

  if (fetchErr || !peerSession) {
    return err("Duel not found. Check the room code and try again.", 404, origin);
  }

  // ── Validate session state ────────────────────────────────────────────
  if (peerSession.status !== "waiting") {
    const msg =
      peerSession.status === "in_progress" ? "This duel has already started." :
      peerSession.status === "completed"   ? "This duel has already ended." :
      peerSession.status === "expired"     ? "This duel room has expired." :
                                             "This duel is no longer available.";
    return err(msg, 409, origin);
  }

  if (new Date(peerSession.expires_at) < new Date()) {
    // Mark as expired in DB so future queries are cheaper
    await svc
      .from("cbt_peer_sessions")
      .update({ status: "expired" })
      .eq("id", peerSession.id);
    return err("This duel room has expired. Ask the host to create a new one.", 410, origin);
  }

  // ── Prevent self-join ─────────────────────────────────────────────────
  if (peerSession.host_user_id === user.id) {
    return err("You cannot join your own duel room.", 400, origin);
  }

  // ── Enforce private invite ────────────────────────────────────────────
  // If challenger_user_id was pre-set (named invite), only that user may join.
  if (
    peerSession.challenger_user_id !== null &&
    peerSession.challenger_user_id !== user.id
  ) {
    return err(
      "This is a private invite. Only the invited user can join this duel.",
      403, origin,
    );
  }

  // ── Verify challenger is an active aspirant ───────────────────────────
  const { data: challengerProfile, error: profileErr } = await svc
    .from("profiles")
    .select("user_type, is_active")
    .eq("id", user.id)
    .single();

  if (profileErr || !challengerProfile) return err("Profile not found", 404, origin);
  if (!challengerProfile.is_active) return err("Account suspended", 403, origin);
  if (challengerProfile.user_type !== "aspirant") {
    return err("Peer duels are only available for aspirant accounts", 403, origin);
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + peerSession.time_limit_seconds * 1000 + 60_000, // +1 min grace
  ).toISOString();

  // ── Activate the peer session ─────────────────────────────────────────
  const { error: activateErr } = await svc
    .from("cbt_peer_sessions")
    .update({
      challenger_user_id: user.id,
      status:             "in_progress",
      started_at:         now,
    })
    .eq("id", peerSession.id)
    .eq("status", "waiting"); // optimistic lock — prevents double-join race condition

  if (activateErr) {
    console.error("join-peer-duel: activate error:", activateErr);
    return err("Failed to start duel. Please try again.", 500, origin);
  }

  // ── Create cbt_sessions for BOTH players ─────────────────────────────
  // Both get the same question_ids (stored on cbt_peer_sessions).
  // This is the authoritative fairness guarantee.
  const sharedSessionBase = {
    mode:             "peer",
    track_type:       peerSession.track_type,
    subject:          peerSession.subject,
    exam_type:        "JAMB",
    question_ids:     peerSession.question_ids,
    total_questions:  peerSession.total_questions,
    time_limit_seconds: TIME_LIMIT_SECONDS,
    started_at:       now,
    expires_at:       expiresAt,
    is_submitted:     false,
    peer_session_id:  peerSession.id,
  };

  const { data: sessions, error: sessionsErr } = await svc
    .from("cbt_sessions")
    .insert([
      { ...sharedSessionBase, user_id: peerSession.host_user_id },
      { ...sharedSessionBase, user_id: user.id },
    ])
    .select("id, user_id");

  if (sessionsErr || !sessions || sessions.length < 2) {
    console.error("join-peer-duel: session insert error:", sessionsErr);
    // Roll back peer session status so the host can retry
    await svc
      .from("cbt_peer_sessions")
      .update({ status: "waiting", challenger_user_id: null, started_at: null })
      .eq("id", peerSession.id);
    return err("Failed to start duel sessions. Please try again.", 500, origin);
  }

  const hostSession       = sessions.find((s: { id: string; user_id: string }) => s.user_id === peerSession.host_user_id)!;
  const challengerSession = sessions.find((s: { id: string; user_id: string }) => s.user_id === user.id)!;

  // ── Fetch question content (safe view — no correct_option) ───────────
  const { data: questions, error: qErr } = await svc
    .from("cbt_questions_safe")
    .select(
      "id, subject, topic, exam_type, year, question_number, " +
      "context_text, question_text, options, has_diagram, diagram_url",
    )
    .in("id", peerSession.question_ids);

  if (qErr || !questions) {
    console.error("join-peer-duel: question fetch error:", qErr);
    return err("Failed to load questions. Please try again.", 500, origin);
  }

  // Preserve the randomised order stored in question_ids
  const orderedQuestions = peerSession.question_ids
    .map((id: string) => questions.find((q: { id: string }) => q.id === id))
    .filter(Boolean);

  // ── Respond ───────────────────────────────────────────────────────────
  // Both players receive the same response payload simultaneously.
  // The host's frontend gets this via the Realtime status update on
  // cbt_peer_sessions; the challenger's frontend gets it from this response.
  //
  // Each player uses their own session_id when submitting to cbt-submit.
  return ok({
    peer_session_id:       peerSession.id,
    room_code:             peerSession.room_code,
    your_session_id:       challengerSession.id,
    host_session_id:       hostSession.id,       // Host needs this; sent via Realtime
    subject:               peerSession.subject,
    track_type:            peerSession.track_type,
    time_limit_seconds:    TIME_LIMIT_SECONDS,
    started_at:            now,
    expires_at:            expiresAt,
    questions:             orderedQuestions,
  }, origin);
});
