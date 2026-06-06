"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getOrderDetail } from "@/lib/orders";
import { sendSupportRequestEmail } from "@/lib/payments/email";

type ActionResult = { error: string } | { success: true };

export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
  });

  if (!order) return { error: "Unauthorized" };

  if (order.status !== "PENDING") return { error: "Order cannot be cancelled." };

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
  });

  revalidatePath(`/buyer/orders/${orderId}`);
  return { success: true };
}

export async function contactSupportAction(
  orderId: string,
  message: string
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  if (!message.trim()) return { error: "Message is required." };

  const order = await getOrderDetail(orderId, session.user.id);
  if (!order) return { error: "Unauthorized" };

  const artworkTitle = order.artwork?.title ?? "Artwork";
  const artworkImageUrl = order.artwork?.thumbnailUrl ?? null;
  const sellerEmail = order.artwork?.sellerEmail;

  if (!sellerEmail) return { error: "Unable to reach seller." };

  try {
    await sendSupportRequestEmail({
      sellerEmail,
      orderId: order.id,
      orderDate: order.createdAt,
      artworkTitle,
      artworkImageUrl,
      buyerMessage: message,
    });
  } catch {
    return { error: "Failed to send message. Please try again." };
  }

  return { success: true };
}
