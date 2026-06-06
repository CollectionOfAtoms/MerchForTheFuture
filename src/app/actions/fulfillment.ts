"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendShippingNotificationEmail, sendPurchaseConfirmation } from "@/lib/payments/email";

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
  // create the Prodigi fulfillment order now that we have a valid address.
  if (order.status === "PAID" && order.listingType === "PRINT" && order.originalListingId && order.prodigiSku) {
    const listing = await prisma.originalListing.findUnique({ where: { id: order.originalListingId } });
    if (listing?.printSourceImageUrl) {
      const apiKey = process.env.PRODIGI_API_KEY ?? "test_key";
      const base = process.env.PRODIGI_API_BASE_URL ?? "https://api.prodigi.com/v4.0";
      try {
        const resp = await fetch(`${base}/orders`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            shippingMethod: "Standard",
            recipient: {
              name,
              address: {
                line1,
                townOrCity: city,
                stateOrCounty: (formData.get("state") as string)?.trim() || "",
                postalOrZipCode: postal,
                countryCode: country,
              },
            },
            items: [{
              sku: order.prodigiSku,
              copies: order.quantity,
              sizing: "fillPrintArea",
              assets: [{ printArea: "default", url: listing.printSourceImageUrl }],
            }],
          }),
        });
        const data = (await resp.json()) as { order?: { id: string } };
        if (data.order?.id) {
          await prisma.order.update({
            where: { id: orderId },
            data: { status: "PROCESSING", prodigiOrderId: data.order.id },
          });
        }
      } catch (err) {
        console.error("[confirmShipping] Prodigi order creation failed:", err);
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
