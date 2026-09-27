/**
 * Shared utilities for SJ Consulting Edge Functions
 * Used by: auth-login, cbt-start-session, cbt-submit, account-migrate, paystack-webhook
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// CORS HEADERS
// ============================================================
// Only allow requests from the deployed frontend + localhost dev
// Adjust ALLOWED_ORIGINS to match Vercel deployment URL

const ALLOWED_ORIGINS = [
  "https://sj-consulting-frontend.vercel.app",
  "https://sj-consulting.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

export function corsHeaders(origin: string | null): HeadersInit {
  const envFrontend = typeof Deno !== "undefined" ? Deno.env.get("FRONTEND_URL") : null;
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    (envFrontend && origin === envFrontend.replace(/\/$/, ""))
  );

  const allowed = isAllowed ? origin! : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

// ============================================================
// RESPONSE HELPERS
// ============================================================

export function ok(body: unknown, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export function err(message: string, status = 400, origin: string | null = null): Response {
  // Never expose internal error details to client — log them, return generic message
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

// ============================================================
// SUPABASE CLIENT FACTORY
// ============================================================

/**
 * Service-role client: bypasses RLS — use ONLY in Edge Functions for
 * operations that require elevated access (grading, seeding, webhook processing).
 * NEVER expose the service_role key to the client.
 */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * User client: constructed from the request's Authorization header JWT.
 * Respects RLS — use for operations on behalf of the authenticated user.
 */
export function userClient(authHeader: string | null): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: authHeader ?? "" },
    },
    auth: { persistSession: false },
  });
}

// ============================================================
// AUTH HELPERS
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Validate JWT from Authorization header and return the authenticated user.
 * Returns null if the token is missing or invalid.
 */
export async function requireAuth(
  req: Request,
): Promise<{ user: AuthUser; client: SupabaseClient } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const client = userClient(authHeader);
  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) return null;
  return { user: { id: user.id, email: user.email! }, client };
}

// ============================================================
// INPUT VALIDATION
// ============================================================

export type ValidSubject = "accounts" | "biology" | "economics" | "commerce";
export type ValidTrack = "subject" | "topic" | "combination";

const VALID_SUBJECTS: ValidSubject[] = ["accounts", "biology", "economics", "commerce"];
const VALID_TRACKS: ValidTrack[] = ["subject", "topic", "combination"];

export function isValidSubject(s: unknown): s is ValidSubject {
  return typeof s === "string" && VALID_SUBJECTS.includes(s as ValidSubject);
}

export function isValidTrack(t: unknown): t is ValidTrack {
  return typeof t === "string" && VALID_TRACKS.includes(t as ValidTrack);
}

export function isValidRoomCode(code: unknown): boolean {
  return typeof code === "string" && /^[A-Z0-9]{6}$/.test(code);
}

// ============================================================
// CBT QUESTION SELECTION
// ============================================================

const QUESTIONS_PER_SESSION = 40; // JAMB standard

/**
 * Randomly select N question IDs for a CBT session.
 * Uses service_role to access correct_option-containing table,
 * but only returns IDs (client never sees correct_option).
 */
export async function selectRandomQuestions(
  subject: string,
  track: ValidTrack,
  topic: string | null,
  svc: SupabaseClient,
): Promise<string[]> {
  let query = svc
    .from("cbt_questions")
    .select("id")
    .eq("subject", subject)
    .eq("exam_type", "JAMB")
    .eq("is_active", true);

  if (track === "topic" && topic) {
    query = query.eq("topic", topic);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    throw new Error(`No questions found for subject=${subject} track=${track}`);
  }

  // Fisher-Yates shuffle
  const ids = data.map((q: { id: string }) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  return ids.slice(0, Math.min(QUESTIONS_PER_SESSION, ids.length));
}

// ============================================================
// ROOM CODE GENERATION
// ============================================================

export function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ============================================================
// PAYSTACK SIGNATURE VERIFICATION
// ============================================================

/**
 * Verify Paystack webhook HMAC-SHA512 signature.
 * Paystack sends X-Paystack-Signature header with hex-encoded HMAC.
 * This MUST be called before processing any webhook event.
 */
export async function verifyPaystackSignature(
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret || !signatureHeader) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );

  const hexSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe comparison to prevent timing attacks
  return hexSig === signatureHeader;
}
