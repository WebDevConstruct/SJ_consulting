import { supabase } from "@/lib/supabase";

// ============================================================
// 1. UNILAG ADMISSION ANALYSIS ENGINE
// ============================================================

export interface AdmissionAnalysisParams {
  programmeSlug: string; // e.g. 'accounting', 'medicine-and-surgery', 'law'
  jambScore: number; // e.g. 285
  utmeSubjects: Record<string, number>; // e.g. {"English Language": 72, "Mathematics": 68, "Economics": 75}
  olevelGrades: Record<string, string>; // e.g. {"English Language": "A1", "Mathematics": "B2", "Economics": "A1"}
  sittings?: number; // default 1
  postUtmeScore?: number; // out of 30 (or null if pre-PUME)
  stateOfOrigin?: string; // e.g. 'Lagos', 'Ogun' (matches UNILAG catchment benchmarks)
  session?: string; // default '2024/2025'
}

export interface AdmissionAnalysisResult {
  session: string;
  institution: string;
  programme: {
    slug: string;
    name: string;
    degree: string;
    faculty: string;
  };
  candidate_profile: {
    jamb_score: number;
    post_utme_score: number | null;
    sittings: number;
    state_of_origin: string | null;
  };
  aggregate_breakdown: {
    jamb_contribution: number;
    post_utme_contribution: number;
    olevel_contribution: number;
    total_aggregate: number;
    max_possible: number;
  };
  eligibility: {
    is_eligible: boolean;
    audit_checks: Array<{
      rule: string;
      status: "PASSED" | "FAILED";
      message: string;
    }>;
  };
  benchmark_comparison: {
    benchmark_score: number | null;
    benchmark_type: string;
    difference: number | null;
    verdict: string;
    verdict_color: "green" | "amber" | "red" | "gray";
    source_title: string | null;
    source_url: string | null;
    verified_at: string | null;
  };
  recommended_alternatives: Array<{
    slug: string;
    name: string;
    faculty: string;
    benchmark: number;
    difference: number;
    status: string;
  }>;
  disclaimer: string;
}

/**
 * Runs the UNILAG Admission Analysis Engine via Supabase RPC.
 */
export async function runAdmissionAnalysis(
  params: AdmissionAnalysisParams
): Promise<AdmissionAnalysisResult> {
  const { data, error } = await supabase.rpc("analyze_unilag_admission", {
    p_programme_slug: params.programmeSlug,
    p_jamb_score: params.jambScore,
    p_utme_subjects: params.utmeSubjects,
    p_olevel_grades: params.olevelGrades,
    p_sittings: params.sittings ?? 1,
    p_post_utme_score: params.postUtmeScore ?? null,
    p_state_of_origin: params.stateOfOrigin ?? null,
    p_session: params.session ?? "2024/2025",
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as AdmissionAnalysisResult;
}

// ============================================================
// 2. TESTIMONIALS API
// ============================================================

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  quote: string;
  rating: number;
  is_featured: boolean;
}

/**
 * Fetch approved/featured testimonials for public homepage.
 */
export async function getFeaturedTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from("testimonials")
    .select("id, name, role, quote, rating, is_featured")
    .eq("is_featured", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching testimonials:", error);
    return [];
  }

  return data || [];
}

/**
 * Submit or update a user's own testimonial.
 */
export async function submitUserTestimonial(testimonial: {
  quote: string;
  name: string;
  role: string;
  rating?: number;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Must be logged in to submit a testimonial");

  const { data, error } = await supabase
    .from("testimonials")
    .upsert({
      user_id: user.id,
      name: testimonial.name,
      role: testimonial.role,
      quote: testimonial.quote,
      rating: testimonial.rating ?? 5,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// 3. BLOG POSTS API
// ============================================================

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  subtext: string;
  summary: string | null;
  content: string;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
}

/**
 * Fetch published blog articles.
 */
export async function getPublishedBlogs(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from("blogs")
    .select("id, slug, title, subtext, summary, content, image_url, published_at, created_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("Error fetching blogs:", error);
    return [];
  }

  return data || [];
}

// ============================================================
// 4. ANNOUNCEMENTS / INFORMATION DESK API
// ============================================================

export interface Announcement {
  id: string;
  category: "mentorship" | "unilag" | "jamb" | "accommodation";
  title: string;
  subtext: string;
  content: string;
  summary: string | null;
  image_url: string | null;
  link: string | null;
  location: string | null;
  created_at: string;
}

/**
 * Fetch active announcements/guideline items by category.
 */
export async function getAnnouncements(
  category?: "mentorship" | "unilag" | "jamb" | "accommodation"
): Promise<Announcement[]> {
  let query = supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching announcements:", error);
    return [];
  }

  return data || [];
}

// ============================================================
// 5. CANDIDATE DASHBOARD (single-call aggregation)
// ============================================================

export interface RecentAttempt {
  id: string;
  subject: string;
  track_type: "subject" | "topic" | "combination";
  mode: "solo" | "peer";
  exam_type: string;
  total_questions: number;
  score: number;
  /** Score as a percentage, e.g. 72.5 */
  score_pct: number;
  time_spent_seconds: number;
  attempted_at: string;
}

export interface DashboardAnalysis {
  total_attempts: number;
  /** Overall average score percentage across all attempts */
  avg_score_pct: number | null;
  best_score_pct: number | null;
  total_questions_done: number;
  total_time_seconds: number;
}

export interface SubjectTrend {
  subject: string;
  attempts: number;
  avg_score_pct: number | null;
  best_score_pct: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar_url: string | null;
  leaderboard_score: number;
  /** True only for the currently authenticated user */
  is_caller: boolean;
}

export interface LeaderboardData {
  caller_rank: number | null;
  caller_score: number;
  total_users: number;
  /** 5 users above + caller + 5 users below — contextual, not just top-10 */
  nearby: LeaderboardEntry[];
}

export interface PendingDuel {
  id: string;
  room_code: string;
  subject: string;
  track_type: string;
  status: "waiting" | "in_progress";
  /** Whether the caller is the host or the invited challenger */
  role: "host" | "challenger";
  opponent_username: string | null;
  opponent_avatar: string | null;
  expires_at: string;
  created_at: string;
}

export interface CandidateDashboard {
  recent_attempts: RecentAttempt[];
  analysis: DashboardAnalysis;
  subject_trend: SubjectTrend[];
  leaderboard: LeaderboardData;
  pending_duels: PendingDuel[];
}

/**
 * Fetches everything needed to render the aspirant dashboard in one RPC call.
 *
 * Replaces the three separate endpoints described in the spec:
 *   api/v1/dashboard/cbt_history
 *   api/v1/dashboard/analysis
 *   api/v1/dashboard/leaderboard
 *
 * Usage:
 *   const dashboard = await getCandidateDashboard();
 *   // dashboard.recent_attempts → history cards (max 5)
 *   // dashboard.analysis        → overall stats widget
 *   // dashboard.subject_trend   → bar/radar chart data
 *   // dashboard.leaderboard     → rank card + nearby peers
 *   // dashboard.pending_duels   → open challenge notifications
 */
export async function getCandidateDashboard(): Promise<CandidateDashboard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Must be logged in to fetch dashboard");

  const { data, error } = await supabase.rpc("get_candidate_dashboard", {
    p_user_id: user.id,
  });

  if (error) throw new Error(error.message);

  return data as CandidateDashboard;
}

// ============================================================
// 6. AUTH — USERNAME OR EMAIL LOGIN
// ============================================================

export interface LoginParams {
  /** Either a username (e.g. "johndoe") or a full email address */
  identifier: string;
  password: string;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    created_at: string;
  };
}

/**
 * Sign in using either a username OR an email address.
 *
 * The username → email resolution happens securely on the server inside
 * the auth-login Edge Function. Attackers cannot enumerate usernames or
 * emails from the client side.
 *
 * After calling this, set the session on the Supabase client so that
 * all subsequent requests are authenticated:
 *
 *   const result = await login({ identifier: "johndoe", password: "..." });
 *   await supabase.auth.setSession({
 *     access_token:  result.access_token,
 *     refresh_token: result.refresh_token,
 *   });
 */
export async function login(params: LoginParams): Promise<LoginResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");

  const response = await fetch(`${supabaseUrl}/functions/v1/auth-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: params.identifier.trim(),
      password: params.password,
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    // Surface the server's generic error message (never exposes internal detail)
    throw new Error(body?.error ?? "Login failed. Please try again.");
  }

  // Automatically sync session with supabase client
  if (body?.session?.access_token && body?.session?.refresh_token) {
    await supabase.auth.setSession({
      access_token: body.session.access_token,
      refresh_token: body.session.refresh_token,
    });
  }

  return body as LoginResult;
}

/**
 * Send a password reset link to user's registered email.
 */
export async function sendPasswordResetEmail(
  email: string,
  redirectTo?: string
): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo:
      redirectTo ??
      (typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : undefined),
  });
  if (error) throw new Error(error.message);
}

/**
 * Update authenticated user's password (called on the password reset callback page).
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) throw new Error(error.message);
}

/**
 * Verify a 6-digit email OTP (e.g. signup email confirmation or recovery).
 */
export async function verifyEmailOtp(params: {
  email: string;
  token: string;
  type?: "signup" | "recovery" | "magiclink" | "invite";
}): Promise<{ session: unknown; user: unknown }> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: params.email.trim(),
    token: params.token.trim(),
    type: params.type ?? "signup",
  });
  if (error) throw new Error(error.message);
  return { session: data.session, user: data.user };
}

/**
 * Resend email confirmation token or OTP code.
 */
export async function resendEmailOtp(
  email: string,
  type: "signup" | "recovery" = "signup"
): Promise<void> {
  const { error } = await supabase.auth.resend({
    email: email.trim(),
    type,
  });
  if (error) throw new Error(error.message);
}

/**
 * Sign out active user and clear session tokens.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}


// ============================================================
// 7. PEER MATCHMAKING
// ============================================================

export interface CreateDuelParams {
  subject: "accounts" | "biology" | "economics" | "commerce";
  track_type: "subject" | "topic" | "combination";
  /** Required only when track_type === 'topic' */
  topic?: string;
  /**
   * Optional: pass a username to send a named invite.
   * Omit to create an open room-code challenge instead.
   */
  opponent_username?: string;
}

export interface CreateDuelResult {
  peer_session_id: string;
  room_code: string;
  subject: string;
  track_type: string;
  total_questions: number;
  expires_at: string;
  /** 'named_invite' if opponent_username was passed, else 'room_code' */
  invite_method: "named_invite" | "room_code";
  opponent_username: string | null;
}

/**
 * Create a peer CBT challenge.
 *
 * AFTER calling this:
 *  1. Display `result.room_code` so the host can share it (Method B).
 *  2. Subscribe to the peer session via Supabase Realtime so the host
 *     knows when the opponent joins (see `subscribeToDuelStart`).
 *
 * The opponent:
 *  - Named invite: receives a Realtime INSERT event on cbt_peer_sessions
 *    with their user_id as challenger_user_id → show "Accept challenge" modal.
 *  - Room code: calls `joinPeerDuel({ room_code })` manually.
 */
export async function createPeerDuel(params: CreateDuelParams): Promise<CreateDuelResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");

  const response = await fetch(`${supabaseUrl}/functions/v1/create-peer-duel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
    body: JSON.stringify(params),
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "Failed to create duel");
  return body as CreateDuelResult;
}

export interface CBTQuestion {
  id: string;
  subject: string;
  topic: string | null;
  exam_type: string;
  year: number;
  question_number: number;
  context_text: string | null;
  question_text: string;
  options: { A: string; B: string; C: string; D: string };
  has_diagram: boolean;
  diagram_url: string | null;
}

export interface JoinDuelParams {
  /** 6-char room code (e.g. "JAMB9K"). Provide this OR peer_session_id. */
  room_code?: string;
  /** UUID of the peer session. Provide this OR room_code. */
  peer_session_id?: string;
}

export interface JoinDuelResult {
  peer_session_id: string;
  room_code: string;
  /** The challenger's personal session ID — use this when calling cbt-submit */
  your_session_id: string;
  /** The host's session ID — needed by the host's frontend via Realtime */
  host_session_id: string;
  subject: string;
  track_type: string;
  time_limit_seconds: number;
  started_at: string;
  expires_at: string;
  questions: CBTQuestion[];
}

/**
 * Join an existing peer duel by room code or session ID.
 *
 * Works for both invite methods:
 *   - Named invite: pass `peer_session_id` from the Realtime notification.
 *   - Room code: pass `room_code` from the host's shared code.
 *
 * On success, navigate both players to the CBT screen and start the timer.
 * Each player uses their own `your_session_id` when submitting answers.
 */
export async function joinPeerDuel(params: JoinDuelParams): Promise<JoinDuelResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");

  const response = await fetch(`${supabaseUrl}/functions/v1/join-peer-duel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
    body: JSON.stringify(params),
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "Failed to join duel");
  return body as JoinDuelResult;
}

/**
 * Subscribe to incoming challenge invites for the current user.
 *
 * Mount this on the authenticated layout so any page can show the
 * "You've been challenged!" toast/modal in real-time.
 *
 * Usage:
 *   const { data: { user } } = await supabase.auth.getUser();
 *   const unsub = subscribeToIncomingChallenges(user.id, (invite) => {
 *     showModal(`${invite.host_username} challenged you! Accept?`, () =>
 *       joinPeerDuel({ peer_session_id: invite.peer_session_id })
 *     );
 *   });
 *   // Call unsub() on component unmount
 */
export function subscribeToIncomingChallenges(
  userId: string,
  onInvite: (invite: { peer_session_id: string; subject: string; room_code: string }) => void,
): () => void {
  const channel = supabase
    .channel(`incoming-challenges-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "cbt_peer_sessions",
        filter: `challenger_user_id=eq.${userId}`,
      },
      (payload: { new: { id: string; subject: string; room_code: string } }) => {
        const row = payload.new as {
          id: string;
          subject: string;
          room_code: string;
        };
        onInvite({
          peer_session_id: row.id,
          subject:         row.subject,
          room_code:       row.room_code,
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to a specific duel session starting.
 * The HOST calls this after `createPeerDuel` to know when the challenger joins.
 *
 * Usage:
 *   const unsub = subscribeToDuelStart(peer_session_id, (result) => {
 *     // Navigate host to CBT screen with result.host_session_id
 *   });
 *   // Call unsub() when navigating away
 */
export function subscribeToDuelStart(
  peerSessionId: string,
  onStart: (update: { status: string; started_at: string }) => void,
): () => void {
  const channel = supabase
    .channel(`duel-start-${peerSessionId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "cbt_peer_sessions",
        filter: `id=eq.${peerSessionId}`,
      },
      (payload: { new: { status: string; started_at: string } }) => {
        const row = payload.new as { status: string; started_at: string };
        if (row.status === "in_progress") {
          onStart({ status: row.status, started_at: row.started_at });
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Cancel a waiting duel room (host only, before anyone joins).
 */
export async function cancelPeerDuel(peerSessionId: string): Promise<void> {
  const { error } = await supabase
    .from("cbt_peer_sessions")
    .update({ status: "cancelled" })
    .eq("id", peerSessionId)
    .eq("status", "waiting"); // Only cancel if still waiting

  if (error) throw new Error(error.message);
}

// ============================================================
// 8. SUBJECT COMBINATION VALIDATOR
// ============================================================

export {
  validateSubjectCombination,
  getProgrammesByTrack,
  getProgrammesByFaculty,
  UNILAG_PROGRAMMES,
} from "./subject-validator";
export type {
  ProgrammeRequirement,
  SubjectValidationResult,
} from "./subject-validator";

// ============================================================
// 9. SESSION INACTIVITY AUTO-LOGOUT HOOK
// ============================================================

export { useIdleTimeout } from "./use-idle-timeout";
export type { IdleTimeoutOptions } from "./use-idle-timeout";

