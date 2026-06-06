import Stripe from "stripe";
import { prisma } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-04-22.dahlia",
});

interface ConnectAccountInput {
  email: string;
  name: string;
}

export async function createStripeConnectAccount(
  input: ConnectAccountInput
): Promise<string> {
  const account = await stripe.accounts.create({
    type: "express",
    email: input.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  return account.id;
}

export async function linkStripeAccountToUser(
  userId: string,
  stripeAccountId: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error(`User does not exist: ${userId}`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { stripeAccountId },
  });
}

export async function isSellerOnboarded(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error(`User does not exist: ${userId}`);
  }

  return user.stripeAccountId !== null;
}
