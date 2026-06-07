import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { confirmShippingAction } from "@/app/actions/fulfillment";
import PaymentForm from "@/components/PaymentForm";
import { resolveSessionFulfillment } from "@/lib/payments/webhook";

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}

const FIELD = "w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

export default async function FulfillmentPage({ params, searchParams }: PageProps) {
  const { orderId } = await params;
  const { session_id: sessionId } = await searchParams;

  // If Stripe redirected here after a successful checkout, synchronously fulfill
  // the order so the confirmation view renders on first load (no race condition).
  if (sessionId) {
    try {
      await resolveSessionFulfillment(orderId, sessionId);
    } catch {
      // Non-fatal — fall through and render whatever state the order is in.
    }
  }

  const session = await auth();
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) redirect("/sign-in");

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      originalListing: {
        include: {
          artwork: {
            include: { images: { where: { isPrimary: true }, take: 1 } },
          },
        },
      },
      buyer: true,
    },
  });

  if (!order) notFound();
  if (order.buyerId !== sessionUser.id) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="text-stone-500">You don&apos;t have access to this order.</p>
      </div>
    );
  }

  const artwork = order.originalListing?.artwork;
  const image = artwork?.images[0];
  const shippingConfirmed = !!order.shippingLine1;
  const isPaid = order.status !== "PENDING" && order.status !== "CANCELLED";
  const isCancelled = order.status === "CANCELLED";
  // Payment first: show Stripe section whenever not yet paid; collect shipping after.
  const needsPayment = !isCancelled && !isPaid;
  const needsShipping = isPaid && !shippingConfirmed;

  const defaultAddress = sessionUser.id
    ? await prisma.userAddress.findFirst({ where: { userId: sessionUser.id, isDefault: true } })
    : null;

  return (
    <div className="mx-auto max-w-lg px-6 py-12 space-y-8">
      <h1 className="text-2xl font-semibold text-stone-900">
        {isPaid && shippingConfirmed ? "Order Confirmed" : isPaid ? "Almost Done" : "Complete Your Order"}
      </h1>

      {/* Artwork summary */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex gap-4">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={artwork?.title} className="h-20 w-20 rounded-xl object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-stone-900 truncate">{artwork?.title}</p>
          {artwork?.artist && <p className="text-sm text-stone-500">{artwork.artist}</p>}
          <p className="text-sm text-stone-500 mt-1">
            {order.listingType === "PRINT" ? "Print order" : order.paymentDeadline ? "Auction win" : "Purchase"}
            {" · "}
            <span className="font-medium text-stone-900">${Number(order.totalAmount).toLocaleString()}</span>
          </p>
          {order.paymentDeadline && !isPaid && !isCancelled && (
            <p className="text-xs text-amber-700 mt-1">
              Payment due by {new Date(order.paymentDeadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
        </div>
      </section>

      {isCancelled && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <p className="text-sm text-rose-700 font-medium">The payment window for this order has closed.</p>
          <p className="text-sm text-rose-600 mt-1">Please contact us if you believe this is an error.</p>
        </section>
      )}

      {/* Step 1: Payment */}
      {needsPayment && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-stone-700">Payment</h2>
          <PaymentForm orderId={orderId} amount={Number(order.totalAmount)} currency={order.currency} />
        </section>
      )}

      {/* Step 2: Shipping — collected after payment */}
      {needsShipping && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-stone-700">Shipping Address</h2>
          <form
            action={async (fd) => {
              "use server";
              await confirmShippingAction(orderId, fd);
            }}
            className="space-y-3"
          >
            {[
              { name: "name", label: "Full name", defaultValue: defaultAddress?.name ?? "" },
              { name: "line1", label: "Street address", defaultValue: defaultAddress?.line1 ?? "" },
              { name: "line2", label: "Apt, suite, etc. (optional)", defaultValue: defaultAddress?.line2 ?? "", required: false },
              { name: "city", label: "City", defaultValue: defaultAddress?.city ?? "" },
              { name: "state", label: "State / Province", defaultValue: defaultAddress?.state ?? "", required: false },
              { name: "postal", label: "Postal code", defaultValue: defaultAddress?.postal ?? "" },
              { name: "country", label: "Country", defaultValue: defaultAddress?.country ?? "US" },
            ].map((f) => (
              <div key={f.name}>
                <label className={LABEL}>{f.label}{f.required !== false && " *"}</label>
                <input
                  name={f.name}
                  defaultValue={f.defaultValue}
                  required={f.required !== false}
                  className={FIELD}
                />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
              <input type="checkbox" name="saveAddress" value="true" className="h-4 w-4 rounded border-stone-300" />
              Save this address to my account
            </label>
            <button
              type="submit"
              className="w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
            >
              Confirm Shipping Address
            </button>
          </form>
        </section>
      )}

      {/* Confirmation — shown after payment AND shipping confirmed */}
      {isPaid && shippingConfirmed && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 space-y-5">
          <p className="text-sm font-semibold text-emerald-800">
            {order.listingType === "PRINT" ? "Print order confirmed — thank you!" : "Payment received — thank you!"}
          </p>

          <div className="text-sm text-emerald-700 space-y-1">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Order</p>
            <p className="font-medium">#{order.id.slice(-8).toUpperCase()}</p>
          </div>

          {order.shippingName && (
            <div className="text-sm text-emerald-700 space-y-0.5">
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Shipping to</p>
              <p>{order.shippingName}</p>
              <p>{order.shippingLine1}{order.shippingLine2 ? `, ${order.shippingLine2}` : ""}</p>
              <p>{order.shippingCity}{order.shippingState ? `, ${order.shippingState}` : ""} {order.shippingPostal}</p>
              <p>{order.shippingCountry}</p>
            </div>
          )}

          <div className="text-sm text-emerald-700 space-y-1">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Total paid</p>
            <p className="font-medium">${Number(order.totalAmount).toFixed(2)}</p>
          </div>

          <p className="text-sm text-emerald-700">
            {order.listingType === "PRINT"
              ? "Your print is being prepared for production. Estimated delivery 5–7 business days."
              : "We’ll pack and ship your artwork within 3–5 business days."}
          </p>
          <p className="text-xs text-emerald-600">A confirmation email has been sent to you.</p>

          {order.status === "SHIPPED" && order.trackingNumber && (
            <div className="text-sm text-emerald-700 border-t border-emerald-200 pt-4 space-y-1">
              <p className="font-medium">Your artwork has shipped!</p>
              <p>{order.carrier}: {order.trackingNumber}</p>
            </div>
          )}
          <Link
            href="/buyer/bids"
            className="inline-block text-sm text-emerald-800 underline underline-offset-2"
          >
            View all orders →
          </Link>
        </section>
      )}
    </div>
  );
}
