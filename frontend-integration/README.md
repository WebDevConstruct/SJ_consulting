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

## 2. Authentication: Complete Flows for All Parties

### 2.1 Sign In (Username OR Email):
Candidates and staff can log in using either their **username** or their **email address**:
```typescript
import { login } from "@/lib/api";

try {
  const result = await login({
    identifier: usernameOrEmail, // e.g., "johndoe" or "john@example.com"
    password: password,
  });

  // result.user contains the authenticated user
  // result.session is automatically set into the supabase client!
  router.push("/dashboard");
} catch (err: any) {
  alert(err.message); // Safe, generic error message (no user enumeration)
}
```

### 2.2 Forgot & Reset Password:
```typescript
import { sendPasswordResetEmail, updatePassword } from "@/lib/api";

// Step 1: Send reset link from Sign In page:
await sendPasswordResetEmail("user@example.com");

// Step 2: On the reset password callback page (/reset-password):
await updatePassword("newSecurePassword123!");
```

### 2.3 Email OTP Verification:
For 6-digit confirmation codes sent to user inboxes:
```typescript
import { verifyEmailOtp, resendEmailOtp } from "@/lib/api";

// Verify 6-digit code:
const { session } = await verifyEmailOtp({
  email: "user@example.com",
  token: "123456",
  type: "signup", // "signup" | "recovery" | "magiclink"
});

// Resend OTP code if expired:
await resendEmailOtp("user@example.com", "signup");
```

### 2.4 15-Minute Session Inactivity Auto-Logout:
Enforces strict 15-minute idle logout without custom backend server cookies:
```typescript
import { useIdleTimeout } from "@/lib/api";

// Place in your root app layout or authenticated dashboard layout:
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  useIdleTimeout({
    timeoutMs: 15 * 60 * 1000, // 15 mins
    warningMs: 13 * 60 * 1000, // 13 mins warning
    onWarning: () => {
      // Optional toast alert to candidate
      alert("You will be logged out in 2 minutes due to inactivity.");
    },
    redirectUrl: "/signin?reason=timeout",
  });

  return <>{children}</>;
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

// Promote or Demote user role (Super Admin only)
import { setUserRole } from "@/lib/admin-api";
await setUserRole("user-uuid", "admin"); // Promotes user to admin
await setUserRole("user-uuid", "user");  // Demotes back to candidate
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

## 7. Authoritative Subject Combination Validator (UNILAG 2025/2026)

Dimeji, use this on candidate registration, CBT track selection, and admission forms to prevent invalid JAMB combinations.

```typescript
import {
  validateSubjectCombination,
  getProgrammesByTrack,
  getProgrammesByFaculty,
  UNILAG_PROGRAMMES,
} from "@/lib/api";

// 1. Validate candidate's selected 4 UTME subjects:
const check = validateSubjectCombination({
  programmeSlug: "law",
  subjects: [
    "English Language",
    "Literature in English",
    "Government",
    "Economics",
  ],
});

if (!check.isValid) {
  // Array of error messages to show under the form fields:
  console.error("Errors:", check.errors);
  // e.g. ["UNILAG Faculty of Law accepts either Economics or Commerce, but NOT both."]
} else {
  console.log("Combination Approved:", check.programme?.name);
}

// 2. Load allowed courses for dropdowns by track:
const scienceCourses = getProgrammesByTrack("science");
const commercialCourses = getProgrammesByTrack("commercial");
const artsCourses = getProgrammesByTrack("arts");
```

---

## 8. Setup & Environment Variables

1. Run `npm install` to ensure `@supabase/supabase-js` is installed.
2. Ensure `.env.local` exists in your Next.js project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://ahzdspdmjptxkilquhqa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```
3. Start the dev server: `npm run dev`.
