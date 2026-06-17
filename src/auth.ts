import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { verifyCredentials } from "@/lib/auth/login";
import { authConfig } from "@/auth.config";
import { mergeGuestCartOnAuth } from "@/lib/cart/merge";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  session: { strategy: "jwt" },
  events: {
    // Merge any guest cart into the user's cart on a successful sign-in or
    // sign-up (US-MFTF-11.5). Runs only on success, so a failed login never
    // merges. Best-effort: never let a cart failure break authentication.
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        await mergeGuestCartOnAuth(user.id);
      } catch (err) {
        console.error("[auth] guest cart merge failed", err);
      }
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await verifyCredentials(
          credentials.email as string,
          credentials.password as string
        );
        return user ?? null;
      },
    }),
  ],
});
