import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { markShippedAction } from "@/app/actions/fulfillment";

export default async function AdminFulfillmentPage() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const orders = await prisma.order.findMany({
    where: { status: "PAID", shippingLine1: { not: null } },
    include: {
      buyer: { select: { name: true, email: true } },
      originalListing: {
        include: {
          artwork: {
            include: { images: { where: { isPrimary: true }, take: 1 } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-stone-900 mb-2">Fulfillment Queue</h1>
      <p className="text-sm text-stone-500 mb-8">{orders.length} order{orders.length !== 1 ? "s" : ""} awaiting shipment</p>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-24 text-center">
          <p className="text-stone-400 text-sm">No orders awaiting fulfillment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const artwork = order.originalListing?.artwork;
            const image = artwork?.images[0];

            return (
              <div key={order.id} className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6">
                <div className="flex gap-4 items-start">
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt={artwork?.title} className="h-16 w-16 rounded-xl object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-900 truncate">{artwork?.title}</p>
                    <p className="text-sm text-stone-500">{order.buyer.name ?? order.buyer.email}</p>
                    <p className="text-sm text-stone-500 mt-1">
                      {order.shippingName} · {order.shippingLine1}, {order.shippingCity}, {order.shippingCountry}
                    </p>
                    <p className="text-xs text-stone-400 mt-1">
                      Paid {new Date(order.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })} ·{" "}
                      <span className="font-medium text-stone-700">${Number(order.totalAmount).toFixed(2)}</span>
                    </p>
                  </div>
                </div>

                <form
                  action={async (fd) => {
                    "use server";
                    await markShippedAction(order.id, fd);
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
