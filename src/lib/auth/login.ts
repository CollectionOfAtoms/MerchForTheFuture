import { prisma } from "@/lib/db";
import { verifyPassword } from "./registration";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
}

interface LoginMetadata {
  failedAttempts?: number;
  lastFailedAt?: string;
}

export async function verifyCredentials(
  email: string,
  password: string
): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) return null;

  const locked = await isAccountLocked(email);
  if (locked) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { loginMetadata: {} },
  });

  return { id: user.id, email: user.email, name: user.name, roles: user.roles };
}

export async function recordFailedLogin(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return;

  const meta = ((user.loginMetadata as LoginMetadata) ?? {});
  const attempts = (meta.failedAttempts ?? 0) + 1;

  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: {
      loginMetadata: { failedAttempts: attempts, lastFailedAt: new Date().toISOString() },
    },
  });
}

export async function isAccountLocked(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return false;

  const meta = ((user.loginMetadata as LoginMetadata) ?? {});
  if (!meta.failedAttempts || meta.failedAttempts < MAX_FAILED_ATTEMPTS) return false;

  const lastFailed = meta.lastFailedAt ? new Date(meta.lastFailedAt).getTime() : 0;
  return Date.now() - lastFailed < LOCK_WINDOW_MS;
}
