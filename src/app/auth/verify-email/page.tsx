import Link from "next/link";
import { verifyEmailAction } from "@/app/actions/auth";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailConfirmPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return <VerifyEmailError message="This verification link is missing a token." />;
  }

  const result = await verifyEmailAction(token);

  if ("error" in result) {
    return <VerifyEmailError message={result.error ?? "Verification failed. Please try again."} />;
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm text-center">
        <div className="mb-4 text-4xl">✅</div>
        <h1 className="text-xl font-semibold text-stone-900 mb-2">Email verified</h1>
        <p className="text-sm text-stone-500 mb-6">
          Your email address has been confirmed. You can now access your account.
        </p>
        <Link
          href="/dashboard/buyer"
          className="inline-block w-full rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
        >
          Continue to dashboard →
        </Link>
      </div>
    </div>
  );
}

function VerifyEmailError({ message }: { message: string }) {
  const isExpiredOrUsed = /expired|already used/i.test(message);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-8 shadow-sm text-center">
        <div className="mb-4 text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-stone-900 mb-2">Verification failed</h1>
        <p className="text-sm text-stone-500 mb-6">{message}</p>
        {isExpiredOrUsed && (
          <Link
            href="/verify-email"
            className="inline-block w-full rounded-full bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            Request a new link
          </Link>
        )}
      </div>
    </div>
  );
}
