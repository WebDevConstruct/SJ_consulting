/**
 * Edge Function: cbt-start-session
 *
 * POST /functions/v1/cbt-start-session
 *
 * Creates a server-authoritative CBT exam session:
 *   1. Validates the authenticated user's profile and subject combo
 *   2. Checks the one-attempt-per-track constraint BEFORE creating session
 *   3. Randomly selects question IDs server-side (never exposes correct_option)
 *   4. Creates cbt_sessions record with expiry
 *   5. Returns session ID + question content (safe view, no correct_option)
 *
 * Security:
 *   - JWT required (auth middleware)
 *   - correct_option NEVER returned — questions fetched from cbt_questions_safe view
 *   - Question IDs are server-selected, not client-supplied
 *   - Session expires server-side; expired sessions cannot be submitted
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
  ValidSubject,
  ValidTrack,
} from "../_shared/utils.ts";

const TIME_LIMIT_SECONDS = 1800; // 30 minutes — JAMB standard

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") return err("Method not allowed", 405, origin);

  // ---- Auth ----
  const auth = await requireAuth(req);
  if (!auth) return err("Unauthorized", 401, origin);
  const { user } = auth;

  // ---- Parse & validate body ----
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400, origin);
  }

  const { subject, track_type, topic = null, mode = "solo" } = body;

  if (!isValidSubject(subject)) {
    return err("Invalid subject. Must be: accounts, biology, economics, commerce", 400, origin);
  }
  if (!isValidTrack(track_type)) {
    return err("Invalid track_type. Must be: subject, topic, combination", 400, origin);
  }
  if (mode !== "solo" && mode !== "peer") {
    return err("Invalid mode. Must be: solo, peer", 400, origin);
  }
  if (track_type === "topic" && (typeof topic !== "string" || !topic.trim())) {
    return err("topic is required when track_type is 'topic'", 400, origin);
  }

  const svc = serviceClient();

  // ---- Check CBT Premium Subscription or Free Trial ----
  const now = new Date();
  const { data: sub } = await svc
    .from("subscriptions")
    .select("id, status, access_expires_at")
    .eq("user_id", user.id)
    .eq("plan_type", "cbt_premium")
    .eq("status", "success")
    .order("access_expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isSubscribed = Boolean(
    sub && (!sub.access_expires_at || new Date(sub.access_expires_at) > now)
  );

  // If candidate is not subscribed to CBT Premium, enforce 1 free trial attempt per track+subject
  if (!isSubscribed) {
    const { data: existingAttempt } = await svc
      .from("cbt_attempts")
      .select("id")
      .eq("user_id", user.id)
      .eq("track_type", track_type)
      .eq("subject", subject)
      .eq("exam_type", "JAMB")
      .limit(1)
      .maybeSingle();

    if (existingAttempt) {
      return new Response(
        JSON.stringify({
          error: `You have completed your free trial attempt for ${subject} (${track_type}). Subscribe to CBT Premium to unlock unlimited mock tests and full question bank access.`,
          requires_subscription: true,
          plan_type: "cbt_premium",
          amount_kobo: 350000,
          trial_exhausted: true,
        }),
        {
          status: 402, // Payment Required
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      );
    }
  }

  // ---- Check user profile exists and is aspirant ----
  const { data: profile, error: profileErr } = await svc
    .from("profiles")
    .select("user_type, jamb_subjects, is_active")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) return err("Profile not found", 404, origin);
  if (!profile.is_active) return err("Account suspended", 403, origin);
  if (profile.user_type !== "aspirant") {
    return err("CBT is only available for aspirants", 403, origin);
  }

  // ---- Validate subject combination (for 'combination' track) ----
  if (track_type === "combination") {
    const userSubjects: string[] = profile.jamb_subjects || [];
    if (!userSubjects.includes(subject as string)) {
      return err(
        `Subject '${subject}' is not in your registered JAMB combination`,
        400,
        origin,
      );
    }
  }

  // ---- Select randomized question IDs ----
  let questionIds: string[];
  try {
    questionIds = await selectRandomQuestions(
      subject as ValidSubject,
      track_type as ValidTrack,
      topic as string | null,
      svc,
    );
  } catch (e) {
    return err((e as Error).message, 422, origin);
  }

  if (questionIds.length === 0) {
    return err("No questions available for this subject/track. Contact support.", 404, origin);
  }

  // ---- Create the session record ----
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TIME_LIMIT_SECONDS * 1000);

  const { data: session, error: sessionErr } = await svc
    .from("cbt_sessions")
    .insert({
      user_id: user.id,
      mode,
      track_type,
      subject,
      exam_type: "JAMB",
      question_ids: questionIds,
      total_questions: questionIds.length,
      time_limit_seconds: TIME_LIMIT_SECONDS,
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id, started_at, expires_at, total_questions")
    .single();

  if (sessionErr || !session) {
    console.error("Session creation error:", sessionErr);
    return err("Failed to create session. Please try again.", 500, origin);
  }

  // ---- Fetch question content (SAFE view — no correct_option) ----
  const { data: questions, error: qErr } = await svc
    .from("cbt_questions_safe")
    .select("id, question_number, context_text, question_text, options, has_diagram, diagram_url")
    .in("id", questionIds)
    .order("question_number", { ascending: true });

  if (qErr || !questions) {
    console.error("Question fetch error:", qErr);
    return err("Failed to load questions. Please try again.", 500, origin);
  }

  return ok({
    session: {
      id: session.id,
      started_at: session.started_at,
      expires_at: session.expires_at,
      total_questions: session.total_questions,
      time_limit_seconds: TIME_LIMIT_SECONDS,
    },
    questions,
  }, origin);
});
