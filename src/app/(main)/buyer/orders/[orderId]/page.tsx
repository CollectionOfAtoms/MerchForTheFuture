import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getOrderDetail } from "@/lib/orders";
import { getOrderShipmentsView } from "@/lib/checkout/shipments";
import OrderShipments from "@/components/OrderShipments";
import CancelOrderButton from "./CancelOrderButton";
import ContactSupportModal from "./ContactSupportModal";

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

const ORDER_STATUS_COLOUR: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
  PROCESSING: "bg-sky-50 text-sky-700",
  SHIPPED: "bg-indigo-50 text-indigo-700",
  DELIVERED: "bg-stone-100 text-stone-600",
  CANCELLED: "bg-red-50 text-red-600",
  REFUNDED: "bg-stone-100 text-stone-500",
};

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { orderId } = await params;

  const session = await auth();
  const user = session?.user;
  const roles = (user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!user || !roles.includes("BUYER")) redirect("/sign-in");

  const order = await getOrderDetail(orderId, user.id!);
  if (!order) notFound();

  // Any order with FulfillmentOrders renders per-shipment groups (US-MFTF-12.6):
  // cart orders, and seller-shipped physical originals (US-MFTF-15.3). The status
  // source is uniform — the buyer never sees who shipped or how it was detected.
  const view = await getOrderShipmentsView(orderId, user.id!);
  if (view) {
    return (
      <main className="min-h-screen bg-stone-50 py-12">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <Link href="/buyer/orders" className="mb-6 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800 transition-colors">
            ← Back to orders
          </Link>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-stone-400">Order #{order.id.slice(-8).toUpperCase()}</p>
              <h1 className="text-lg font-semibold text-stone-900">Your order</h1>
            </div>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              {view?.aggregateStatus ?? "Processing"}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">Total paid ${Number(order.totalAmount).toLocaleString()}</p>

          <div className="mt-6">{view ? <OrderShipments view={view} /> : null}</div>

          {order.shippingLine1 && (
            <div className="mt-6 rounded-xl bg-white border border-stone-200 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">Shipping address</p>
              <p className="text-sm text-stone-700 leading-relaxed">
                {order.shippingName}<br />
                {order.shippingLine1}{order.shippingLine2 && <>, {order.shippingLine2}</>}<br />
                {order.shippingCity}{order.shippingState && `, ${order.shippingState}`} {order.shippingPostal}<br />
                {order.shippingCountry}
              </p>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-stone-200 bg-white px-6 py-4">
            <ContactSupportModal orderId={order.id} />
          </div>
        </div>
      </main>
    );
  }

  const orderRef = order.id.slice(-8).toUpperCase();
  const isPending = order.status === "PENDING";
  const isShipped = order.status === "SHIPPED" || order.status === "DELIVERED";
  const isPrint = order.listingType === "PRINT";
  const shippingConfirmed = !!order.shippingLine1;

  return (
    <main className="min-h-screen bg-stone-50 py-12">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        {/* Back link */}
        <Link
          href="/buyer/orders"
          className="mb-6 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800 transition-colors"
        >
          ← Back to orders
        </Link>

        <div className="mt-4 rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="border-b border-stone-100 px-6 py-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-stone-400 mb-1">Order #{orderRef}</p>
              <h1 className="text-lg font-semibold text-stone-900">
                {order.artwork?.title ?? "Print order"}
              </h1>
              {order.artwork?.artist && (
                <p className="text-sm text-stone-500 mt-0.5">{order.artwork.artist}</p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${ORDER_STATUS_COLOUR[order.status] ?? "bg-stone-100 text-stone-600"}`}
            >
              {ORDER_STATUS_LABEL[order.status] ?? order.status}
            </span>
          </div>

          {/* Artwork / print mockup image */}
          {(order.mockupUrl ?? order.artwork?.thumbnailUrl) && (
            <div className="px-6 pt-6 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={(order.mockupUrl ?? order.artwork!.thumbnailUrl)!}
                alt={order.artwork?.title ?? "Print order"}
                className="max-w-full max-h-96 rounded-xl object-contain"
              />
            </div>
          )}

          {/* Order details */}
          <div className="px-6 py-6 space-y-4">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-50">
                <tr>
                  <td className="py-2.5 text-stone-500">Order date</td>
                  <td className="py-2.5 text-right font-medium text-stone-900">
                    {new Date(order.createdAt).toLocaleDateString("en-US", { dateStyle: "long" })}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-stone-500">Type</td>
                  <td className="py-2.5 text-right font-medium text-stone-900">
                    {isPrint ? "Print" : order.status === "PENDING" ? "Auction win" : "Original purchase"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-stone-500">Total paid</td>
                  <td className="py-2.5 text-right font-medium text-stone-900">
                    ${Number(order.totalAmount).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Shipping address */}
            {shippingConfirmed && (
              <div className="rounded-xl bg-stone-50 px-4 py-4 mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">
                  Shipping address
                </p>
                <p className="text-sm text-stone-700 leading-relaxed">
                  {order.shippingName}
                  <br />
                  {order.shippingLine1}
                  {order.shippingLine2 && <>, {order.shippingLine2}</>}
                  <br />
                  {order.shippingCity}
                  {order.shippingState && `, ${order.shippingState}`}{" "}
                  {order.shippingPostal}
                  <br />
                  {order.shippingCountry}
                </p>
              </div>
            )}

            {/* Tracking */}
            {isShipped && order.trackingNumber && (
              <div className="rounded-xl bg-stone-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-2">
                  Tracking
                </p>
                <p className="text-sm text-stone-700">
                  {order.carrier && <span className="font-medium">{order.carrier}: </span>}
                  {order.trackingNumber}
                </p>
              </div>
            )}

            {/* Print processing estimate */}
            {isPrint && order.status === "PROCESSING" && (
              <p className="text-sm text-stone-500 text-center py-2">
                Est. 5–7 business days for production and delivery.
              </p>
            )}

            {/* PENDING actions */}
            {isPending && (
              <div className="flex flex-col gap-3 pt-2">
                <Link
                  href={`/orders/${order.id}/fulfill`}
                  className="block w-full rounded-full bg-stone-900 px-6 py-3 text-center text-sm font-medium text-white hover:bg-stone-700 transition-colors"
                >
                  Complete your order →
                </Link>
                <CancelOrderButton orderId={order.id} />
              </div>
            )}
          </div>

          {/* Footer — always shown */}
          <div className="border-t border-stone-100 px-6 py-4">
            <ContactSupportModal orderId={order.id} />
          </div>
        </div>
      </div>
    </main>
  );
}
