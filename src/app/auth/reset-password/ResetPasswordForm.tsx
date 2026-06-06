"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state?.error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          <p>{state.error}</p>
          {/expired|invalid|already been used/i.test(state.error) && (
            <Link href="/auth/forgot-password" className="underline mt-1 block">
              Request a new link
            </Link>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1.5">
          New password
        </label>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-600 mb-1.5">
          Confirm new password
        </label>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900"
        />
      </div>
      <p className="text-xs text-stone-500">Must be at least 8 characters.</p>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
