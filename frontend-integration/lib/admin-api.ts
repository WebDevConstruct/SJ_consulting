/**
 * Admin API Helpers — SJ Consulting Admin Dashboard
 *
 * All functions in this file require the caller to be authenticated
 * with user_role IN ('admin', 'super_admin'). The admin-content Edge
 * Function enforces this server-side — these helpers just call it cleanly.
 *
 * Usage in Admin Dashboard pages:
 *   import { createAnnouncement, updateBlog, ... } from "@/lib/admin-api";
 *
 * NEVER import this file in customer-facing pages.
 */

import { supabase } from "./supabase";

// ── Shared utility ────────────────────────────────────────────────────────

async function callAdminContent(
  method: "POST" | "PUT" | "DELETE",
  payload: Record<string, unknown>,
): Promise<unknown> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");

  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("Not authenticated");

  const response = await fetch(`${supabaseUrl}/functions/v1/admin-content`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  return body;
}

// ============================================================
// ANNOUNCEMENTS
// ============================================================

export type AnnouncementCategory = "mentorship" | "unilag" | "jamb" | "accommodation";

export interface AnnouncementInput {
  category: AnnouncementCategory;
  title: string;
  subtext: string;
  content: string;
  summary?: string;
  /** Public URL to the announcement image */
  image_url?: string;
  /** Optional external source link — must start with http(s):// */
  link?: string;
  /** Physical location — relevant for accommodation posts */
  location?: string;
  /** ISO date string e.g. "2025-03-01" */
  event_date?: string;
  /** Defaults to true. Set false to save as draft. */
  is_published?: boolean;
}

export interface AnnouncementRecord extends AnnouncementInput {
  id: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Create a new announcement.
 * Maps to: POST /functions/v1/admin-content { resource: "announcement", ...fields }
 */
export async function createAnnouncement(
  input: AnnouncementInput,
): Promise<AnnouncementRecord> {
  return callAdminContent("POST", {
    resource: "announcement",
    ...input,
  }) as Promise<AnnouncementRecord>;
}

/**
 * Update an existing announcement by ID.
 * Maps to: PUT /functions/v1/admin-content { resource: "announcement", id, ...fields }
 */
export async function updateAnnouncement(
  id: string,
  input: Partial<AnnouncementInput>,
): Promise<AnnouncementRecord> {
  return callAdminContent("PUT", {
    resource: "announcement",
    id,
    ...input,
  }) as Promise<AnnouncementRecord>;
}

/**
 * Delete an announcement by ID.
 * Maps to: DELETE /functions/v1/admin-content { resource: "announcement", id }
 */
export async function deleteAnnouncement(id: string): Promise<void> {
  await callAdminContent("DELETE", { resource: "announcement", id });
}

/**
 * Fetch ALL announcements (including unpublished drafts) for the admin table.
 * Regular users only see published ones via getAnnouncements() in api.ts.
 */
export async function getAdminAnnouncements(
  category?: AnnouncementCategory,
): Promise<AnnouncementRecord[]> {
  let query = supabase
    .from("announcements")
    .select(
      "id, category, title, subtext, summary, image_url, link, location, " +
      "event_date, is_published, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AnnouncementRecord[];
}

// ============================================================
// BLOGS
// ============================================================

export interface BlogInput {
  /** URL-safe slug, e.g. "jamb-2025-results-analysis". Required on create. */
  slug?: string;
  title: string;
  subtext: string;
  content: string;
  summary?: string;
  image_url?: string;
  /** ISO timestamp. Defaults to now() when is_published = true. */
  published_at?: string;
  /** Defaults to true. Set false to save as draft. */
  is_published?: boolean;
  /** Pass to rename slug on an update. */
  new_slug?: string;
}

export interface BlogRecord extends BlogInput {
  id: string;
  slug: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Create a new blog post.
 * slug is required. title, subtext, and content are required.
 */
export async function createBlog(input: BlogInput & { slug: string }): Promise<BlogRecord> {
  return callAdminContent("POST", {
    resource: "blog",
    ...input,
  }) as Promise<BlogRecord>;
}

/**
 * Update a blog post by ID or slug.
 * Pass new_slug to rename the URL-slug at the same time.
 */
export async function updateBlog(
  idOrSlug: { id: string } | { slug: string },
  input: Partial<BlogInput>,
): Promise<BlogRecord> {
  return callAdminContent("PUT", {
    resource: "blog",
    ...idOrSlug,
    ...input,
  }) as Promise<BlogRecord>;
}

/**
 * Delete a blog post by ID or slug.
 */
export async function deleteBlog(
  idOrSlug: { id: string } | { slug: string },
): Promise<void> {
  await callAdminContent("DELETE", { resource: "blog", ...idOrSlug });
}

/**
 * Fetch ALL blog posts (including unpublished drafts) for the admin list view.
 */
export async function getAdminBlogs(): Promise<BlogRecord[]> {
  const { data, error } = await supabase
    .from("blogs")
    .select("id, slug, title, subtext, summary, image_url, is_published, published_at, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as BlogRecord[];
}

/**
 * Fetch a single blog post (admin view — returns even if unpublished).
 */
export async function getAdminBlogBySlug(slug: string): Promise<BlogRecord | null> {
  const { data, error } = await supabase
    .from("blogs")
    .select("id, slug, title, subtext, content, summary, image_url, is_published, published_at, created_at, updated_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BlogRecord | null;
}

// ============================================================
// ADMIN USER MANAGEMENT (read-only helpers for admin home)
// ============================================================

export interface AdminUserSummary {
  id: string;
  username: string;
  full_name: string;
  user_type: "aspirant" | "undergraduate";
  user_role: "user" | "admin" | "super_admin";
  is_active: boolean;
  leaderboard_score: number;
  last_active_at: string | null;
  created_at: string;
}

/**
 * Fetch paginated user list for the Admin Home overview.
 * Only accessible to admin/super_admin (enforced by RLS).
 */
export async function getAdminUsers(opts?: {
  page?: number;
  pageSize?: number;
  userType?: "aspirant" | "undergraduate";
}): Promise<{ users: AdminUserSummary[]; total: number }> {
  const page     = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const from     = (page - 1) * pageSize;
  const to       = from + pageSize - 1;

  let query = supabase
    .from("profiles")
    .select(
      "id, username, full_name, user_type, user_role, is_active, " +
      "leaderboard_score, last_active_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts?.userType) {
    query = query.eq("user_type", opts.userType);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    users: (data ?? []) as AdminUserSummary[],
    total: count ?? 0,
  };
}

/**
 * Change a user's platform role (promote to admin, demote to user).
 * Strictly requires super_admin (enforced securely in admin-content Edge Function).
 */
export async function setUserRole(
  userId: string,
  role: "user" | "admin" | "super_admin"
): Promise<AdminUserSummary> {
  const { data, error } = await supabase.functions.invoke("admin-content", {
    method: "PUT",
    body: {
      resource: "user",
      user_id: userId,
      user_role: role,
    },
  });

  if (error || data?.error) {
    throw new Error(data?.error ?? error?.message ?? "Failed to update user role");
  }

  return data as AdminUserSummary;
}

/**
 * Toggle a user's is_active status (suspend or reactivate).
 * Managed securely via admin-content Edge Function.
 */
export async function setUserActive(
  userId: string,
  active: boolean
): Promise<AdminUserSummary> {
  const { data, error } = await supabase.functions.invoke("admin-content", {
    method: "PUT",
    body: {
      resource: "user",
      user_id: userId,
      is_active: active,
    },
  });

  if (error || data?.error) {
    throw new Error(data?.error ?? error?.message ?? "Failed to update user status");
  }

  return data as AdminUserSummary;
}

