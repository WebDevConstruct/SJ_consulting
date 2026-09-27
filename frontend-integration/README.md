# SJ Consult — Frontend Integration & Architecture Guide

Hey Dimeji, here is the complete, direct, up-to-date integration guide for all backend services, RPCs, Edge Functions, and Realtime channels.

---

## 1. Architecture Summary
- **Backend Stack**: Supabase (PostgreSQL + RLS + Supabase Auth + Edge Functions + Realtime).
- **Client Integration**:
  - `src/lib/supabase.ts` — configured Supabase client singleton.
  - `src/lib/api.ts` — Candidate/Public API (Auth, Candidate Dashboard, Peer Matchmaking, Admission Engine, Testimonials, Announcements, Blogs).
  - `src/lib/admin-api.ts` — Admin Dashboard API (Draft Announcements, Draft Blogs, User Directory & Moderation).
- **Security & Permissions**:
  - Public endpoints use the Supabase Anon Key.
  - Candidate actions use authenticated user session JWTs governed by PostgreSQL Row-Level Security (RLS).
  - Admin management actions are secured with server-side role checks (`admin`, `super_admin`) via Edge Functions and admin RLS policies.

---

## 2. Authentication: Username OR Email Sign In

Candidates can now log in using either their **username** or their **email address**.

### Usage in Components:
Import `login` from `@/lib/api`:
```typescript
import { login } from "@/lib/api";

// In your form submit handler:
try {
  const result = await login({
    identifier: usernameOrEmail, // e.g., "johndoe" or "john@example.com"
    password: password,
  });

  // result.user contains the authenticated user
  // result.session is automatically set into the supabase client!
  router.push("/dashboard");
} catch (err: any) {
  // Always returns generic, safe error message (e.g. "Invalid email/username or password")
  alert(err.message);
}
```

---

## 3. Candidate Dashboard (Single-Call RPC)

The candidate dashboard loads all necessary data in **one single round-trip** via `getCandidateDashboard()`. No need to make multiple queries for attempts, stats, and rankings.

### Code Snippet:
```typescript
import { getCandidateDashboard } from "@/lib/api";

// Automatically uses the active authenticated user's ID
const dashboardData = await getCandidateDashboard();
```

### Data Shape Returned:
```typescript
{
  recent_attempts: [
    {
      session_id: "...",
      subject: "economics",
      track_type: "subject",
      score: 35,
      total_questions: 40,
      percentage: 87.5,
      time_spent_seconds: 1420,
      completed_at: "2026-09-27T03:00:00Z"
    }
  ],
  analysis: {
    total_sessions: 12,
    avg_score_percentage: 78.4,
    best_score_percentage: 95.0,
    total_time_spent_seconds: 15400,
    strongest_subject: "economics",
    weakest_subject: "biology"
  },
  subject_trend: [
    {
      subject: "economics",
      sessions_count: 5,
      avg_score: 82.0,
      best_score: 95.0,
      latest_score: 87.5
    },
    {
      subject: "biology",
      sessions_count: 4,
      avg_score: 65.0,
      best_score: 72.5,
      latest_score: 70.0
    }
  ],
  leaderboard: {
    caller_rank: 4,
    total_candidates: 128,
    window: [
      { rank: 1, user_id: "...", username: "top_gun", avg_score: 96.2, total_sessions: 24, is_caller: false },
      { rank: 4, user_id: "...", username: "you", avg_score: 78.4, total_sessions: 12, is_caller: true }
    ]
  },
  pending_duels: [
    {
      peer_session_id: "...",
      room_code: "K7X2P9",
      subject: "accounts",
      challenger_username: "solomon",
      created_at: "2026-09-27T03:45:00Z"
    }
  ]
}
```

---

## 4. Peer Matchmaking Engine (1v1 Duels)

Candidates can challenge peers either via a **6-character room code** or by **direct username invite**, with instant Realtime notifications.

### 4.1 Creating a Challenge:
```typescript
import { createPeerDuel } from "@/lib/api";

// Option A: Create open room with a 6-character code
const duel = await createPeerDuel({
  subject: "economics",
  track_type: "subject",
});
console.log("Room Code:", duel.room_code); // e.g. "A3B9Z1"

// Option B: Direct challenge to a specific friend
const directDuel = await createPeerDuel({
  subject: "biology",
  track_type: "topic",
  topic: "Genetics",
  opponent_username: "dimeji_aspirant",
});
```

### 4.2 Joining a Challenge:
```typescript
import { joinPeerDuel } from "@/lib/api";

// Join by Room Code
const result = await joinPeerDuel({ room_code: "A3B9Z1" });

// OR join from an incoming challenge alert by peer_session_id
const result = await joinPeerDuel({ peer_session_id: duel.peer_session_id });

// result contains:
// - cbt_session_id: your candidate session row ID
// - questions: identical shuffled question pool (without answers) for competitive fairness!
```

### 4.3 Realtime Listeners:
```typescript
import { subscribeToIncomingChallenges, subscribeToDuelStart, cancelPeerDuel } from "@/lib/api";

// 1. Listen for real-time incoming challenge notifications on candidate's screen:
const unsubscribeChallenges = subscribeToIncomingChallenges(currentUserId, (challenge) => {
  // Show pop-up toast: "solomon challenged you to an Economics duel!"
  console.log("Incoming challenge:", challenge.peer_session_id, challenge.room_code);
});

// 2. Waiting Room lobby listener (host waits for opponent to join):
const unsubscribeHostLobby = subscribeToDuelStart(duel.peer_session_id, (startedDuel) => {
  // Opponent joined! Redirect host to the CBT testing interface
  router.push(`/cbt/duel/${startedDuel.peer_session_id}`);
});

// 3. Cancel waiting room before anyone joins:
await cancelPeerDuel(duel.peer_session_id);
```

---

## 5. Admin Management API (`@/lib/admin-api`)

All admin dashboard routes (`/admin/*`) should import from `@/lib/admin-api`. Non-admin users are rejected with `403 Forbidden`.

### 5.1 Announcements:
```typescript
import {
  getAdminAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "@/lib/admin-api";

// Fetch all announcements (including drafts)
const announcements = await getAdminAnnouncements();

// Create new announcement
const newPost = await createAnnouncement({
  title: "2025/2026 UNILAG Post-UTME Registration Opened",
  content: "Registration details and step-by-step instructions...",
  category: "general", // "general" | "post_utme" | "cut_off" | "accommodation" | "admission_list"
  is_published: true,
  image_url: "https://...",
  link: "https://...",
});

// Update or delete
await updateAnnouncement("announcement-uuid", { is_published: false });
await deleteAnnouncement("announcement-uuid");
```

### 5.2 Blog Posts:
```typescript
import {
  getAdminBlogs,
  getAdminBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
} from "@/lib/admin-api";

// Fetch all blogs (including unpublished drafts)
const blogs = await getAdminBlogs();

// Create blog post
const post = await createBlog({
  title: "How to Score 300+ in JAMB UTME",
  slug: "how-to-score-300-in-jamb-utme",
  excerpt: "The ultimate preparation blueprint...",
  content: "# Full markdown content...",
  category: "Strategy",
  tags: ["JAMB", "Study Tips"],
  reading_time_minutes: 6,
  is_published: true,
});

// Update blog (supports slug rename via new_slug)
await updateBlog("post-uuid", {
  title: "Updated Title",
  new_slug: "updated-slug-here",
});

// Delete blog
await deleteBlog("post-uuid");
```

### 5.3 User Directory & Account Moderation:
```typescript
import { getAdminUsers, setUserActive } from "@/lib/admin-api";

// Paginated candidate list
const { users, totalCount } = await getAdminUsers({
  page: 1,
  pageSize: 20,
  userType: "aspirant", // "aspirant" | "undergraduate" | "alumni" | "all"
});

// Suspend or Reactivate a candidate account
await setUserActive("user-uuid", false); // Suspends user
await setUserActive("user-uuid", true);  // Reactivates user
```

---

## 6. UNILAG Admission Analysis Engine

Server-side aggregate calculator and cut-off mark comparison.

```typescript
import { runAdmissionAnalysis } from "@/lib/api";

const result = await runAdmissionAnalysis({
  programmeSlug: "accounting",
  jambScore: 285,
  utmeSubjects: {
    "English Language": 72,
    "Mathematics": 68,
    "Economics": 75,
    "Accounting": 70,
  },
  olevelGrades: {
    "English Language": "A1",
    "Mathematics": "B2",
    "Economics": "A1",
    "Financial Accounting": "B2",
    "Commerce": "A1",
  },
  sittings: 1,
  postUtmeScore: 24.5,
  stateOfOrigin: "Lagos",
  session: "2024/2025",
});
```

---

## 7. Setup & Environment Variables

1. Run `npm install` to ensure `@supabase/supabase-js` is installed.
2. Ensure `.env.local` exists in your Next.js project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://ahzdspdmjptxkilquhqa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```
3. Start the dev server: `npm run dev`.
