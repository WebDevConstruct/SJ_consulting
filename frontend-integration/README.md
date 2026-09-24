# SJ Consult — Backend & Supabase Integration Guide

Hey Dimeji, here is the direct, no-fluff summary of the backend integration on this branch (`feat/supabase-integration`).

---

## 1. Backend Architecture (Direct Answer)
We are using **Supabase as our complete backend** (PostgreSQL + Supabase Auth + Row-Level Security + Storage + RPC functions).
- **No custom Express/Nest server is needed**: The frontend queries Supabase directly using `@supabase/supabase-js`.
- **Security**: PostgreSQL Row-Level Security (RLS) ensures candidates can only access/edit their own data, while admins manage blogs, site info, and cut-off marks.
- **Auth**: Supabase handles sign up, email confirmation links, sessions, and JWTs automatically.

---

## 2. What Was Added in This Branch

1. **`src/lib/supabase.ts`**: Initialized Supabase client configured from environment variables.
2. **`src/lib/api.ts`**: Clean, strongly typed helper functions:
   - `runAdmissionAnalysis(params)` — calls the UNILAG Admission Engine RPC.
   - `getFeaturedTestimonials()` — fetches approved testimonials.
   - `submitUserTestimonial(testimonial)` — allows authenticated users to submit/edit their own quote.
   - `getPublishedBlogs()` — loads published articles from the `blogs` table.
   - `getAnnouncements(category?)` — dynamic site updates/guidelines for the homepage.
3. **`src/components/forms/sign-up-form.tsx`**:
   - Wired to `supabase.auth.signUp(...)`.
   - Passes candidate metadata (`name`, `age`, `phone`, `user_profile`, `written_jamb`, `year`).
   - A database trigger automatically creates the corresponding `profiles` row upon signup.
4. **`src/components/forms/sign-in-form.tsx`**:
   - Wired to `supabase.auth.signInWithPassword(...)`.
   - Redirects to `/` on success, displays error alert on failure.
5. **`.env.example`**:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://ahzdspdmjptxkilquhqa.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   ```

---

## 3. UNILAG Admission Analysis Engine (How to Use)

The admission engine runs server-side in PostgreSQL. It calculates the authentic UNILAG admission aggregate, checks requirements, compares against official 2024/2025 cut-offs, and recommends alternative programmes.

### Code Snippet:
```typescript
import { runAdmissionAnalysis } from "@/lib/api";

const result = await runAdmissionAnalysis({
  programmeSlug: "accounting", // e.g. 'accounting', 'medicine-and-surgery', 'law'
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
  postUtmeScore: 24.5, // out of 30 (or omit if pre-PUME)
  stateOfOrigin: "Lagos", // Used to benchmark against UNILAG Catchment Cut-offs
  session: "2024/2025",
});
```

### What `result` Returns:
```json
{
  "session": "2024/2025",
  "programme": {
    "name": "Accounting",
    "slug": "accounting",
    "degree": "B.Sc.",
    "faculty": "Management Sciences"
  },
  "candidate_profile": {
    "sittings": 1,
    "jamb_score": 285,
    "post_utme_score": 24.5,
    "state_of_origin": "Lagos"
  },
  "aggregate_breakdown": {
    "jamb_contribution": 35.63,   // /50
    "post_utme_contribution": 24.50, // /30
    "olevel_contribution": 19.20,  // /20 (A1=4.0, B2=3.6, B3=3.2, C4=2.8, C5=2.4, C6=2.0)
    "total_aggregate": 79.33,     // /100
    "max_possible": 100.00
  },
  "eligibility": {
    "is_eligible": true,
    "audit_checks": [
      { "rule": "Sitting Restriction", "status": "PASSED", "message": "Number of O'Level sittings meets programme criteria." },
      { "rule": "O'Level Credits", "status": "PASSED", "message": "Minimum credit requirements met (5 credits)." }
    ]
  },
  "benchmark_comparison": {
    "benchmark_score": 71.50,
    "benchmark_type": "Catchment (Lagos)",
    "difference": 7.83,
    "verdict": "Competitive (Above Catchment (Lagos) Cut-off)",
    "verdict_color": "green",
    "source_title": "UNILAG 2024/2025 Cut-Off Marks",
    "verified_at": "2026-09-24"
  },
  "recommended_alternatives": [
    { "name": "Mechanical Engineering", "slug": "mechanical-engineering", "status": "Strong Match (Above Cut-off)", "benchmark": 78.50, "difference": 0.83 },
    { "name": "Nursing Science", "slug": "nursing-science", "status": "Strong Match (Above Cut-off)", "benchmark": 76.75, "difference": 2.58 },
    { "name": "Computer Science", "slug": "computer-science", "status": "Strong Match (Above Cut-off)", "benchmark": 76.25, "difference": 3.08 },
    { "name": "Medicine and Surgery", "slug": "medicine-and-surgery", "status": "Competitive Alternative", "benchmark": 82.50, "difference": -3.17 }
  ],
  "disclaimer": "Official UNILAG cut-off marks and admission calculations provided by SJ Consult are for advisory and strategic analysis purposes only."
}
```

---

## 4. Setup Steps
1. Run `npm install` to install `@supabase/supabase-js`.
2. Copy `.env.example` to `.env.local` and paste the Supabase anon key provided by the team.
3. Run `npm run dev`.
