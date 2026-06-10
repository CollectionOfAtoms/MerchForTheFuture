"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/app/actions/account";

interface ProfileFormProps {
  defaultName: string;
  email: string;
}

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900";
const labelClass = "block text-xs font-medium text-stone-600 mb-1";

export default function ProfileForm({ defaultName, email }: ProfileFormProps) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);

  return (
    <form action={action} className="space-y-3">
      {state && "error" in state && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">
          {state.error}
        </div>
      )}
      {state && "success" in state && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          Profile saved.
        </div>
      )}

      <div>
        <label className={labelClass}>Name</label>
        <input
          name="name"
          defaultValue={defaultName}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input
          value={email}
          readOnly
          className="w-full rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm text-stone-500 cursor-not-allowed"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
      >
        {pending ? "Saving…" : "Save Profile"}
      </button>
    </form>
  );
}
