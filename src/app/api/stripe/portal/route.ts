import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST() {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Instantiate inside the handler so STRIPE_SECRET_KEY is resolved at request time, not build time
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2026-04-22.dahlia" });

  let customerId = dbUser.stripeAccountId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: dbUser.email, name: dbUser.name ?? undefined });
    customerId = customer.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeAccountId: customerId } });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/buyer/settings`,
  });

  return NextResponse.redirect(portalSession.url);
}
