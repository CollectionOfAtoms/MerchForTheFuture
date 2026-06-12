"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

type ActionResult = { error: string } | { orderId: string };

interface PrintProduct {
  sku: string;
  size: string;
  price: number;
}

export async function createPrintOrderAction(
  listingId: string,
  sku: string,
  size: string,
  quantity: number
): Promise<ActionResult> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) redirect("/sign-in");

  const listing = await prisma.originalListing.findUnique({ where: { id: listingId } });
  if (!listing || !listing.availableForPrint) {
    return { error: "Print not available for this artwork." };
  }

  const products = listing.printProducts as PrintProduct[] | null;
  const product = products?.find((p) => p.sku === sku);
  if (!product) return { error: "Invalid print product selected." };

  const subtotal = product.price * quantity;

  const order = await prisma.order.create({
    data: {
      buyerId: user.id,
      listingType: "PRINT",
      originalListingId: listingId,
      externalSku: sku,
      printSize: size,
      quantity,
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
      currency: listing.currency,
      status: "PENDING",
    },
  });

  return { orderId: order.id };
}
