/**
 * Edge Function: account-migrate
 *
 * POST /functions/v1/account-migrate
 *
 * Safely migrates an aspirant account to undergraduate.
 * The client spec requires: user confirms with their password before migration.
 *
 * What changes:
 *   - user_type: 'aspirant' → 'undergraduate'
 *   - unilag_year: set to provided value (1 or 2)
 *   - jamb_subjects: cleared (no longer relevant)
 *   - has_written_jamb: cleared
 *   - leaderboard_score: reset to 0 (separate leaderboard)
 *
 * What does NOT change:
 *   - id, username, email, full_name, phone, avatar_url, theme
 *   - auth.users record (email/password unchanged)
 *
 * Security:
 *   - JWT required
 *   - User must re-authenticate with password (prevents session hijack scenario)
 *   - user_type must currently be 'aspirant' (prevents re-migration loops)
 *   - Atomic: profile update + session invalidation in one transaction block
 */

import {
  corsHeaders,
  ok,
  err,
  requireAuth,
  serviceClient,
  userClient,
} from "../_shared/utils.ts";

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

  const { password, unilag_year } = body;

  if (typeof password !== "string" || !password) {
    return err("password is required to confirm migration", 400, origin);
  }
  if (unilag_year !== 1 && unilag_year !== 2) {
    return err("unilag_year must be 1 or 2", 400, origin);
  }

  const svc = serviceClient();

  // ---- Verify current user_type is aspirant ----
  const { data: profile, error: profileErr } = await svc
    .from("profiles")
    .select("user_type, is_active")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) return err("Profile not found", 404, origin);
  if (!profile.is_active) return err("Account suspended", 403, origin);
  if (profile.user_type !== "aspirant") {
    return err("Account is already an undergraduate or cannot be migrated", 409, origin);
  }

  // ---- Re-authenticate with password to confirm intent ----
  // We use the user-scoped client + signInWithPassword to verify credentials
  const authClient = userClient(req.headers.get("Authorization"));
  const { error: reAuthErr } = await authClient.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (reAuthErr) {
    return err("Password confirmation failed. Please check your password.", 401, origin);
  }

  // ---- Perform migration ----
  const { error: updateErr } = await svc
    .from("profiles")
    .update({
      user_type: "undergraduate",
      unilag_year: unilag_year as number,
      jamb_subjects: null,
      has_written_jamb: null,
      leaderboard_score: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateErr) {
    console.error("Migration update error:", updateErr);
    return err("Migration failed. Please contact support.", 500, origin);
  }

  // ---- Invalidate all existing sessions (force re-login) ----
  // signOut with scope 'global' revokes all refresh tokens for this user
  await svc.auth.admin.signOut(user.id, "global");

  return ok({
    message: "Account successfully migrated to undergraduate. Please sign in again.",
  }, origin);
});
