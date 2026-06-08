"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "@/app/actions/auth";

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUpAction, undefined);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm rounded-2xl border border-tuscan-sun/30 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-cerulean mb-1">Create an account</h1>
        <p className="text-sm text-dark-cyan mb-8">
          Already have one?{" "}
          <Link href="/sign-in" className="text-blue-slate underline underline-offset-2 hover:text-cerulean">
            Sign in
          </Link>
        </p>

        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium text-blue-slate">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className="rounded-lg border border-tuscan-sun/40 bg-white px-3 py-2.5 text-sm text-blue-slate placeholder:text-blue-slate/40 focus:outline-none focus:ring-2 focus:ring-cerulean"
              placeholder="Jane Smith"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-blue-slate">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-lg border border-tuscan-sun/40 bg-white px-3 py-2.5 text-sm text-blue-slate placeholder:text-blue-slate/40 focus:outline-none focus:ring-2 focus:ring-cerulean"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-blue-slate">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="rounded-lg border border-tuscan-sun/40 bg-white px-3 py-2.5 text-sm text-blue-slate placeholder:text-blue-slate/40 focus:outline-none focus:ring-2 focus:ring-cerulean"
              placeholder="At least 8 characters"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-full bg-cerulean py-2.5 text-sm font-medium text-white hover:bg-dark-cyan transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-8 text-xs text-blue-slate/50 text-center">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
