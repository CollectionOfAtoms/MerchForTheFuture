import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import PaymentForm from "@/components/PaymentForm";

interface PageProps {
  params: Promise<{ orderId: string }>;
}

export default async function CheckoutPage({ params }: PageProps) {
  const { orderId } = await params;

  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) redirect(`/sign-in?callbackUrl=/checkout/${orderId}`);

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
    },
  });

  if (!order) notFound();
  if (order.buyerId !== user.id) redirect("/");
  if (order.status !== "PENDING") redirect(`/orders/${orderId}/fulfill`);

  const artwork = order.originalListing?.artwork;
  const image = artwork?.images[0];

  return (
    <div className="mx-auto max-w-lg px-6 py-12 space-y-8">
      <h1 className="text-2xl font-semibold text-stone-900">Complete Purchase</h1>

      {/* Artwork summary */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex gap-4">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={artwork?.title} className="h-20 w-20 rounded-xl object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-stone-900 truncate">{artwork?.title}</p>
          {artwork?.artist && <p className="text-sm text-stone-500">{artwork.artist}</p>}
          <p className="mt-1 text-2xl font-bold text-stone-900">
            {Number(order.totalAmount).toLocaleString("en-US", {
              style: "currency",
              currency: order.currency,
              maximumFractionDigits: 0,
            })}
          </p>
        </div>
      </section>

      {/* Payment */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-stone-700">Payment</h2>
        <PaymentForm orderId={orderId} amount={Number(order.totalAmount)} currency={order.currency} />
      </section>
    </div>
  );
}
