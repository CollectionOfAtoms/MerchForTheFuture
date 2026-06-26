import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getApparelListingDetail, getApparelListingOwnership } from "@/lib/apparel/detail";
import ApparelProductView from "@/components/ApparelProductView";
import OwnerUnlistedNotice from "@/components/seller/OwnerUnlistedNotice";
import OwnerEditButton from "@/components/seller/OwnerEditButton";
import { auth } from "@/auth";
import { isListingOwner } from "@/lib/seller/listing-status";
import { getDisplayCurrency } from "@/lib/tax/buyer-currency";

interface PageProps {
  params: Promise<{ listingId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { listingId } = await params;
  const detail = await getApparelListingDetail(listingId);
  if (!detail) return { title: "Product not found — Merch For The Future" };
  return {
    title: `${detail.title} — Merch For The Future`,
    description: detail.description?.slice(0, 160) ?? undefined,
    openGraph: detail.images[0] ? { images: [{ url: detail.images[0].url }] } : undefined,
  };
}

export default async function ApparelDetailPage({ params }: PageProps) {
  const { listingId } = await params;
  const [detail, ownership] = await Promise.all([
    getApparelListingDetail(listingId),
    getApparelListingOwnership(listingId),
  ]);
  if (!detail) notFound();

  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  const display = await getDisplayCurrency(viewerId);
  const editHref = `/seller/apparel/${listingId}/edit`;
  const ownerViewing = !!ownership && isListingOwner(viewerId, ownership.sellerId);

  return (
    <>
      {ownerViewing && <OwnerEditButton editHref={editHref} />}
      {ownership && (
        <OwnerUnlistedNotice
          sellerId={ownership.sellerId}
          status={ownership.status}
          editHref={editHref}
        />
      )}
      <ApparelProductView detail={detail} display={display} />
    </>
  );
}
