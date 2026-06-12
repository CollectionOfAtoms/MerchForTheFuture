import { prisma } from "@/lib/db";

const STATUS_MAP: Record<string, string> = {
  Draft: "Processing",
  Submitted: "Processing",
  InProgress: "Printing",
  Complete: "Shipped",
  Dispatched: "Shipped",
  Delivered: "Delivered",
};

interface ProdigiOrderStatus {
  order: {
    id: string;
    status: { stage: string };
    shipments: Array<{ tracking: { number: string } | null }>;
  };
}

export interface OrderTracking {
  orderId: string;
  status: string;
  trackingNumber: string | null;
}

export async function getOrderTracking(orderId: string): Promise<OrderTracking> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const statusLabel = STATUS_MAP[order.status] ?? order.status;

  return {
    orderId: order.id,
    status: statusLabel,
    trackingNumber: null,
  };
}

export async function syncProdigiOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.externalOrderId) return;

  const apiKey = process.env.PRODIGI_API_KEY ?? "test_key";
  const base = process.env.PRODIGI_API_BASE_URL ?? "https://api.prodigi.com/v4.0";
  const response = await fetch(`${base}/orders/${order.externalOrderId}`, {
    headers: { "X-API-Key": apiKey },
  });

  if (!response.ok) return;

  const data = (await response.json()) as ProdigiOrderStatus;
  const stage = data.order?.status?.stage ?? "";
  const mappedStatus = STATUS_MAP[stage];
  if (!mappedStatus) return;

  const trackingNumber =
    data.order?.shipments?.[0]?.tracking?.number ?? null;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: mappedStatus === "Delivered" ? "DELIVERED" : mappedStatus === "Shipped" ? "SHIPPED" : "PROCESSING",
    },
  });
}
