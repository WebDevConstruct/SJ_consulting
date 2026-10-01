"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login, sendPasswordResetEmail } from "@/lib/api";
import { AuthLayout } from "@/components/forms/auth-layout";
import { TextField } from "@/components/forms/text-field";

export function SignInForm() {
  const router = useRouter();
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const identifier = formData.get("identifier") as string;
    const password = formData.get("password") as string;

    try {
      await login({ identifier, password });
      router.push("/");
    } catch (err: any) {
      setError(err?.message ?? "Sign in failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;

    try {
      await sendPasswordResetEmail(email);
      setResetSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to send reset link. Please check the email address.");
    } finally {
      setLoading(false);
    }
  };

  if (isForgotPassword) {
    return (
      <AuthLayout
        title="Reset Password"
        subtitle="Enter the email associated with your account to receive a reset link."
        footerText="Remembered your password?"
        footerLinkHref="/signin"
        footerLinkLabel="Back to sign in"
      >
        {resetSent ? (
          <div className="flex flex-col gap-4 text-center">
            <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-4 text-[14px] text-emerald-400">
              Password reset link sent! Check your inbox to choose a new password.
            </div>
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setResetSent(false);
              }}
              className="text-[13.5px] font-semibold text-gold-400 hover:underline"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="flex flex-col gap-5">
            <TextField
              label="Account email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />

            {error && (
              <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-[13.5px] text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="focus-gold mt-1 rounded-sm border border-gold-400 bg-gold-metal-soft px-6 py-3.5 text-[14.5px] font-semibold text-ink shadow-gold transition-transform hover:scale-[1.01] disabled:opacity-50"
            >
              {loading ? "Sending link..." : "Send reset link"}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setError(null);
              }}
              className="text-[13px] text-current/55 hover:text-gold-500"
            >
              Cancel and return to sign in
            </button>
          </form>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the username or email you signed up with."
      footerText="New to SJ Consult?"
      footerLinkHref="/signup"
      footerLinkLabel="Create an account"
    >
      <form onSubmit={handleSignIn} className="flex flex-col gap-5">
        <TextField
          label="Username or email"
          name="identifier"
          type="text"
          autoComplete="username"
          placeholder="you@example.com"
          required
        />

        <div>
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            required
          />
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(true);
                setError(null);
              }}
              className="focus-gold text-[13px] text-current/55 hover:text-gold-500"
            >
              Forgot password?
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-[13.5px] text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="focus-gold mt-1 rounded-sm border border-gold-400 bg-gold-metal-soft px-6 py-3.5 text-[14.5px] font-semibold text-ink shadow-gold transition-transform hover:scale-[1.01] disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}

