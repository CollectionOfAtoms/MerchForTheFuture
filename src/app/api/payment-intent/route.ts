import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createPaymentIntent } from "@/lib/payments/stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orderId } = await request.json();
  if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  try {
    const result = await createPaymentIntent(orderId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
