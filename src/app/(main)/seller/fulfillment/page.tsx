import { redirect } from "next/navigation";
import { requireVerifiedAuth } from "@/lib/auth/guards";
import { getSellerOriginalsQueue } from "@/lib/fulfillment/originals";
import { markOriginalShippedAction, markOriginalDeliveredAction } from "@/app/actions/fulfillment";

/**
 * Seller-locked queue of the seller's own paid, address-confirmed, not-yet-shipped
 * physical originals (US-MFTF-15.1). Dropship items never appear here — they fulfill
 * automatically. Marking SHIPPED/DELIVERED fires the buyer lifecycle emails via the
 * same seam as US-MFTF-14.3.
 */
export default async function SellerFulfillmentPage() {
  const user = await requireVerifiedAuth();
  if (!user.roles?.includes("SELLER")) redirect("/");

  const rows = await getSellerOriginalsQueue(user.id);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-stone-900 mb-1">Originals to ship</h1>
        <p className="text-sm text-stone-500 mb-8">
          {rows.length} original{rows.length !== 1 ? "s" : ""} awaiting shipment
        </p>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-24 text-center">
            <p className="text-stone-400 text-sm">No originals awaiting shipment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.orderId} className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6">
                <div className="flex gap-4 items-start">
                  {row.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.thumbnailUrl} alt={row.title} className="h-16 w-16 rounded-xl object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-900 truncate">{row.title}</p>
                    <p className="text-sm text-stone-500">{row.buyerName}</p>
                    <p className="text-sm text-stone-500 mt-1">
                      {row.shippingName} · {row.shippingLine1}
                      {row.shippingLine2 ? `, ${row.shippingLine2}` : ""}, {row.shippingCity}
                      {row.shippingState ? `, ${row.shippingState}` : ""} {row.shippingPostal}, {row.shippingCountry}
                    </p>
                    <p className="text-xs text-stone-400 mt-1">
                      Paid {new Date(row.paidAt).toLocaleDateString("en-US", { dateStyle: "medium" })} ·{" "}
                      <span className="font-medium text-stone-700">${row.totalAmount.toFixed(2)}</span>
                    </p>
                  </div>
                </div>

                <form
                  action={async (fd) => {
                    "use server";
                    await markOriginalShippedAction(row.orderId, fd);
                  }}
                  className="mt-4 space-y-3 border-t border-stone-100 pt-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Carrier</label>
                    <input
                      name="carrier"
                      required
                      placeholder="e.g. UPS, FedEx, USPS"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-600 mb-1">Tracking number</label>
                    <input
                      name="trackingNumber"
                      required
                      placeholder="1Z999AA10123456784"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
                  >
                    Mark as Shipped
                  </button>
                </form>

                <form
                  action={async () => {
                    "use server";
                    await markOriginalDeliveredAction(row.orderId);
                  }}
                  className="mt-3"
                >
                  <button
                    type="submit"
                    className="text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors"
                  >
                    Mark as Delivered
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
