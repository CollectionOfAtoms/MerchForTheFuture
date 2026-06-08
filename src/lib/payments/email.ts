import { prisma } from "@/lib/db";

type Artwork = { id: string; title: string; imageUrl?: string };

async function mailersend(payload: { to: string; subject: string; html: string }): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "MerchForTheFuture <noreply@MerchForTheFuture.com>";
  const [fromName, fromEmail] = from.match(/^(.+?)\s*<(.+?)>$/)?.slice(1) ?? ["MerchForTheFuture", from];
  const res = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MAILERSEND_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      to: [{ email: payload.to }],
      subject: payload.subject,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`MailerSend ${res.status}: ${body}`);
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://merchforthefuture.com";

// ─── Outbid ───────────────────────────────────────────────────────────────────

export async function sendOutbidEmail(userId: string, auctionId: string, newHighBid: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const prefs = (user.loginMetadata as { notifications?: { outbidEmails?: boolean } } | null)?.notifications;
  if (prefs?.outbidEmails === false) return;

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { originalListing: { include: { artwork: { include: { images: true } } } } },
  });
  if (!auction) return;

  const artwork = auction.originalListing.artwork;
  const artworkUrl = `${BASE_URL}/artwork/${artwork.id}`;
  const endAt = auction.endAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const primaryImage = artwork.images.find((img) => img.isPrimary) ?? artwork.images[0];

  await mailersend({
    to: user.email,
    subject: `You've been outbid on "${artwork.title}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">You've been outbid</p>
        <p style="color:#78716c;margin-top:0">Someone placed a higher bid on <strong>${artwork.title}</strong>.</p>
        ${primaryImage ? `<img src="${primaryImage.url}" alt="${artwork.title}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">New highest bid</td><td style="padding:8px 0;font-weight:600;text-align:right">$${newHighBid.toLocaleString()}</td></tr>
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Auction ends</td><td style="padding:8px 0;text-align:right;font-size:14px">${endAt}</td></tr>
        </table>
        <a href="${artworkUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">Place a higher bid →</a>
      </div>
    `,
  });
}

// ─── Auction Won ──────────────────────────────────────────────────────────────

export async function sendAuctionWonEmail(
  userId: string,
  orderId: string,
  artwork: Artwork,
  winningBid: number
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const fulfillUrl = `${BASE_URL}/orders/${orderId}/fulfill`;

  await mailersend({
    to: user.email,
    subject: `Congratulations — you won "${artwork.title}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">You won the auction!</p>
        <p style="color:#78716c;margin-top:0">Your winning bid of <strong>$${winningBid.toLocaleString()}</strong> for <strong>${artwork.title}</strong> was accepted.</p>
        ${artwork.imageUrl ? `<img src="${artwork.imageUrl}" alt="${artwork.title}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <p style="color:#78716c">To complete your purchase, please confirm your shipping address and pay within 48 hours.</p>
        <a href="${fulfillUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">Complete your order →</a>
      </div>
    `,
  });
}

// ─── Auction Lost ─────────────────────────────────────────────────────────────

export async function sendAuctionLostEmail(userId: string, artwork: Artwork): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  await mailersend({
    to: user.email,
    subject: `Auction ended — "${artwork.title}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">The auction has ended</p>
        <p style="color:#78716c;margin-top:0">Unfortunately you didn't win <strong>${artwork.title}</strong> this time.</p>
        ${artwork.imageUrl ? `<img src="${artwork.imageUrl}" alt="${artwork.title}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <a href="${BASE_URL}/browse?type=auction" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">Browse more auctions →</a>
      </div>
    `,
  });
}

// ─── Purchase Confirmation ────────────────────────────────────────────────────

export async function sendPurchaseConfirmation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: true,
      originalListing: { include: { artwork: { include: { images: true } } } },
    },
  });
  if (!order) return;

  const artwork = order.originalListing?.artwork;
  const artworkTitle = artwork?.title ?? "Artwork";
  const primaryImage = artwork?.images.find((img) => img.isPrimary) ?? artwork?.images[0];
  const fulfillUrl = `${BASE_URL}/orders/${orderId}/fulfill`;

  await mailersend({
    to: order.buyer.email,
    subject: `Order confirmed — ${artworkTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">Payment received</p>
        <p style="color:#78716c;margin-top:0">Thank you for your purchase of <strong>${artworkTitle}</strong>.</p>
        ${primaryImage ? `<img src="${primaryImage.url}" alt="${artworkTitle}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Order</td><td style="padding:8px 0;text-align:right;font-size:14px">#${order.id.slice(-8).toUpperCase()}</td></tr>
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Subtotal</td><td style="padding:8px 0;text-align:right">$${Number(order.subtotal).toFixed(2)}</td></tr>
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Tax</td><td style="padding:8px 0;text-align:right">$${Number(order.taxAmount).toFixed(2)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:600;font-size:14px">Total</td><td style="padding:8px 0;font-weight:600;text-align:right">$${Number(order.totalAmount).toFixed(2)}</td></tr>
        </table>
        ${order.shippingLine1 ? `<p style="color:#78716c;font-size:14px">Shipping to: ${order.shippingName}, ${order.shippingLine1}, ${order.shippingCity}</p>` : ""}
        <a href="${fulfillUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">View order →</a>
      </div>
    `,
  });
}

// ─── Shipping Notification ────────────────────────────────────────────────────

export async function sendShippingNotificationEmail(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: true, originalListing: { include: { artwork: { include: { images: true } } } } },
  });
  if (!order) return;

  const artwork = order.originalListing?.artwork;
  const artworkTitle = artwork?.title ?? "Artwork";
  const primaryImage = artwork?.images.find((img) => img.isPrimary) ?? artwork?.images[0];
  const trackingInfo = order.carrier && order.trackingNumber
    ? `<p style="color:#78716c;font-size:14px">Carrier: ${order.carrier}<br/>Tracking: ${order.trackingNumber}</p>`
    : "";

  await mailersend({
    to: order.buyer.email,
    subject: `Your artwork has shipped — ${artworkTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">Your artwork is on its way</p>
        <p style="color:#78716c;margin-top:0"><strong>${artworkTitle}</strong> has been shipped to you.</p>
        ${primaryImage ? `<img src="${primaryImage.url}" alt="${artworkTitle}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        ${trackingInfo}
        <a href="${BASE_URL}/orders/${orderId}/fulfill" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">View order →</a>
      </div>
    `,
  });
}

// ─── Payment Reminder ─────────────────────────────────────────────────────────

export async function sendPaymentReminderEmail(orderId: string, hoursRemaining: number): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: true, originalListing: { include: { artwork: { include: { images: true } } } } },
  });
  if (!order) return;

  const artwork = order.originalListing?.artwork;
  const artworkTitle = artwork?.title ?? "Artwork";
  const primaryImage = artwork?.images.find((img) => img.isPrimary) ?? artwork?.images[0];
  const fulfillUrl = `${BASE_URL}/orders/${orderId}/fulfill`;

  await mailersend({
    to: order.buyer.email,
    subject: `Reminder: ${hoursRemaining} hours left to complete payment for "${artworkTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">Payment reminder</p>
        <p style="color:#78716c;margin-top:0">You have <strong>${hoursRemaining} hours</strong> remaining to complete payment for <strong>${artworkTitle}</strong>.</p>
        ${primaryImage ? `<img src="${primaryImage.url}" alt="${artworkTitle}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <p style="color:#78716c">If payment is not completed in time, the item may be offered to another buyer.</p>
        <a href="${fulfillUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">Complete payment →</a>
      </div>
    `,
  });
}

// ─── Runner-Up Offer ─────────────────────────────────────────────────────────

export async function sendRunnerUpEmail(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: true, originalListing: { include: { artwork: { include: { images: true } } } } },
  });
  if (!order) return;

  const artwork = order.originalListing?.artwork;
  const artworkTitle = artwork?.title ?? "Artwork";
  const primaryImage = artwork?.images.find((img) => img.isPrimary) ?? artwork?.images[0];
  const fulfillUrl = `${BASE_URL}/orders/${orderId}/fulfill`;

  await mailersend({
    to: order.buyer.email,
    subject: `Good news — "${artworkTitle}" is available for you`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">You're next in line!</p>
        <p style="color:#78716c;margin-top:0">The winning bidder didn't complete their payment for <strong>${artworkTitle}</strong>, so we're offering it to you at your bid of <strong>$${Number(order.totalAmount).toLocaleString()}</strong>.</p>
        ${primaryImage ? `<img src="${primaryImage.url}" alt="${artworkTitle}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <p style="color:#78716c">You have 48 hours to complete your purchase.</p>
        <a href="${fulfillUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">Complete your order →</a>
      </div>
    `,
  });
}

// ─── Order Cancelled ──────────────────────────────────────────────────────────

export async function sendOrderCancelledEmail(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { buyer: true, originalListing: { include: { artwork: { include: { images: true } } } } },
  });
  if (!order) return;

  const artwork = order.originalListing?.artwork;
  const artworkTitle = artwork?.title ?? "Artwork";
  const primaryImage = artwork?.images.find((img) => img.isPrimary) ?? artwork?.images[0];

  await mailersend({
    to: order.buyer.email,
    subject: `Your order for "${artworkTitle}" has been cancelled`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">Order cancelled</p>
        <p style="color:#78716c;margin-top:0">Your order for <strong>${artworkTitle}</strong> was cancelled because the payment window expired.</p>
        ${primaryImage ? `<img src="${primaryImage.url}" alt="${artworkTitle}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <p style="color:#78716c">If you believe this is an error, please contact us.</p>
        <a href="${BASE_URL}/browse?type=auction" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">Browse more auctions →</a>
      </div>
    `,
  });
}

// ─── Support Request ──────────────────────────────────────────────────────────

export async function sendSupportRequestEmail(params: {
  sellerEmail: string;
  orderId: string;
  orderDate: Date;
  artworkTitle: string;
  artworkImageUrl?: string | null;
  buyerMessage: string;
}): Promise<void> {
  const { sellerEmail, orderId, orderDate, artworkTitle, artworkImageUrl, buyerMessage } = params;
  const orderRef = `Order #${orderId.slice(-8).toUpperCase()}`;
  const formattedDate = orderDate.toLocaleDateString("en-US", { dateStyle: "medium" });

  await mailersend({
    to: sellerEmail,
    subject: `Support request — ${orderRef}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">Support request</p>
        <p style="color:#78716c;margin-top:0">A buyer has sent a support message about <strong>${artworkTitle}</strong>.</p>
        ${artworkImageUrl ? `<img src="${artworkImageUrl}" alt="${artworkTitle}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Order</td><td style="padding:8px 0;font-weight:600;text-align:right">${orderRef}</td></tr>
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Date</td><td style="padding:8px 0;text-align:right;font-size:14px">${formattedDate}</td></tr>
        </table>
        <p style="font-size:14px;font-weight:600;margin-bottom:4px">Buyer's message</p>
        <p style="font-size:14px;color:#44403c;background:#f5f5f4;padding:12px 16px;border-radius:8px;white-space:pre-wrap">${buyerMessage}</p>
      </div>
    `,
  });
}

// ─── Email Verification ───────────────────────────────────────────────────────

export async function sendVerificationEmail(email: string, token: string, name?: string | null): Promise<void> {
  const verifyUrl = `${BASE_URL}/auth/verify-email?token=${token}`;
  await mailersend({
    to: email,
    subject: "You're almost done",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">You're almost done</p>
        <p style="color:#78716c;margin-top:0">Hi${name ? ` ${name}` : ""},</p>
        <p style="color:#78716c">Please verify your email address to complete your Merch For The Future account. Click the button below — this link expires in 24 hours.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500;margin:16px 0">Verify my email →</a>
        <p style="color:#a8a29e;font-size:12px">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  });
}

// ─── Password Reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(email: string, token: string, name?: string | null): Promise<void> {
  const resetUrl = `${BASE_URL}/auth/reset-password?token=${token}`;
  await mailersend({
    to: email,
    subject: "Reset your Merch For The Future password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">Reset your password</p>
        <p style="color:#78716c;margin-top:0">Hi${name ? ` ${name}` : ""},</p>
        <p style="color:#78716c">We received a request to reset the password for your Merch For The Future account. Click the button below to choose a new password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500;margin:16px 0">Reset password →</a>
        <p style="color:#a8a29e;font-size:12px">If you didn't request a password reset, you can safely ignore this email. Your password won't change.</p>
      </div>
    `,
  });
}
