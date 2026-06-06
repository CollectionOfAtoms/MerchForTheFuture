"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resendVerificationEmailAction } from "@/app/actions/auth";

export default function VerifyEmailPage() {
  const [state, action, pending] = useActionState(resendVerificationEmailAction, undefined);
  const success = state && "success" in state;

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm text-center">
        <div className="mb-4 text-4xl">✉️</div>
        <h1 className="text-xl font-semibold text-stone-900 mb-2">Check your email</h1>
        <p className="text-sm text-stone-500 mb-6">
          We&apos;ve sent you a verification link. Click the link in that email to
          activate your account.
        </p>

        {success ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 mb-4">
            <p className="font-medium">Email sent</p>
            <p className="mt-1 text-emerald-700">Check your inbox for a new verification link.</p>
          </div>
        ) : (
          <>
            {state?.error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">
                {state.error}
              </p>
            )}
            <form action={action}>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
              >
                {pending ? "Sending…" : "Resend verification email"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-xs text-stone-400">
          Wrong account?{" "}
          <Link href="/sign-in" className="text-stone-600 hover:underline">
            Sign in with a different email
          </Link>
        </p>
      </div>
    </div>
  );
}
