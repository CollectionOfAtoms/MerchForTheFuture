import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin")) {
    const roles = ((req.auth?.user as { roles?: string[] })?.roles) ?? [];
    if (!roles.includes("ADMIN")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
