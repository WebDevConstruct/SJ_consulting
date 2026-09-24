"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "@/components/forms/auth-layout";
import { TextField } from "@/components/forms/text-field";
import { SelectField } from "@/components/forms/select-field";
import { SegmentedControl } from "@/components/forms/segmented-control";

type UserProfile = "aspirant" | "undergraduate";

const YEAR_OPTIONS = [
  { value: "1", label: "Year 1" },
  { value: "2", label: "Year 2" },
  { value: "3", label: "Year 3" },
  { value: "4", label: "Year 4" },
  { value: "5", label: "Year 5" },
];

export function SignUpForm() {
  const [profile, setProfile] = useState<UserProfile>("aspirant");
  const [writtenJamb, setWrittenJamb] = useState<"yes" | "no">("no");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;
    const age = formData.get("age");
    const phone = formData.get("phone") as string;
    const user_profile = profile;
    const written_jamb = writtenJamb;
    const year = formData.get("year");

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          age: age ? parseInt(age as string, 10) : null,
          phone,
          user_profile,
          written_jamb: user_profile === "aspirant" ? written_jamb : null,
          year: user_profile === "undergraduate" ? parseInt(year as string, 10) : null,
        },
      },
    });

    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="We've sent a verification link to your email address."
        footerText="Already verified?"
        footerLinkHref="/signin"
        footerLinkLabel="Sign in"
      >
        <p className="text-[14.5px] leading-relaxed text-current/65">
          Please check your inbox and click the confirmation link to activate your account.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="A few details so we can personalize your dashboard from day one."
      footerText="Already have an account?"
      footerLinkHref="/signin"
      footerLinkLabel="Sign in"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <TextField
          label="Full name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="e.g. Feranmi Adebayo"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Age"
            name="age"
            type="number"
            min={10}
            max={100}
            placeholder="18"
            required
          />
          <TextField
            label="Phone number"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="0801 234 5678"
            required
          />
        </div>

        <TextField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />

        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
        />

        <SegmentedControl
          label="I am a"
          name="user_profile"
          value={profile}
          onChange={(value) => setProfile(value as UserProfile)}
          options={[
            { value: "aspirant", label: "JAMB aspirant" },
            { value: "undergraduate", label: "UNILAG undergraduate" },
          ]}
        />

        {profile === "undergraduate" ? (
          <SelectField
            label="Current year"
            name="year"
            options={YEAR_OPTIONS}
            defaultValue="1"
          />
        ) : (
          <SegmentedControl
            label="Have you written JAMB before?"
            name="written_jamb"
            value={writtenJamb}
            onChange={(value) => setWrittenJamb(value as "yes" | "no")}
            options={[
              { value: "no", label: "Not yet" },
              { value: "yes", label: "Yes" },
            ]}
          />
        )}

        {error && (
          <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-[13.5px] text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="focus-gold mt-2 rounded-sm border border-gold-400 bg-gold-metal-soft px-6 py-3.5 text-[14.5px] font-semibold text-ink shadow-gold transition-transform hover:scale-[1.01] disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
