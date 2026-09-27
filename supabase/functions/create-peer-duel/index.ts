/**
 * Edge Function: create-peer-duel
 *
 * POST /functions/v1/create-peer-duel
 *
 * Creates a peer CBT challenge session. Supports two invite methods:
 *
 *   Method A — Named invite (friend alert):
 *     Pass opponent_username. The function resolves the username to a user_id
 *     and stores it in challenger_user_id. The opponent's frontend, which is
 *     subscribed to cbt_peer_sessions via Supabase Realtime, will immediately
 *     receive the INSERT event and can show a "You've been challenged!" modal.
 *
 *   Method B — Room code (shareable link):
 *     Omit opponent_username. The function generates a 6-char room code and
 *     leaves challenger_user_id = NULL. The host shares the code (e.g. via
 *     WhatsApp). Any authenticated user who calls join-peer-duel with that
 *     code can join.
 *
 *   Both methods are supported simultaneously — a named invite also receives
 *   a room code so the opponent can join via either channel.
 *
 * What this function does:
 *   1. Authenticates the caller (host).
 *   2. Validates subject / track / topic inputs.
 *   3. Checks the host is an active aspirant.
 *   4. Resolves opponent_username → challenger_user_id (if provided).
 *      - Never exposes the opponent's email; only their internal UUID is used.
 *      - Rejects self-challenges.
 *   5. Randomly selects shared question IDs (same pool for both players).
 *   6. Generates a unique 6-char room code (retries on collision).
 *   7. Inserts cbt_peer_sessions row (status = 'waiting').
 *   8. Returns room_code + peer_session_id to the host.
 *
 * Security:
 *   - JWT required.
 *   - service_role used for username → id lookup (never exposes emails).
 *   - Answers (correct_option) never selected or returned.
 *   - Room code collision handled with retry loop (max 5 attempts).
 */

import {
  corsHeaders,
  ok,
  err,
  requireAuth,
  serviceClient,
  isValidSubject,
  isValidTrack,
  selectRandomQuestions,
  generateRoomCode,
  ValidTrack,
} from "../_shared/utils.ts";

// Peer sessions expire after 10 minutes if no one joins
const WAITING_ROOM_TTL_SECONDS = 600;

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

  const { subject, track_type, topic = null, opponent_username = null } = body;

  if (!isValidSubject(subject)) {
    return err(
      "Invalid subject. Must be: accounts, biology, economics, commerce",
      400, origin,
    );
  }
  if (!isValidTrack(track_type)) {
    return err(
      "Invalid track_type. Must be: subject, topic, combination",
      400, origin,
    );
  }
  if ((track_type as ValidTrack) === "topic" && (typeof topic !== "string" || !topic.trim())) {
    return err("topic is required when track_type is 'topic'", 400, origin);
  }
  if (opponent_username !== null && typeof opponent_username !== "string") {
    return err("opponent_username must be a string", 400, origin);
  }

  const svc = serviceClient();

  // ── Verify host is an active aspirant ────────────────────────────────
  const { data: hostProfile, error: hostErr } = await svc
    .from("profiles")
    .select("user_type, is_active")
    .eq("id", user.id)
    .single();

  if (hostErr || !hostProfile) return err("Profile not found", 404, origin);
  if (!hostProfile.is_active) return err("Account suspended", 403, origin);
  if (hostProfile.user_type !== "aspirant") {
    return err("Peer duels are only available for aspirant accounts", 403, origin);
  }

  // ── Resolve opponent username → user_id (Method A) ───────────────────
  let challengerUserId: string | null = null;

  if (opponent_username) {
    const opponentName = (opponent_username as string).trim();

    // Prevent self-challenge
    if (opponentName.toLowerCase() === user.id) {
      return err("You cannot challenge yourself", 400, origin);
    }

    const { data: opponentProfile, error: opponentErr } = await svc
      .from("profiles")
      .select("id, is_active, user_type")
      .eq("username", opponentName)
      .maybeSingle();

    if (opponentErr || !opponentProfile) {
      return err(`User '${opponentName}' not found`, 404, origin);
    }
    if (!opponentProfile.is_active) {
      return err(`User '${opponentName}' is not available`, 400, origin);
    }
    if (opponentProfile.user_type !== "aspirant") {
      return err(`User '${opponentName}' is not an aspirant`, 400, origin);
    }
    // Prevent self-challenge via username lookup
    if (opponentProfile.id === user.id) {
      return err("You cannot challenge yourself", 400, origin);
    }

    challengerUserId = opponentProfile.id;
  }

  // ── Select shared question pool ───────────────────────────────────────
  // Both players get the same randomised question_ids — fairness guarantee.
  let questionIds: string[];
  try {
    questionIds = await selectRandomQuestions(
      subject as string,
      track_type as ValidTrack,
      topic as string | null,
      svc,
    );
  } catch (e) {
    return err((e as Error).message, 422, origin);
  }

  // ── Generate unique room code (with collision retry) ─────────────────
  let roomCode = "";
  let attempts = 0;
  const MAX_RETRIES = 5;

  while (attempts < MAX_RETRIES) {
    const candidate = generateRoomCode();
    const { data: existing } = await svc
      .from("cbt_peer_sessions")
      .select("id")
      .eq("room_code", candidate)
      .maybeSingle();

    if (!existing) {
      roomCode = candidate;
      break;
    }
    attempts++;
  }

  if (!roomCode) {
    console.error("create-peer-duel: failed to generate unique room code after", MAX_RETRIES, "attempts");
    return err("Failed to create duel. Please try again.", 500, origin);
  }

  // ── Create the peer session (status = 'waiting') ─────────────────────
  const expiresAt = new Date(Date.now() + WAITING_ROOM_TTL_SECONDS * 1000).toISOString();

  const { data: peerSession, error: insertErr } = await svc
    .from("cbt_peer_sessions")
    .insert({
      room_code:           roomCode,
      host_user_id:        user.id,
      challenger_user_id:  challengerUserId,   // NULL for open room-code join
      subject,
      track_type,
      question_ids:        questionIds,
      total_questions:     questionIds.length,
      time_limit_seconds:  1200,               // 20 minutes per player
      status:              "waiting",
      expires_at:          expiresAt,
    })
    .select("id, room_code, subject, track_type, total_questions, expires_at")
    .single();

  if (insertErr || !peerSession) {
    console.error("create-peer-duel: insert error:", insertErr);
    return err("Failed to create duel session. Please try again.", 500, origin);
  }

  // ── Respond ───────────────────────────────────────────────────────────
  // The host's frontend should:
  //   1. Display the room_code for sharing (Method B).
  //   2. Subscribe to cbt_peer_sessions:id=peer_session_id via Supabase Realtime.
  //   3. When status changes to 'in_progress', navigate to the CBT screen.
  return ok({
    peer_session_id:    peerSession.id,
    room_code:          peerSession.room_code,
    subject:            peerSession.subject,
    track_type:         peerSession.track_type,
    total_questions:    peerSession.total_questions,
    expires_at:         peerSession.expires_at,
    invite_method:      challengerUserId ? "named_invite" : "room_code",
    opponent_username:  opponent_username ?? null,
    // The host waits here. The game starts when join-peer-duel is called.
  }, origin);
});
