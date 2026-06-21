import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getDropshipExceptionQueue, getOriginalsAwaitingSellerShipment } from "@/lib/fulfillment/admin";
import { retryFulfillmentAction } from "@/app/actions/fulfillment";

/**
 * Admin dropship exception queue (US-MFTF-15.2, re-homed from US-14.5). Lists FAILED
 * automated-provider shipments with a per-shipment retry. Shipping of physical
 * originals is the seller's responsibility (US-MFTF-15.1, /seller/fulfillment) and is
 * intentionally NOT here.
 */
export default async function AdminFulfillmentPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const [failedShipments, originals] = await Promise.all([
    getDropshipExceptionQueue(),
    getOriginalsAwaitingSellerShipment(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-stone-900 mb-2">Dropship Exceptions</h1>
      <p className="text-sm text-stone-500 mb-8">
        {failedShipments.length} failed shipment{failedShipments.length !== 1 ? "s" : ""} awaiting retry
      </p>

      {failedShipments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center">
          <p className="text-stone-400 text-sm">No failed shipments. Dropship fulfillment is running cleanly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {failedShipments.map((fo) => (
            <div key={fo.fulfillmentOrderId} className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-medium text-stone-900">
                Order #{fo.orderId} · {fo.buyerName}
              </p>
              {fo.notes && <p className="mt-1 text-xs text-red-700">{fo.notes}</p>}
              <form
                action={async () => {
                  "use server";
                  await retryFulfillmentAction(fo.fulfillmentOrderId);
                }}
                className="mt-3"
              >
                <button
                  type="submit"
                  className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
                >
                  Retry shipment
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Oversight only — admins do NOT ship originals; sellers do (US-MFTF-15.1).
          This list lets site operators see what's pending and who's responsible. */}
      <section className="mt-12" data-testid="originals-oversight">
        <h2 className="text-lg font-medium text-stone-900 mb-1">Originals awaiting seller shipment</h2>
        <p className="text-sm text-stone-500 mb-4">
          {originals.length} original{originals.length !== 1 ? "s" : ""} a seller still needs to ship · view only
        </p>

        {originals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-12 text-center">
            <p className="text-stone-400 text-sm">No originals are waiting to be shipped.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
                  <th className="px-4 py-3 font-medium">Artwork</th>
                  <th className="px-4 py-3 font-medium">Seller</th>
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Destination</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {originals.map((o) => (
                  <tr key={o.orderId}>
                    <td className="px-4 py-3 font-medium text-stone-900">{o.artworkTitle}</td>
                    <td className="px-4 py-3 text-stone-700">{o.sellerName}</td>
                    <td className="px-4 py-3 text-stone-500">{o.buyerName}</td>
                    <td className="px-4 py-3 text-stone-500">
                      {[o.shippingCity, o.shippingCountry].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-stone-500">
                      {new Date(o.paidAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-stone-700">${o.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
