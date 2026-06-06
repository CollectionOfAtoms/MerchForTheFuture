"use client";

import { useTransition, useState } from "react";
import { updateUserRolesAction } from "@/app/actions/admin";

type Role = "BUYER" | "SELLER" | "ADMIN";
const EDITABLE_ROLES: Role[] = ["SELLER", "ADMIN"];

interface UserRoleEditorProps {
  userId: string;
  currentRoles: string[];
  isSelf: boolean;
}

export default function UserRoleEditor({ userId, currentRoles, isSelf }: UserRoleEditorProps) {
  const [roles, setRoles] = useState<Set<Role>>(new Set(currentRoles as Role[]));
  const [message, setMessage] = useState<{ type: "error" | "ok"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(role: Role) {
    setMessage(null);
    const next = new Set(roles);
    next.has(role) ? next.delete(role) : next.add(role);
    next.add("BUYER"); // always keep BUYER
    setRoles(next);

    startTransition(async () => {
      const result = await updateUserRolesAction(userId, [...next] as Role[]);
      if (result && "error" in result) {
        setMessage({ type: "error", text: result.error });
        setRoles(new Set(roles)); // revert
      } else {
        setMessage({ type: "ok", text: "Saved" });
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
        Buyer
      </span>

      {EDITABLE_ROLES.map((role) => {
        const active = roles.has(role);
        const disabled = isPending || (isSelf && role === "ADMIN");
        return (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => toggle(role)}
            title={isSelf && role === "ADMIN" ? "Cannot remove your own admin role" : undefined}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border ${
              active
                ? role === "ADMIN"
                  ? "bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200"
                  : "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"
                : "bg-white text-stone-400 border-stone-200 hover:border-stone-400 hover:text-stone-600"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {active ? "✓ " : "+ "}{role.charAt(0) + role.slice(1).toLowerCase()}
          </button>
        );
      })}

      {message && (
        <span className={`text-xs ${message.type === "error" ? "text-rose-600" : "text-emerald-600"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
