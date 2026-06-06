import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getBuyerOrders } from "@/lib/orders";

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

export const metadata = { title: "My Orders — Art & Sol" };

export default async function BuyerOrdersPage() {
  const session = await auth();
  const user = session?.user;
  const roles = (user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!user || !roles.includes("BUYER")) redirect("/sign-in");

  const orders = await getBuyerOrders(user.id!);

  return (
    <main className="min-h-screen bg-stone-50 py-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-stone-900">My Orders</h1>
          <Link href="/browse" className="text-sm text-stone-500 hover:text-stone-800 transition-colors">
            Browse artwork →
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-stone-500 mb-4">You haven't placed any orders yet.</p>
            <Link
              href="/browse"
              className="inline-block rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
            >
              Browse artwork
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
            <ul className="divide-y divide-stone-100">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/buyer/orders/${order.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-stone-50 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-stone-100">
                      {order.artwork?.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={order.artwork.thumbnailUrl}
                          alt={order.artwork.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-stone-300 text-xs">—</div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {order.artwork?.title ?? "Print order"}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                        {" · "}
                        ${Number(order.totalAmount).toLocaleString()}
                      </p>
                    </div>

                    {/* Badges */}
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
                        {order.listingType === "PRINT" ? "Print" : "Original"}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ORDER_STATUS_COLOUR[order.status] ?? "bg-stone-100 text-stone-600"}`}
                      >
                        {ORDER_STATUS_LABEL[order.status] ?? order.status}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
