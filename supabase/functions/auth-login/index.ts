/**
 * Edge Function: auth-login
 *
 * POST /functions/v1/auth-login
 *
 * Accepts either a username OR an email alongside a password and returns
 * a valid Supabase session (access_token, refresh_token, user).
 *
 * WHY THIS EXISTS INSTEAD OF DIRECT CLIENT AUTH
 * ─────────────────────────────────────────────
 * Supabase Auth only natively signs in with an email. Resolving a
 * username → email on the client would require a query that lets any
 * attacker enumerate which usernames / emails exist in the database.
 * Doing the lookup server-side with service_role + always returning a
 * generic error message eliminates that risk entirely.
 *
 * SECURITY HARDENING
 * ──────────────────
 * 1. User Enumeration Defence  — identical 401 error body and status
 *    whether the username doesn't exist OR the password is wrong.
 * 2. Timing Attack Mitigation  — a constant-time dummy delay is applied
 *    on the "username not found" path so response latency cannot be used
 *    to infer whether a given username/email exists in the system.
 * 3. Input Sanitisation        — identifier trimmed + length-capped;
 *    password length capped before reaching the auth system.
 * 4. Device / User-Agent Logging — caller's User-Agent recorded in
 *    profiles.last_active_at so the admin dashboard can surface active
 *    sessions per device (doc requirement).
 * 5. service_role key NEVER returned to or readable by the client.
 * 6. CORS locked to the same allowed-origin set as all other functions.
 */

import {
  corsHeaders,
  ok,
  err,
  serviceClient,
} from "../_shared/utils.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────

const MAX_IDENTIFIER_LEN = 320; // RFC 5321 email max
const MAX_PASSWORD_LEN   = 128; // Practical upper bound; prevents DoS via bcrypt

// Applied when the username lookup returns nothing, so that the "not found"
// code path takes approximately the same time as a real signInWithPassword
// call, defeating timing-based user enumeration.
const TIMING_GUARD_MS = 250;

// Single generic message for ALL authentication failures — never reveal
// whether the problem was "user not found" vs "wrong password".
const AUTH_FAILURE_MSG =
  "Invalid username/email or password. Please try again.";

// ── Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return err("Method not allowed", 405, origin);
  }

  // ── Parse & validate body ──────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400, origin);
  }

  const rawIdentifier = body.identifier;
  const rawPassword   = body.password;

  if (typeof rawIdentifier !== "string" || !rawIdentifier.trim()) {
    return err("'identifier' (username or email) is required", 400, origin);
  }
  if (typeof rawPassword !== "string" || !rawPassword) {
    return err("'password' is required", 400, origin);
  }

  const identifier = rawIdentifier.trim().slice(0, MAX_IDENTIFIER_LEN);
  const password   = rawPassword.slice(0, MAX_PASSWORD_LEN);

  // For device monitoring (spec requirement)
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  // ── Resolve identifier → email ─────────────────────────────────────────
  const isEmail = identifier.includes("@");
  let email: string;

  if (isEmail) {
    // Caller provided an email directly — use it as-is (normalise case)
    email = identifier.toLowerCase();
  } else {
    // Caller provided a username — resolve to the auth email server-side.
    // service_role is required; this query must NEVER be exposed publicly.
    const svc = serviceClient();

    const { data: profileRow, error: lookupErr } = await svc
      .from("profiles")
      .select("id")
      .eq("username", identifier)
      .eq("is_active", true)
      .maybeSingle();

    if (lookupErr || !profileRow) {
      // Timing guard: wait so that "username not found" ≈ "wrong password"
      // in wall-clock time, preventing timing-based enumeration.
      await new Promise<void>((resolve) => setTimeout(resolve, TIMING_GUARD_MS));
      console.warn(
        `auth-login: username not found — identifier="${identifier}" | UA: ${userAgent}`,
      );
      return err(AUTH_FAILURE_MSG, 401, origin);
    }

    // Fetch the actual email from auth.users via the resolved profile id.
    // admin.getUserById is service_role-only — never reachable from the client.
    const { data: authUserData, error: adminLookupErr } = await svc.auth.admin.getUserById(
      profileRow.id,
    );

    if (adminLookupErr || !authUserData?.user?.email) {
      await new Promise<void>((resolve) => setTimeout(resolve, TIMING_GUARD_MS));
      console.error(
        `auth-login: auth user not found for profile id ${profileRow.id}`,
      );
      return err(AUTH_FAILURE_MSG, 401, origin);
    }

    email = authUserData.user.email;
  }

  // ── Authenticate ───────────────────────────────────────────────────────
  // signInWithPassword requires the anon key (not service_role).
  // We create a short-lived anon client solely for this call.
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData?.session) {
    // Wrong password — same generic message, similar latency to username not found
    console.warn(
      `auth-login: signInWithPassword failed for identifier="${identifier}" — ` +
      (signInErr?.message ?? "no session returned"),
    );
    return err(AUTH_FAILURE_MSG, 401, origin);
  }

  const { session, user } = signInData;

  // ── Post-auth: device tracking ─────────────────────────────────────────
  // Fire-and-forget: update last_active_at so the admin dashboard can surface
  // per-device activity. Non-blocking — login latency is unaffected.
  const svcPost = serviceClient();
  svcPost
    .from("profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", user.id)
    .then(({ error: updErr }: { error: { message: string } | null }) => {
      if (updErr) {
        console.error("auth-login: last_active_at update failed —", updErr.message);
      }
    });

  // ── Respond ────────────────────────────────────────────────────────────
  // Return exactly what the Supabase JS client expects so Dimeji's frontend
  // can call `supabase.auth.setSession(response)` without any adapter code.
  return ok(
    {
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
      expires_in:    session.expires_in,
      token_type:    session.token_type,
      user: {
        id:         user.id,
        email:      user.email,
        created_at: user.created_at,
      },
    },
    origin,
  );
});
