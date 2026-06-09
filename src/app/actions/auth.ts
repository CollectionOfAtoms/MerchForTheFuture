"use server";

import { signIn, signOut, auth } from "@/auth";
import {
  registerUser,
  hashPassword,
  createEmailVerificationToken,
  consumeEmailVerificationToken,
} from "@/lib/auth/registration";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/payments/email";

export interface ActionState {
  error?: string;
}

export async function signUpAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const email = ((formData.get("email") as string | null)?.trim() ?? "").toLowerCase();
  const password = (formData.get("password") as string | null) ?? "";

  if (name.length < 2) return { error: "Name must be at least 2 characters." };
  if (!email.includes("@")) return { error: "A valid email address is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  try {
    await registerUser({ email, password, name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/already registered|duplicate|unique/i.test(msg)) {
      return { error: "An account with this email already exists." };
    }
    return { error: "Could not create account. Please try again." };
  }

  const token = await createEmailVerificationToken(email);
  await sendVerificationEmail(email, token, name).catch(
    (e) => console.error("[signUp] verification email failed", e)
  );

  // Sign in and land on the email verification holding page
  await signIn("credentials", { email, password, redirectTo: "/verify-email" });

  return {};
}

export async function signInAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const email = ((formData.get("email") as string | null)?.trim() ?? "").toLowerCase();
  const password = (formData.get("password") as string | null) ?? "";

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    // next-auth throws a redirect "error" internally — let it propagate
    throw err;
  }

  return {};
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function requestPasswordResetAction(
  _prev: ActionState | { success: true } | undefined,
  formData: FormData
): Promise<ActionState | { success: true }> {
  const email = ((formData.get("email") as string | null)?.trim() ?? "").toLowerCase();

  if (!email) return { error: "Email address is required." };
  if (!email.includes("@")) return { error: "A valid email address is required." };

  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    // Invalidate any existing unused tokens for this email
    await prisma.passwordResetToken.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({ data: { token, email, expires } });

    await sendPasswordResetEmail(email, token, user.name).catch(
      (e) => console.error("[requestPasswordReset] email failed", e)
    );
  }

  // Always return success to prevent account enumeration
  return { success: true };
}

export async function resetPasswordAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const token = (formData.get("token") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!token) return { error: "Reset link is missing or invalid." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record) return { error: "This reset link is invalid." };
  if (record.used) return { error: "This reset link has already been used." };
  if (record.expires < new Date()) return { error: "This reset link has expired. Please request a new one." };

  const user = await prisma.user.findUnique({ where: { email: record.email } });
  if (!user) return { error: "Account not found." };

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { token }, data: { used: true } }),
  ]);

  redirect("/sign-in");
}

export async function resendVerificationEmailAction(
  _prev: ActionState | { success: true } | undefined,
  _formData: FormData
): Promise<ActionState | { success: true }> {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) return { error: "You must be signed in to resend a verification email." };

  const user = await prisma.user.findUnique({ where: { email }, select: { emailVerified: true } });
  if (user?.emailVerified) return { error: "Your email address is already verified." };

  // Rate limit: reject if a token was created within the last 60 seconds
  const recent = await prisma.emailVerificationToken.findFirst({
    where: { email, used: false, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent) return { error: "Please wait a moment before requesting another link." };

  // Invalidate existing unused tokens
  await prisma.emailVerificationToken.updateMany({
    where: { email, used: false },
    data: { used: true },
  });

  const token = await createEmailVerificationToken(email);
  await sendVerificationEmail(email, token, session.user?.name).catch(
    (e) => console.error("[resendVerification] email failed", e)
  );

  return { success: true };
}

export async function verifyEmailAction(token: string): Promise<ActionState | { success: true }> {
  try {
    await consumeEmailVerificationToken(token);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return { error: msg || "Verification failed. Please try again." };
  }
}
