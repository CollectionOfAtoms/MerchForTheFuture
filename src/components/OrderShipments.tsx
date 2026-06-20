import type { OrderShipmentsView } from "@/lib/checkout/shipments";

const STATUS_COPY: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Preparing", cls: "bg-stone-100 text-stone-600" },
  SUBMITTED: { label: "Preparing", cls: "bg-stone-100 text-stone-600" },
  CONFIRMED: { label: "In production", cls: "bg-amber-50 text-amber-700" },
  PRINTING: { label: "Being printed", cls: "bg-amber-50 text-amber-700" },
  SHIPPED: { label: "Shipped", cls: "bg-emerald-50 text-emerald-700" },
  DELIVERED: { label: "Delivered", cls: "bg-emerald-50 text-emerald-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-stone-100 text-stone-600" },
  FAILED: { label: "Delayed", cls: "bg-stone-100 text-stone-600" },
};

/**
 * Buyer-facing per-shipment rendering (US-MFTF-12.6). Groups a cart order's items
 * into "Shipment 1 of 2" cards with a status badge and tracking once shipped.
 * Never names the provider/dropshipper.
 */
export default function OrderShipments({ view }: { view: OrderShipmentsView }) {
  return (
    <div className="space-y-4" data-testid="order-shipments">
      {view.shipments.map((s) => {
        const status = STATUS_COPY[s.status] ?? { label: "Processing", cls: "bg-stone-100 text-stone-600" };
        return (
          <div key={s.label} className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="font-medium text-stone-900">{s.label}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.cls}`}>{status.label}</span>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-stone-600">
              {s.items.map((i, idx) => (
                <li key={idx} className="flex justify-between">
                  <span>{i.title}{i.selectionSummary ? ` · ${i.selectionSummary}` : ""}</span>
                  <span>× {i.quantity}</span>
                </li>
              ))}
            </ul>
            {s.status === "SHIPPED" && s.trackingNumber ? (
              <p className="mt-3 text-sm text-stone-700">
                {s.carrier ? `${s.carrier} · ` : ""}Tracking: <span className="font-medium">{s.trackingNumber}</span>
              </p>
            ) : (
              <p className="mt-3 text-xs text-stone-500">
                {s.status === "SHIPPED" ? "On its way." : "We'll email tracking as soon as this shipment goes out."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
