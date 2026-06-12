"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendShippingNotificationEmail, sendPurchaseConfirmation } from "@/lib/payments/email";
import { getFulfillmentProvider, createFulfillmentOrder } from "@/lib/fulfillment";

type ActionResult = { error: string } | { success: true };

async function requireAuth() {
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  return user;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (!user.roles?.includes("ADMIN")) redirect("/");
  return user.id!;
}

export async function confirmShippingAction(orderId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireAuth();
  const userId = user.id!;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== userId) return { error: "Order not found." };
  // PENDING: auction orders awaiting payment; PAID: fixed-price / print orders paid before shipping collected
  if (!["PENDING", "PAID"].includes(order.status)) return { error: "This order cannot be modified." };

  const name = (formData.get("name") as string)?.trim();
  const line1 = (formData.get("line1") as string)?.trim();
  const city = (formData.get("city") as string)?.trim();
  const postal = (formData.get("postal") as string)?.trim();
  const country = (formData.get("country") as string)?.trim() || "US";

  if (!name || !line1 || !city || !postal) return { error: "Name, address, city, and postal code are required." };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      shippingName: name,
      shippingLine1: line1,
      shippingLine2: (formData.get("line2") as string)?.trim() || null,
      shippingCity: city,
      shippingState: (formData.get("state") as string)?.trim() || null,
      shippingPostal: postal,
      shippingCountry: country,
    },
  });

  // Optionally save address to account
  if (formData.get("saveAddress") === "true") {
    const existingDefault = await prisma.userAddress.findFirst({ where: { userId, isDefault: true } });
    await prisma.userAddress.create({
      data: {
        userId,
        name,
        line1,
        line2: (formData.get("line2") as string)?.trim() || null,
        city,
        state: (formData.get("state") as string)?.trim() || null,
        postal,
        country,
        isDefault: !existingDefault,
      },
    });
  }

  // For print orders that are already PAID, shipping was collected after payment —
  // create the fulfillment order now that we have a valid address.
  if (order.status === "PAID" && order.listingType === "PRINT" && order.originalListingId && order.externalSku) {
    const listing = await prisma.originalListing.findUnique({ where: { id: order.originalListingId } });
    if (listing?.printSourceImageUrl) {
      const provider = getFulfillmentProvider("PRINT");
      try {
        const result = await createFulfillmentOrder(orderId, provider, {
          listingRef: order.originalListingId,
          colorVariantId: order.externalSku,
          size: order.printSize ?? "",
          quantity: order.quantity,
          buyerName: name,
          sourceImageUrl: listing.printSourceImageUrl,
          shippingAddress: {
            name,
            line1,
            line2: (formData.get("line2") as string)?.trim() || undefined,
            city,
            state: (formData.get("state") as string)?.trim() || undefined,
            postal,
            country,
          },
        });
        await prisma.order.update({
          where: { id: orderId },
          data: { status: "PROCESSING", externalOrderId: result.externalOrderId },
        });
      } catch {
        // createFulfillmentOrder already logged and emailed the seller.
        // Swallow here so the buyer receives a successful response.
      }
    }

    // Send purchase confirmation email now that shipping is confirmed for print orders.
    await sendPurchaseConfirmation(orderId).catch(
      (e) => console.error("[confirmShipping] email failed", e)
    );
  }

  revalidatePath(`/orders/${orderId}/fulfill`);
  return { success: true };
}

export async function markShippedAction(orderId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const carrier = (formData.get("carrier") as string)?.trim();
  const trackingNumber = (formData.get("trackingNumber") as string)?.trim();

  if (!carrier || !trackingNumber) return { error: "Carrier and tracking number are required." };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PAID") return { error: "Order not found or not yet paid." };

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "SHIPPED", carrier, trackingNumber },
  });

  await prisma.notification.create({
    data: {
      userId: order.buyerId,
      type: "ORDER_SHIPPED",
      payload: { orderId, carrier, trackingNumber },
    },
  });

  await sendShippingNotificationEmail(orderId).catch(
    (e) => console.error("[markShipped] email failed", e)
  );

  revalidatePath("/admin/fulfillment");
  return { success: true };
}
