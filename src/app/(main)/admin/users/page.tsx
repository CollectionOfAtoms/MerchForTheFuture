import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import UserRoleEditor from "./UserRoleEditor";

export const metadata = { title: "Users — Admin" };

/** Show the start of an email, then …, then the last few characters.
 *  e.g. "alice@example.com" → "alice@ex…e.com"  (if over maxLen)
 */
function truncateMid(str: string, maxLen = 22): string {
  if (str.length <= maxLen) return str;
  const tail = 6;
  const head = maxLen - tail - 1; // -1 for the ellipsis character
  return str.slice(0, head) + "…" + str.slice(-tail);
}

export default async function AdminUsersPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, roles: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-stone-900 mb-1">Users</h1>
      <p className="text-sm text-stone-500 mb-8">{users.length} registered user{users.length !== 1 ? "s" : ""}</p>

      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[45%]" />
            <col className="w-[22%]" />
            <col className="w-[33%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Joined</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500">Roles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-4 py-3.5 min-w-0">
                  <p className="font-medium text-stone-900 truncate">{u.name}</p>
                  <p className="text-xs text-stone-400 font-mono">{truncateMid(u.email ?? "")}</p>
                </td>
                <td className="px-4 py-3.5 text-stone-500 text-xs whitespace-nowrap">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3.5">
                  <UserRoleEditor
                    userId={u.id}
                    currentRoles={u.roles as string[]}
                    isSelf={u.id === user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
