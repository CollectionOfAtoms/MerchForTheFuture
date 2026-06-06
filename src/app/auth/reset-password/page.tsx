import Link from "next/link";
import { prisma } from "@/lib/db";
import ResetPasswordForm from "./ResetPasswordForm";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  // Validate the token server-side on page load so users see the error
  // immediately rather than only after submitting the form.
  let tokenError: string | null = null;

  if (!token) {
    tokenError = "This reset link is missing a token.";
  } else {
    const record = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record) tokenError = "This reset link is invalid.";
    else if (record.used) tokenError = "This reset link has already been used.";
    else if (record.expires < new Date()) tokenError = "This reset link has expired.";
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        {tokenError ? (
          <>
            <h1 className="text-xl font-semibold text-stone-900 mb-1">Link unavailable</h1>
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 mt-4">
              <p className="font-medium">{tokenError}</p>
              <Link
                href="/auth/forgot-password"
                className="underline mt-2 block text-rose-700 hover:text-rose-900"
              >
                Request a new reset link
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-stone-900 mb-1">Set new password</h1>
            <p className="text-sm text-stone-500 mb-6">Choose a new password for your account.</p>
            <ResetPasswordForm token={token!} />
          </>
        )}
        <p className="mt-6 text-center text-xs text-stone-500">
          <Link href="/sign-in" className="text-stone-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
