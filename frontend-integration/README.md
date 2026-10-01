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

### 5.4 Department Deliverables & Task Milestones:
Track operational and academic tasks across departments (`research`, `media`, `programs`, `admin`, `other`):
```typescript
import {
  getAdminDeliverables,
  createDeliverable,
  updateDeliverable,
  markDeliverableComplete,
  deleteDeliverable,
} from "@/lib/admin-api";

// 1. Fetch team deliverables (filterable by department and status):
const tasks = await getAdminDeliverables({
  department: "programs",
  status: "pending", // "pending" | "in_progress" | "completed" | "overdue"
});

// 2. Create new deliverable:
const newTask = await createDeliverable({
  department: "research",
  title: "Compile 2025/2026 Direct Entry Cut-Off Points",
  description: "Cross-check with UNILAG admissions office bulletin",
  due_date: "2026-10-15",
  assigned_to: "staff-uuid-here",
});

// 3. Mark complete:
await markDeliverableComplete(newTask.id);
```

### 5.5 Staff Payroll & Paystack Disbursements:
Manage batch disbursements to tutors, researchers, and operations staff.
**CEO Governance Rule Enforced**: The creator of a payroll batch cannot approve it—a different `super_admin` must review and authorize.

```typescript
import {
  getPayrollBatches,
  createPayrollBatch,
  approvePayrollBatch,
  rejectPayrollBatch,
} from "@/lib/admin-api";

// 1. Admin/Super Admin creates a disbursement batch:
const batch = await createPayrollBatch({
  description: "October 2026 Tutor Stipends & Question Moderation",
  recipients: [
    {
      name: "Tunde Bakare",
      bank_code: "058", // GTBank
      account_number: "0123456789",
      amount_kobo: 7500000, // 75,000 NGN
      reason: "Biology Question Curation (Batch 1)",
    },
    {
      name: "Chioma Okonjo",
      bank_code: "044", // Access Bank
      account_number: "0987654321",
      amount_kobo: 6000000, // 60,000 NGN
      reason: "Economics Mock Review",
    },
  ],
  notes: "Verified against completed deliverables",
});

// 2. Super Admin reviews & approves (must NOT be the creator):
try {
  await approvePayrollBatch(batch.id);
  alert("Payroll batch approved for disbursement!");
} catch (err: any) {
  alert(err.message); // e.g. "CEO Governance Rule: You cannot approve a payroll batch you created yourself."
}
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

## 9. CBT Exam Engine (Timed Practice & Real Exam)

Server-authoritative examination lifecycle. Correct answers are kept securely on the server and never sent to the candidate browser before grading.

### 9.1 Starting an Exam Session:
```typescript
import { startCBTSession } from "@/lib/api";

// Start a 30-minute timed exam session:
const { session, questions } = await startCBTSession({
  subject: "economics", // "accounts" | "biology" | "economics" | "commerce"
  track_type: "subject", // "subject" | "topic" | "combination"
  mode: "solo", // "solo" | "peer"
});

console.log("Session ID:", session.id);
console.log("Total Questions:", session.total_questions);
console.log("Time Limit (Seconds):", session.time_limit_seconds); // 1800s (30 mins)

// Each question object contains:
// - id: question UUID
// - question_number: 1, 2, 3...
// - context_text: optional comprehension passage or preamble
// - question_text: question prompt
// - options: { A: "...", B: "...", C: "...", D: "..." }
// - has_diagram: boolean
// - diagram_url: optional image URL if has_diagram is true
```

### 9.2 Submitting Answers & Auto-Grading:
```typescript
import { submitCBTSession } from "@/lib/api";

const result = await submitCBTSession({
  session_id: session.id,
  answers: {
    "question-uuid-1": "B",
    "question-uuid-2": "C",
    "question-uuid-3": "A",
  },
});

console.log("Score:", result.score, "/", result.total_questions);
console.log("Percentage:", result.percentage, "%");
console.log("Points Earned:", result.points_earned); // Automatically increments user's leaderboard score!
console.log("Time Spent (seconds):", result.time_spent_seconds);
```

### 9.3 Fetching Past CBT Attempts:
```typescript
import { getCBTAttempts } from "@/lib/api";

const history = await getCBTAttempts();
// Returns array of past attempts with score, percentage, subject, and timestamp
```

---

## 10. Candidate Profile & Onboarding

```typescript
import { getUserProfile, updateUserProfile } from "@/lib/api";

// 1. Fetch current user profile:
const profile = await getUserProfile();
console.log("Profile:", profile.username, profile.user_type, profile.leaderboard_score);

// 2. Update candidate settings / UTME target:
await updateUserProfile({
  full_name: "Feranmi Adebayo",
  target_score: 295,
  desired_programme: "computer-science",
  jamb_subjects: ["English Language", "Mathematics", "Physics", "Chemistry"],
});
```

---

## 11. Account Migration (Aspirant → Undergraduate)

When a candidate successfully secures admission into UNILAG, they can convert their account into an undergraduate account to access GST courses and departmental resources.

```typescript
import { migrateAccount } from "@/lib/api";

try {
  // Requires user password re-confirmation for security
  await migrateAccount({
    password: "userPasswordHere",
    unilag_year: 1, // 1 or 2
  });
  // User is automatically signed out and prompted to sign in with their new undergraduate role!
  router.push("/signin?reason=migrated");
} catch (err: any) {
  alert(err.message);
}
```

---

## 12. Subscriptions & Paystack Checkout

Candidates can unlock full CBT question banks or GST university courses via Paystack.

### 12.1 Check Subscription Status:
```typescript
import { hasActiveSubscription, getUserSubscriptions } from "@/lib/api";

// Check if candidate has active CBT Premium:
const isCBTPremium = await hasActiveSubscription("cbt_premium");

// Check if undergraduate has active GST Year 1 package:
const hasGSTAccess = await hasActiveSubscription("gst_year1");
```

### 12.2 Triggering Paystack Inline Popup:
Include Paystack inline script in your layout or use `react-paystack`:
```typescript
// Example using standard PaystackPop:
function payWithPaystack({ email, amountKobo, planType, userId }: {
  email: string;
  amountKobo: number;
  planType: "cbt_premium" | "gst_year1" | "gst_year2";
  userId: string;
}) {
  const handler = (window as any).PaystackPop.setup({
    key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    email: email,
    amount: amountKobo, // e.g. 500000 kobo = 5,000 NGN
    currency: "NGN",
    metadata: {
      user_id: userId,
      plan_type: planType,
    },
    callback: function (response: any) {
      // Payment successful!
      // The Supabase paystack-webhook Edge Function automatically activates the subscription in the background.
      alert("Payment successful! Reference: " + response.reference);
      window.location.reload();
    },
    onClose: function () {
      console.log("Transaction window closed");
    },
  });
  handler.openIframe();
}
```

---

## 13. Realtime Peer Duel Live Score Tracking

When a 1v1 duel is in progress, subscribe to live score changes so both candidates see when an opponent submits and who wins:

```typescript
import { subscribeToPeerDuelScore } from "@/lib/api";

const unsubscribeScore = subscribeToPeerDuelScore(peerSessionId, (update) => {
  console.log("Host Score:", update.host_score);
  console.log("Challenger Score:", update.challenger_score);
  
  if (update.status === "completed") {
    // Both submitted! Announce winner
    if (update.winner_user_id === currentUserId) {
      alert("Victory! You won the duel and earned +50 bonus points!");
    } else if (update.winner_user_id === null) {
      alert("It's a draw! Well played.");
    } else {
      alert("Duel ended. Better luck next time!");
    }
  }
});

// Cleanup on page unmount:
// unsubscribeScore();
```

---

## 14. Setup & Environment Variables

1. Run `npm install` to ensure `@supabase/supabase-js` is installed.
2. Ensure `.env.local` exists in your Next.js project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://ahzdspdmjptxkilquhqa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...
```
3. Start the dev server: `npm run dev`.

