import { prisma } from "@/lib/db";
import { stripe } from "@/lib/payments/stripe";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";

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

/**
 * Ensure the buyer's Stripe Customer and sync the checkout address onto it (US-5.4
 * follow-up). Attaching this Customer to embedded Checkout pre-fills the address
 * (so the buyer doesn't re-enter it) and lets Stripe Tax compute from the address
 * we already collected instead of waiting for in-iframe entry. Returns the id.
 */
export async function ensureBuyerStripeCustomerWithAddress(
  userId: string,
  address: FulfillmentShippingAddress,
): Promise<string> {
  const customerId = await ensureBuyerStripeCustomer(userId);
  const stripeAddress = {
    line1: address.line1,
    line2: address.line2 ?? undefined,
    city: address.city,
    state: address.state ?? undefined,
    postal_code: address.postal,
    country: address.country,
  };
  await stripe.customers.update(customerId, {
    name: address.name,
    address: stripeAddress,
    shipping: { name: address.name, address: stripeAddress },
  });
  return customerId;
}
