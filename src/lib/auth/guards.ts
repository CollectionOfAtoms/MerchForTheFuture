import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export async function requireVerifiedAuth(): Promise<{ id: string; email: string; roles: string[] }> {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; roles?: string[] } | undefined;

  if (!user?.id) redirect("/sign-in");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerified: true },
  });

  if (!dbUser?.emailVerified) redirect("/verify-email");

  return { id: user.id, email: user.email ?? "", roles: user.roles ?? [] };
}
