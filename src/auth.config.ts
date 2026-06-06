import type { NextAuthConfig } from "next-auth";

// Edge-safe config — no Prisma imports, used by middleware
export const authConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = (user as { roles?: string[] }).roles ?? [];
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      (session.user as { roles?: string[] }).roles = (token.roles as string[]) ?? [];
      return session;
    },
  },
};
