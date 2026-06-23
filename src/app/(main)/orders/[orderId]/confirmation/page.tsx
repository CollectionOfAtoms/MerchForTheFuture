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

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { buyerId: true, status: true, subtotal: true, taxAmount: true, taxJurisdiction: true, totalAmount: true, currency: true },
  });
  if (!order) notFound();
  if (order.buyerId !== user.id) redirect("/");

  const tax = Number(order.taxAmount);
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(n);

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

      {tax > 0 && (
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 text-sm">
          <h2 className="mb-3 font-medium text-stone-900">Order total</h2>
          <dl className="space-y-1">
            <div className="flex justify-between text-stone-600">
              <dt>Subtotal</dt>
              <dd>{money(Number(order.subtotal))}</dd>
            </div>
            <div className="flex justify-between text-stone-600">
              <dt>Tax{order.taxJurisdiction ? ` (${order.taxJurisdiction})` : ""}</dt>
              <dd>{money(tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-1 font-medium text-stone-900">
              <dt>Total</dt>
              <dd>{money(Number(order.totalAmount))}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-stone-500">
            Your full tax breakdown is itemized on the Stripe receipt emailed to you.
          </p>
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
