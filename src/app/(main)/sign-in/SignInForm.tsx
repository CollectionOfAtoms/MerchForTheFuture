"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction } from "@/app/actions/auth";

export default function SignInPage() {
  const [state, action, pending] = useActionState(signInAction, undefined);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm rounded-2xl border border-tuscan-sun/30 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-cerulean mb-1">Sign in</h1>
        <p className="text-sm text-dark-cyan mb-8">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-blue-slate underline underline-offset-2 hover:text-cerulean">
            Sign up
          </Link>
        </p>

        <form action={action} className="flex flex-col gap-4">
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
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-blue-slate">
                Password
              </label>
              <Link href="/auth/forgot-password" className="text-xs text-dark-cyan hover:text-blue-slate hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-tuscan-sun/40 bg-white px-3 py-2.5 text-sm text-blue-slate placeholder:text-blue-slate/40 focus:outline-none focus:ring-2 focus:ring-cerulean"
              placeholder="••••••••"
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
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
