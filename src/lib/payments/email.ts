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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PRINT_MATERIALS: Record<string, string> = { FAP: "Fine Art Paper", CAN: "Stretched Canvas" };
function printSelectionSummary(sku: string): string {
  const parts = sku.split("-");
  const material = PRINT_MATERIALS[parts[1]] ?? parts[1] ?? "Print";
  const size = (parts[2] ?? "").replace(/X/i, "x");
  return size ? `${material} · ${size}` : material;
}

/**
 * Itemized confirmation for a multi-item cart order (US-MFTF-12.4). Lists each item
 * with its thumbnail, selection, quantity and line total; shows a shipping line so
 * subtotal + shipping + tax = total; and formats the shipping address as a label.
 * No provider/dropshipper names. Used by the PAID webhook for CART orders.
 */
export async function sendCartPurchaseConfirmation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: true,
      fulfillmentOrders: { select: { shippingCost: true } },
      orderItems: {
        orderBy: { createdAt: "asc" },
        include: {
          apparelListing: {
            select: {
              title: true,
              images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
              referencedVariants: { orderBy: { id: "asc" }, take: 1 },
            },
          },
          originalListing: {
            select: {
              artwork: { select: { title: true, images: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1 } } },
            },
          },
        },
      },
    },
  });
  if (!order) return;

  const rows = order.orderItems.map((it) => {
    let title: string;
    let thumb: string | null;
    let selection: string;
    if (it.itemKind === "APPAREL") {
      const l = it.apparelListing;
      const sel = it.selection as { colorId?: string; sizeLabel?: string };
      const img = l?.images[0];
      thumb = img?.gridUrl ?? img?.displayUrl ?? img?.originalUrl ?? l?.referencedVariants[0]?.mockupUrl ?? null;
      title = l?.title ?? "Apparel";
      selection = [sel.colorId, sel.sizeLabel].filter(Boolean).join(" · ");
    } else {
      const a = it.originalListing?.artwork;
      const sel = it.selection as { prodigiSku?: string };
      const img = a?.images[0];
      thumb = img?.gridUrl ?? img?.displayUrl ?? img?.url ?? null;
      title = a?.title ?? "Print";
      selection = printSelectionSummary(sel.prodigiSku ?? "");
    }
    const lineTotal = Number(it.unitPrice) * it.quantity;
    return { title, thumb, selection, quantity: it.quantity, lineTotal };
  });

  const shipping = order.fulfillmentOrders.reduce((s, f) => s + Number(f.shippingCost), 0);
  const itemRows = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 0;width:56px">${r.thumb ? `<img src="${r.thumb}" alt="" width="48" height="48" style="width:48px;height:48px;border-radius:8px;object-fit:cover;background:#f5f5f4" />` : ""}</td>
        <td style="padding:8px 8px;font-size:14px;color:#1c1917">${escapeHtml(r.title)}${r.selection ? `<br/><span style="color:#78716c;font-size:12px">${escapeHtml(r.selection)}</span>` : ""}<br/><span style="color:#78716c;font-size:12px">Qty ${r.quantity}</span></td>
        <td style="padding:8px 0;text-align:right;font-size:14px;color:#1c1917;white-space:nowrap">$${r.lineTotal.toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  const addressLines = [
    order.shippingName,
    order.shippingLine1,
    order.shippingLine2,
    [order.shippingCity, order.shippingState].filter(Boolean).join(", ") + (order.shippingPostal ? ` ${order.shippingPostal}` : ""),
    order.shippingCountry,
  ]
    .map((l) => (l ?? "").trim())
    .filter((l) => l.length > 0)
    .map((l) => escapeHtml(l))
    .join("<br/>");

  const totalsRow = (label: string, value: string, bold = false) =>
    `<tr><td colspan="2" style="padding:6px 0;font-size:14px;${bold ? "font-weight:600;" : "color:#78716c;"}">${label}</td><td style="padding:6px 0;text-align:right;font-size:14px;${bold ? "font-weight:600;" : ""}">${value}</td></tr>`;

  await mailersend({
    to: order.buyer.email,
    subject: `Order confirmed — #${order.id.slice(-8).toUpperCase()}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">Payment received — thank you!</p>
        <p style="color:#78716c;margin-top:0">Order #${order.id.slice(-8).toUpperCase()}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">${itemRows}</table>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #e7e5e4;margin-top:8px">
          ${totalsRow("Subtotal", `$${Number(order.subtotal).toFixed(2)}`)}
          ${totalsRow("Shipping", shipping > 0 ? `$${shipping.toFixed(2)}` : "Free")}
          ${totalsRow("Tax", `$${Number(order.taxAmount).toFixed(2)}`)}
          ${totalsRow("Total", `$${Number(order.totalAmount).toFixed(2)}`, true)}
        </table>
        <p style="text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;font-size:11px;margin:20px 0 4px">Shipping to</p>
        <p style="color:#1c1917;font-size:14px;line-height:1.5;margin:0">${addressLines}</p>
        <a href="${BASE_URL}/buyer/orders/${order.id}" style="display:inline-block;margin-top:20px;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">View your order →</a>
      </div>
    `,
  });
}

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

// ─── Per-shipment shipped notification (US-MFTF-12.6) ─────────────────────────

/**
 * Email the buyer when one shipment of a multi-item cart order ships. Lists only
 * that shipment's items and its tracking — never the provider/dropshipper name.
 * The send path is identical regardless of how dispatch was detected (poll vs.
 * webhook).
 */
export async function sendShipmentShippedEmail(fulfillmentOrderId: string): Promise<void> {
  const ctx = await loadShipmentEmailContext(fulfillmentOrderId);
  if (!ctx) return;

  // Tracking number + carrier + a carrier-agnostic tracking link (US-MFTF-14.3).
  const trackingLink =
    ctx.trackingNumber ? `https://www.google.com/search?q=${encodeURIComponent(`${ctx.carrier ?? ""} ${ctx.trackingNumber}`.trim())}` : null;
  const trackingInfo =
    ctx.carrier && ctx.trackingNumber
      ? `<p style="color:#78716c;font-size:14px">Carrier: ${escapeHtml(ctx.carrier)}<br/>Tracking: ${escapeHtml(ctx.trackingNumber)}${trackingLink ? `<br/><a href="${trackingLink}">Track this shipment →</a>` : ""}</p>`
      : "";

  await mailersend({
    to: ctx.to,
    subject: `${ctx.shipmentLabel} is on its way!`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">${ctx.shipmentLabel} is on its way!</p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${ctx.itemsHtml}</table>
        ${trackingInfo}
        <a href="${ctx.orderUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">View order →</a>
      </div>
    `,
  });
}

// ─── Per-shipment lifecycle notifications (US-MFTF-14.3) ──────────────────────

/**
 * Shared loader for the per-shipment lifecycle emails. Resolves the buyer, the
 * "Shipment N of M" label (never a provider/dropshipper name), and that shipment's
 * own items. Per US-MFTF-14.3 each email lists ONLY this shipment's items.
 */
async function loadShipmentEmailContext(fulfillmentOrderId: string) {
  const fo = await prisma.fulfillmentOrder.findUnique({
    where: { id: fulfillmentOrderId },
    include: {
      order: {
        select: {
          id: true,
          buyer: { select: { email: true } },
          fulfillmentOrders: { orderBy: { createdAt: "asc" }, select: { id: true } },
        },
      },
      items: {
        include: {
          apparelListing: {
            select: {
              title: true,
              // Our own watermarked lifestyle photos (Vercel Blob). We deliberately do
              // NOT fall back to the provider mockup URL here: those are hosted on the
              // dropshipper's domain (e.g. teemill.com) and would leak the provider into
              // a buyer email, breaking the US-MFTF-14.3 buyer-opacity guarantee. A
              // referenced listing with no uploaded photo simply shows no thumbnail.
              images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
            },
          },
          originalListing: {
            select: {
              artwork: { select: { title: true, images: { orderBy: [{ isPrimary: "desc" }, { order: "asc" }], take: 1 } } },
            },
          },
        },
      },
    },
  });
  if (!fo) return null;

  const total = fo.order.fulfillmentOrders.length;
  const index = fo.order.fulfillmentOrders.findIndex((f) => f.id === fo.id) + 1;
  const shipmentLabel = total > 1 ? `Shipment ${index} of ${total}` : "Your order";

  // One row per item: thumbnail + title + selection (colour · size / material · size)
  // + qty, so the buyer can identify exactly what's in this shipment. Provider names
  // never appear; thumbnails are our-domain images only (see the include note above).
  const itemsHtml = fo.items
    .map((it) => {
      let title: string;
      let thumb: string | null;
      let selection: string;
      if (it.itemKind === "APPAREL") {
        const l = it.apparelListing;
        const sel = it.selection as { colorId?: string; sizeLabel?: string };
        const img = l?.images[0];
        thumb = img?.gridUrl ?? img?.displayUrl ?? img?.originalUrl ?? null;
        title = l?.title ?? "Apparel";
        selection = [sel.colorId, sel.sizeLabel].filter(Boolean).join(" · ");
      } else {
        const a = it.originalListing?.artwork;
        const sel = it.selection as { prodigiSku?: string };
        const img = a?.images[0];
        thumb = img?.gridUrl ?? img?.displayUrl ?? img?.url ?? null;
        title = a?.title ?? "Print";
        selection = printSelectionSummary(sel.prodigiSku ?? "");
      }
      return `
      <tr>
        <td style="padding:8px 0;width:56px">${thumb ? `<img src="${thumb}" alt="" width="48" height="48" style="width:48px;height:48px;border-radius:8px;object-fit:cover;background:#f5f5f4" />` : ""}</td>
        <td style="padding:8px 8px;font-size:14px;color:#1c1917">${escapeHtml(title)}${selection ? `<br/><span style="color:#78716c;font-size:12px">${escapeHtml(selection)}</span>` : ""}<br/><span style="color:#78716c;font-size:12px">Qty ${it.quantity}</span></td>
      </tr>`;
    })
    .join("");

  const orderUrl = `${BASE_URL}/buyer/orders/${fo.order.id}`;
  return { to: fo.order.buyer.email, shipmentLabel, itemsHtml, orderUrl, carrier: fo.carrier, trackingNumber: fo.trackingNumber };
}

/** "Your order is being printed" (→ PRINTING transition, US-MFTF-14.3). */
export async function sendShipmentPrintingEmail(fulfillmentOrderId: string): Promise<void> {
  const ctx = await loadShipmentEmailContext(fulfillmentOrderId);
  if (!ctx) return;
  await mailersend({
    to: ctx.to,
    subject: `${ctx.shipmentLabel} is being printed`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">${ctx.shipmentLabel} is being printed</p>
        <p style="color:#78716c;margin-top:0">Your order is being printed and will ship soon.</p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${ctx.itemsHtml}</table>
        <a href="${ctx.orderUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">View your order →</a>
      </div>
    `,
  });
}

/** "Your order has been delivered" (→ DELIVERED transition, US-MFTF-14.3). */
export async function sendShipmentDeliveredEmail(fulfillmentOrderId: string): Promise<void> {
  const ctx = await loadShipmentEmailContext(fulfillmentOrderId);
  if (!ctx) return;
  await mailersend({
    to: ctx.to,
    subject: `${ctx.shipmentLabel} has been delivered`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">${ctx.shipmentLabel} has been delivered</p>
        <p style="color:#78716c;margin-top:0">Your order has been delivered. We hope you love it!</p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">${ctx.itemsHtml}</table>
        <a href="${ctx.orderUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">View your order →</a>
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

// ─── Fulfillment Error ────────────────────────────────────────────────────────

export async function sendFulfillmentErrorEmail(orderId: string, errorMessage: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: true,
      originalListing: {
        include: { artwork: { include: { seller: true, images: true } } },
      },
    },
  });
  if (!order) return;

  const seller = order.originalListing?.artwork?.seller;
  if (!seller?.email) return;

  const artwork = order.originalListing?.artwork;
  const artworkTitle = artwork?.title ?? "Artwork";
  const primaryImage = artwork?.images.find((img) => img.isPrimary) ?? artwork?.images[0];
  const orderRef = `Order #${orderId.slice(-8).toUpperCase()}`;
  const adminOrderUrl = `${BASE_URL}/admin/fulfillment`;

  await mailersend({
    to: seller.email,
    subject: `Action required — fulfillment error on ${orderRef}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1c1917">
        <p style="font-size:18px;font-weight:600;margin-bottom:4px">Fulfillment follow-up needed</p>
        <p style="color:#78716c;margin-top:0">
          Hi${seller.name ? ` ${seller.name}` : ""},<br/>
          An error occurred while submitting a print order for <strong>${artworkTitle}</strong> to our fulfillment provider.
          The order has been recorded and no action is needed from your buyer, but please follow up to ensure it is dispatched.
        </p>
        ${primaryImage ? `<img src="${primaryImage.url}" alt="${artworkTitle}" style="width:100%;border-radius:8px;margin:16px 0" />` : ""}
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Order</td><td style="padding:8px 0;font-weight:600;text-align:right">${orderRef}</td></tr>
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Buyer</td><td style="padding:8px 0;text-align:right;font-size:14px">${order.buyer.email}</td></tr>
          <tr><td style="padding:8px 0;color:#78716c;font-size:14px">Error</td><td style="padding:8px 0;text-align:right;font-size:12px;color:#dc2626">${errorMessage}</td></tr>
        </table>
        <a href="${adminOrderUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-size:14px;font-weight:500">View fulfillment dashboard →</a>
        <p style="color:#a8a29e;font-size:12px;margin-top:16px">If you need support resolving this, please contact us and reference the order number above.</p>
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
