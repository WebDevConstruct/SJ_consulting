/**
 * Edge Function: admin-content
 *
 * POST   /functions/v1/admin-content  → create
 * PUT    /functions/v1/admin-content  → update (pass id / slug in body)
 * DELETE /functions/v1/admin-content  → delete (pass id / slug in body)
 *
 * Manages two content resources:
 *   resource = "announcement"  → announcements table
 *   resource = "blog"          → blogs table
 *
 * This single function handles all admin content writes so there is
 * one auth gate and one audit log point rather than six separate functions.
 *
 * Security:
 *   - JWT required.
 *   - Admin gate: caller must have user_role IN ('admin', 'super_admin')
 *     in the profiles table, checked via service_role (never RLS-bypassed for data).
 *   - service_role used for writes (RLS on these tables requires admin role;
 *     the role check above IS the access control — service_role is just the
 *     mechanism to perform the write after that check passes).
 *   - All string inputs are trimmed and length-capped.
 *   - URL fields are validated against https?:// regex before insert/update.
 *   - Slug format validated: lowercase alphanumeric and hyphens only.
 *   - Announcement category must be one of the four valid enum values.
 *   - Error messages never expose internal DB errors.
 */

import {
  corsHeaders,
  ok,
  err,
  requireAuth,
  serviceClient,
} from "../_shared/utils.ts";

type AnnouncementCategory = "mentorship" | "unilag" | "jamb" | "accommodation";
type Resource = "announcement" | "blog" | "user";

const VALID_CATEGORIES: AnnouncementCategory[] = [
  "mentorship", "unilag", "jamb", "accommodation",
];
const URL_REGEX = /^https?:\/\/.+/;
const SLUG_REGEX = /^[a-z0-9-]+$/;

const MAX = {
  title:    200,
  subtext:  500,
  content:  50_000,
  summary:  600,
  slug:     100,
  location: 200,
  link:     2_048,
  image_url: 2_048,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function trim(v: unknown, max: number): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, max);
}

function validateUrl(v: unknown, field: string): string | Error {
  if (v === null || v === undefined || v === "") return ""; // optional field
  const s = trim(v, MAX.link);
  if (!s) return "";
  if (!URL_REGEX.test(s)) return new Error(`${field} must start with http:// or https://`);
  return s;
}

// ── Admin Gate ────────────────────────────────────────────────────────────

async function requireAdmin(userId: string): Promise<boolean> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("profiles")
    .select("user_role")
    .eq("id", userId)
    .eq("is_active", true)
    .single();

  if (error || !data) return false;
  return ["admin", "super_admin"].includes(data.user_role);
}

// ── Main Handler ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (!["POST", "PUT", "DELETE"].includes(req.method)) {
    return err("Method not allowed. Use POST, PUT, or DELETE.", 405, origin);
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const auth = await requireAuth(req);
  if (!auth) return err("Unauthorized", 401, origin);
  const { user } = auth;

  // ── Admin gate ──────────────────────────────────────────────────────────
  const isAdmin = await requireAdmin(user.id);
  if (!isAdmin) {
    console.warn(`admin-content: non-admin access attempt by user ${user.id}`);
    return err("Forbidden: admin access required", 403, origin);
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400, origin);
  }

  const resource = body.resource as Resource | undefined;
  if (resource !== "announcement" && resource !== "blog" && resource !== "user") {
    return err("'resource' must be 'announcement', 'blog', or 'user'", 400, origin);
  }

  const svc = serviceClient();
  const method = req.method as "POST" | "PUT" | "DELETE";

  if (resource === "announcement") {
    return handleAnnouncement(method, body, user.id, svc, origin);
  } else if (resource === "blog") {
    return handleBlog(method, body, user.id, svc, origin);
  } else {
    return handleUser(method, body, user.id, svc, origin);
  }
});

// ── ANNOUNCEMENT CRUD ────────────────────────────────────────────────────

async function handleAnnouncement(
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown>,
  userId: string,
  svc: ReturnType<typeof serviceClient>,
  origin: string | null,
): Promise<Response> {

  if (method === "DELETE") {
    const id = trim(body.id, 36);
    if (!id) return err("'id' is required for DELETE", 400, origin);

    const { error } = await svc.from("announcements").delete().eq("id", id);
    if (error) {
      console.error("admin-content announcement DELETE:", error.message);
      return err("Failed to delete announcement", 500, origin);
    }
    return ok({ deleted: true, id }, origin);
  }

  // ── Validate fields ────────────────────────────────────────────────────
  const category = trim(body.category, 50) as AnnouncementCategory | null;
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return err(
      `'category' must be one of: ${VALID_CATEGORIES.join(", ")}`,
      400, origin,
    );
  }

  const title   = trim(body.title,   MAX.title);
  const subtext = trim(body.subtext, MAX.subtext);
  const content = trim(body.content, MAX.content);

  if (!title)   return err("'title' is required",   400, origin);
  if (!subtext) return err("'subtext' is required", 400, origin);
  if (!content) return err("'content' is required", 400, origin);

  const summary    = trim(body.summary,  MAX.summary)  ?? null;
  const location   = trim(body.location, MAX.location) ?? null;
  const event_date = (typeof body.event_date === "string" && body.event_date)
    ? body.event_date.trim()
    : null;

  // URL fields — optional but validated when present
  const imageUrlResult = validateUrl(body.image_url, "image_url");
  if (imageUrlResult instanceof Error) return err(imageUrlResult.message, 400, origin);
  const image_url = imageUrlResult || null;

  const linkResult = validateUrl(body.link, "link");
  if (linkResult instanceof Error) return err(linkResult.message, 400, origin);
  const link = linkResult || null;

  const is_published = body.is_published !== false; // default true

  const payload = {
    category,
    title,
    subtext,
    content,
    summary,
    image_url,
    link,
    location,
    event_date,
    is_published,
    posted_by: userId,
  };

  if (method === "POST") {
    const { data, error } = await svc
      .from("announcements")
      .insert(payload)
      .select("id, category, title, subtext, summary, link, location, is_published, created_at")
      .single();

    if (error) {
      console.error("admin-content announcement POST:", error.message);
      return err("Failed to create announcement", 500, origin);
    }
    return ok(data, origin);
  }

  // PUT — requires id
  const id = trim(body.id, 36);
  if (!id) return err("'id' is required for PUT", 400, origin);

  const { data, error } = await svc
    .from("announcements")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, category, title, subtext, summary, link, location, is_published, updated_at")
    .single();

  if (error) {
    console.error("admin-content announcement PUT:", error.message);
    return err("Failed to update announcement", 500, origin);
  }
  if (!data) return err("Announcement not found", 404, origin);
  return ok(data, origin);
}

// ── BLOG CRUD ─────────────────────────────────────────────────────────────

async function handleBlog(
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown>,
  userId: string,
  svc: ReturnType<typeof serviceClient>,
  origin: string | null,
): Promise<Response> {

  if (method === "DELETE") {
    // Accept either id or slug for deletion
    const id   = trim(body.id, 36);
    const slug = trim(body.slug, MAX.slug);
    if (!id && !slug) return err("'id' or 'slug' is required for DELETE", 400, origin);

    let query = svc.from("blogs").delete();
    query = id ? query.eq("id", id) : query.eq("slug", slug!);

    const { error } = await query;
    if (error) {
      console.error("admin-content blog DELETE:", error.message);
      return err("Failed to delete blog post", 500, origin);
    }
    return ok({ deleted: true, id: id ?? null, slug: slug ?? null }, origin);
  }

  // ── Validate fields ────────────────────────────────────────────────────
  const title   = trim(body.title,   MAX.title);
  const subtext = trim(body.subtext, MAX.subtext);
  const content = trim(body.content, MAX.content);

  if (!title)   return err("'title' is required",   400, origin);
  if (!subtext) return err("'subtext' is required", 400, origin);
  if (!content) return err("'content' is required", 400, origin);

  const summary      = trim(body.summary, MAX.summary) ?? null;
  const is_published = body.is_published !== false;
  const published_at = is_published
    ? (typeof body.published_at === "string" ? body.published_at : new Date().toISOString())
    : null;

  const imageUrlResult = validateUrl(body.image_url, "image_url");
  if (imageUrlResult instanceof Error) return err(imageUrlResult.message, 400, origin);
  const image_url = imageUrlResult || null;

  if (method === "POST") {
    const slug = trim(body.slug, MAX.slug)?.toLowerCase() ?? null;
    if (!slug) return err("'slug' is required for creating a blog post", 400, origin);
    if (!SLUG_REGEX.test(slug)) {
      return err(
        "'slug' must contain only lowercase letters, numbers, and hyphens",
        400, origin,
      );
    }

    const { data, error } = await svc
      .from("blogs")
      .insert({
        slug,
        title,
        subtext,
        content,
        summary,
        image_url,
        is_published,
        published_at,
        posted_by: userId,
      })
      .select("id, slug, title, subtext, summary, is_published, published_at, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return err(`A blog post with slug '${slug}' already exists`, 409, origin);
      }
      console.error("admin-content blog POST:", error.message);
      return err("Failed to create blog post", 500, origin);
    }
    return ok(data, origin);
  }

  // PUT — requires id or slug
  const id   = trim(body.id, 36);
  const slug = trim(body.slug, MAX.slug);
  if (!id && !slug) return err("'id' or 'slug' is required for PUT", 400, origin);

  const updatePayload: Record<string, unknown> = {
    title,
    subtext,
    content,
    summary,
    image_url,
    is_published,
    published_at,
    updated_at: new Date().toISOString(),
  };

  // Allow slug rename on PUT only if new_slug provided
  const newSlug = trim(body.new_slug, MAX.slug)?.toLowerCase() ?? null;
  if (newSlug) {
    if (!SLUG_REGEX.test(newSlug)) {
      return err(
        "'new_slug' must contain only lowercase letters, numbers, and hyphens",
        400, origin,
      );
    }
    updatePayload.slug = newSlug;
  }

  let query = svc
    .from("blogs")
    .update(updatePayload);

  query = id ? query.eq("id", id) : query.eq("slug", slug!);

  const { data, error } = await (query as ReturnType<typeof svc.from>)
    .select("id, slug, title, subtext, summary, is_published, published_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return err(`Slug '${newSlug}' is already taken`, 409, origin);
    }
    console.error("admin-content blog PUT:", error.message);
    return err("Failed to update blog post", 500, origin);
  }
  if (!data) return err("Blog post not found", 404, origin);
  return ok(data, origin);
}

// ── USER MANAGEMENT (ROLE & SUSPENSION) ──────────────────────────────────

async function handleUser(
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown>,
  callerId: string,
  svc: ReturnType<typeof serviceClient>,
  origin: string | null,
): Promise<Response> {
  if (method !== "PUT") {
    return err("Method not allowed for user resource. Use PUT.", 405, origin);
  }

  const targetUserId = trim(body.user_id, 36);
  if (!targetUserId) {
    return err("'user_id' is required", 400, origin);
  }

  const updates: Record<string, unknown> = {};

  // Check if role update is requested
  if (body.user_role !== undefined) {
    const newRole = trim(body.user_role, 20);
    if (!newRole || !["user", "admin", "super_admin"].includes(newRole)) {
      return err("'user_role' must be 'user', 'admin', or 'super_admin'", 400, origin);
    }

    // Role elevation requires super_admin
    const { data: callerProfile } = await svc
      .from("profiles")
      .select("user_role")
      .eq("id", callerId)
      .eq("is_active", true)
      .single();

    if (callerProfile?.user_role !== "super_admin") {
      return err("Forbidden: Only super_admin can modify user roles", 403, origin);
    }

    // Prevent demoting yourself from super_admin if you are the caller
    if (callerId === targetUserId && newRole !== "super_admin") {
      return err("Cannot demote your own super_admin account", 400, origin);
    }

    updates.user_role = newRole;
  }

  // Check if is_active is requested (suspend/reactivate)
  if (typeof body.is_active === "boolean") {
    // Cannot deactivate yourself
    if (callerId === targetUserId && !body.is_active) {
      return err("Cannot deactivate your own account", 400, origin);
    }
    updates.is_active = body.is_active;
  }

  if (Object.keys(updates).length === 0) {
    return err("No valid fields provided to update ('user_role' or 'is_active')", 400, origin);
  }

  const { data, error } = await svc
    .from("profiles")
    .update(updates)
    .eq("id", targetUserId)
    .select("id, username, full_name, user_role, user_type, is_active, updated_at")
    .single();

  if (error) {
    console.error("admin-content user update error:", error.message);
    return err("Failed to update user profile", 500, origin);
  }

  if (!data) return err("User not found", 404, origin);
  return ok(data, origin);
}
