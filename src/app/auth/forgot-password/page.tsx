"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, undefined);

  const success = state && "success" in state;

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900 mb-1">Forgot your password?</h1>
        <p className="text-sm text-stone-500 mb-6">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {success ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
            <p className="font-medium">Check your inbox</p>
            <p className="mt-1 text-emerald-700">
              If that email is registered, you&apos;ll receive a reset link shortly.
            </p>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            {state?.error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {state.error}
              </p>
            )}
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">
                Email address
              </label>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-stone-500">
          Remembered it?{" "}
          <Link href="/sign-in" className="text-stone-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
