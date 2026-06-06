import Link from "next/link";
import { auth } from "@/auth";

export default async function Footer() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <footer className="border-t border-stone-200 bg-white mt-auto">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-500">
        <span>© {new Date().getFullYear()} Merch for the Future. All rights reserved.</span>
        <nav className="flex gap-6">
          <Link href="/browse" className="hover:text-stone-900 transition-colors">Browse</Link>
          {!isLoggedIn && (
            <Link href="/sign-in" className="hover:text-stone-900 transition-colors">Sign in</Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
