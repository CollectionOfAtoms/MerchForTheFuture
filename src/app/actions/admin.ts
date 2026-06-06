"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Role = "BUYER" | "SELLER" | "ADMIN";
const VALID_ROLES = new Set<Role>(["BUYER", "SELLER", "ADMIN"]);

export async function updateUserRolesAction(
  userId: string,
  roles: Role[]
): Promise<{ error: string } | { ok: true }> {
  const session = await auth();
  const caller = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!caller?.id || !caller.roles?.includes("ADMIN")) return { error: "Unauthorized." };

  if (!roles.every((r) => VALID_ROLES.has(r))) return { error: "Invalid roles." };
  if (!roles.includes("BUYER")) return { error: "BUYER role cannot be removed." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found." };

  await prisma.user.update({ where: { id: userId }, data: { roles: roles as never } });
  return { ok: true };
}
