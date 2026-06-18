import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { resolveSessionFulfillment } from "@/lib/payments/webhook";
import { getOrderShipmentsView } from "@/lib/checkout/shipments";
import OrderShipments from "@/components/OrderShipments";
import RefreshOnMount from "@/components/RefreshOnMount";

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Cart order confirmation (US-MFTF-12.4). Stripe returns here after embedded
 * checkout. Resolves the session server-side so the order is marked PAID + the
 * cart cleared immediately (the webhook is the durable path). Per-shipment
 * grouping and status are added in US-MFTF-12.6.
 */
export default async function OrderConfirmationPage({ params, searchParams }: PageProps) {
  const { orderId } = await params;
  const { session_id } = await searchParams;

  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) redirect(`/sign-in?callbackUrl=/orders/${orderId}/confirmation`);

  if (session_id) {
    await resolveSessionFulfillment(orderId, session_id).catch((e) =>
      console.error("[confirmation] resolveSessionFulfillment failed", e),
    );
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true, status: true } });
  if (!order) notFound();
  if (order.buyerId !== user.id) redirect("/");

  const shipments = await getOrderShipmentsView(orderId, user.id);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {/* The cart was emptied during this render; refresh once so the nav cart
          badge (rendered in the layout before the clear) updates to 0. */}
      {order.status === "PAID" && <RefreshOnMount />}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-stone-900">Thank you — your order is in!</h1>
        <p className="mt-3 text-stone-600">
          {order.status === "PAID" || order.status === "PROCESSING"
            ? "Payment received. We're preparing your items — you'll get tracking as each shipment goes out."
            : "We're confirming your payment. You'll receive an email shortly."}
        </p>
        <p className="mt-2 text-sm text-stone-500">Order #{orderId}</p>
      </div>

      {shipments && shipments.shipments.length > 1 && (
        <p className="mt-8 text-sm text-stone-600">
          Your order ships in {shipments.shipments.length} shipments — they may arrive separately.
        </p>
      )}
      {shipments && (
        <div className="mt-4">
          <OrderShipments view={shipments} />
        </div>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/buyer/orders"
          className="inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700"
        >
          View your orders
        </Link>
      </div>
    </main>
  );
}
