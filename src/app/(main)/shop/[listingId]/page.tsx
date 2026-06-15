import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getApparelListingDetail } from "@/lib/apparel/detail";
import ApparelProductView from "@/components/ApparelProductView";

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
  const detail = await getApparelListingDetail(listingId);
  if (!detail) notFound();

  return <ApparelProductView detail={detail} />;
}
