"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { AuthLayout } from "@/components/forms/auth-layout";
import { TextField } from "@/components/forms/text-field";

export function SignInForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the username or email you signed up with."
      footerText="New to SJ Consult?"
      footerLinkHref="/signup"
      footerLinkLabel="Create an account"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
            <Link
              href="#"
              className="focus-gold text-[13px] text-current/55 hover:text-gold-500"
            >
              Forgot password?
            </Link>
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
