import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ orderId: string }>;
}

/**
 * Per-order checkout entry (original buy-now / auction win). As of US-MFTF-12.4's
 * address-before-payment retrofit, all single-item checkout is unified on
 * /orders/[orderId]/fulfill, which collects the shipping address before payment.
 * This route preserves the buy-now redirect target and forwards there.
 */
export default async function CheckoutPage({ params }: PageProps) {
  const { orderId } = await params;

  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) redirect(`/sign-in?callbackUrl=/checkout/${orderId}`);

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true } });
  if (!order) notFound();
  if (order.buyerId !== user.id) redirect("/");

  redirect(`/orders/${orderId}/fulfill`);
}
