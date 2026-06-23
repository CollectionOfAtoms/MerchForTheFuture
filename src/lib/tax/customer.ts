import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";

/**
 * Ensure the buyer has a Stripe Customer and return its id (US-5.2). Attaching a
 * Customer to checkout lets Stripe Tax enforce a tax exemption set on that
 * Customer. Idempotent: creates + persists `User.stripeCustomerId` on first call,
 * reuses it afterward. Distinct from the seller `stripeAccountId` (billing portal).
 */
export async function ensureBuyerStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true, email: true, name: true },
  });
  if (!user) throw new Error(`User not found: ${userId}`);
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId },
  });
  await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}
