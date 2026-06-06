import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";

interface RegisterUserInput {
  email: string;
  password: string;
  name: string;
}

interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  roles: Role[];
  emailVerified: Date | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(input: RegisterUserInput): Promise<PublicUser> {
  const { email: rawEmail, password, name } = input;
  const email = rawEmail.toLowerCase();

  if (!email || !email.includes("@")) {
    throw new Error("A valid email address is required.");
  }
  if (!password) {
    throw new Error("A password is required.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("This email address is already registered.");
  }

  const passwordHash = await hashPassword(password);

  // Web registration always creates a BUYER. Privileged roles (SELLER, ADMIN)
  // are assigned manually — they cannot be claimed through sign-up.
  const user = await prisma.user.create({
    data: { email, passwordHash, name, roles: ["BUYER"] },
    select: { id: true, email: true, name: true, roles: true, emailVerified: true },
  });

  return user;
}

export async function createEmailVerificationToken(email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.emailVerificationToken.create({ data: { token, email, expires } });
  return token;
}

export async function consumeEmailVerificationToken(token: string): Promise<void> {
  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });

  if (!record) throw new Error("Invalid verification token.");
  if (record.used) throw new Error("This verification link was already used.");
  if (record.expires < new Date()) throw new Error("This verification link has expired.");

  await prisma.$transaction([
    prisma.user.update({ where: { email: record.email }, data: { emailVerified: new Date() } }),
    prisma.emailVerificationToken.update({ where: { token }, data: { used: true } }),
  ]);
}

export async function verifyEmailToken(identifier: string, token: string): Promise<void> {
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record || record.identifier !== identifier) {
    throw new Error("Invalid verification token.");
  }

  if (record.expires < new Date()) {
    throw new Error("Verification token has expired.");
  }

  await prisma.user.update({
    where: { email: identifier },
    data: { emailVerified: new Date() },
  });

  await prisma.verificationToken.delete({ where: { token } });
}
