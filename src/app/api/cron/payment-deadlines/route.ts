// TODO: Upgrade Vercel to Pro and set schedule to "0 * * * *" for production.
// Currently runs once daily (Hobby plan limit).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPaymentReminderEmail, sendOrderCancelledEmail, sendRunnerUpEmail } from "@/lib/payments/email";

const REMINDER_HOURS = 24;
const PAYMENT_WINDOW_HOURS = parseInt(process.env.AUCTION_PAYMENT_WINDOW_HOURS ?? "48", 10);

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const reminderThreshold = new Date(now.getTime() + REMINDER_HOURS * 60 * 60 * 1000);

  // Find PENDING auction orders with a deadline approaching or already passed
  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      paymentDeadline: { not: null },
      listingType: "ORIGINAL",
      stripePaymentIntentId: null,
    },
    select: { id: true, paymentDeadline: true, buyerId: true, originalListingId: true },
  });

  let reminded = 0;
  let expired = 0;

  for (const order of pendingOrders) {
    const deadline = order.paymentDeadline!;

    if (deadline <= now) {
      // Expired — cancel the order
      await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
      sendOrderCancelledEmail(order.id).catch((e) => console.error(`[payment-deadlines] cancel email failed for ${order.id}`, e));

      // Notify admins
      const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } }, select: { id: true } });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: "AUCTION_CLOSED" as const,
            payload: { orderId: order.id, reason: "payment_expired" },
          })),
        });
      }

      // Offer to runner-up
      if (order.originalListingId) {
        const auction = await prisma.auction.findFirst({
          where: { originalListingId: order.originalListingId },
        });
        if (auction) {
          const runnerUpBid = await prisma.bid.findFirst({
            where: { auctionId: auction.id, bidderId: { not: order.buyerId } },
            orderBy: { amount: "desc" },
          });

          if (runnerUpBid) {
            const newDeadline = new Date(Date.now() + PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);
            const newOrder = await prisma.order.create({
              data: {
                buyerId: runnerUpBid.bidderId,
                listingType: "ORIGINAL",
                originalListingId: order.originalListingId,
                subtotal: Number(runnerUpBid.amount),
                totalAmount: Number(runnerUpBid.amount),
                paymentDeadline: newDeadline,
                status: "PENDING",
              },
            });
            await prisma.notification.create({
              data: {
                userId: runnerUpBid.bidderId,
                type: "AUCTION_WON",
                payload: { orderId: newOrder.id, auctionId: auction.id },
              },
            });
            sendRunnerUpEmail(newOrder.id).catch((e) => console.error(`[payment-deadlines] runner-up email failed`, e));
          } else {
            // No other bidders — archive the listing
            await prisma.originalListing.update({
              where: { id: order.originalListingId },
              data: { status: "ARCHIVED" },
            });
          }
        }
      }

      expired++;
    } else if (deadline <= reminderThreshold) {
      // Approaching deadline — send reminder
      const hoursRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (60 * 60 * 1000));
      await sendPaymentReminderEmail(order.id, hoursRemaining).catch(
        (e) => console.error(`[payment-deadlines] reminder failed for ${order.id}`, e)
      );
      reminded++;
    }
  }

  return NextResponse.json({ reminded, expired });
}
