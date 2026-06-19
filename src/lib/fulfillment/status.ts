/**
 * Canonical status mapping + the single FulfillmentOrder transition seam
 * (US-MFTF-14.2). Both detection paths — the Prodigi webhook (US-MFTF-14.1) and
 * the Teemill/Prodigi polling reconciliation (US-MFTF-12.6) — feed
 * `applyFulfillmentTransition`, so the transition contract (monotonic guard,
 * idempotency, lifecycle emails) is identical regardless of how the status was
 * detected. The provider-specific raw→canonical mapping lives inside each provider
 * subclass; this module only knows the canonical `FulfillmentStatus` set.
 */
import { prisma } from "@/lib/db";
import type { FulfillmentStatus } from "./types";
import {
  sendShipmentPrintingEmail,
  sendShipmentShippedEmail,
  sendShipmentDeliveredEmail,
} from "@/lib/payments/email";

/** The persisted per-shipment status (the DB `FulfillmentOrderStatus` enum). */
export type DbFulfillmentStatus =
  | "PENDING"
  | "SUBMITTED"
  | "CONFIRMED"
  | "PRINTING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED";

/**
 * Reconcile a canonical `FulfillmentStatus` (US-MFTF-3.1) to the persisted DB
 * enum value. The DB enum was aligned to the canonical set in US-MFTF-14.2, reusing
 * `CONFIRMED` as the PROCESSING base and `FAILED` as the canonical ERROR.
 */
export function canonicalToDbStatus(canonical: FulfillmentStatus): DbFulfillmentStatus {
  switch (canonical) {
    case "PROCESSING": return "CONFIRMED";
    case "ERROR":      return "FAILED";
    default:           return canonical; // PRINTING | SHIPPED | DELIVERED | CANCELLED
  }
}

/**
 * Monotonic forward ladder for the placement→progression lifecycle. A transition
 * only advances when the target ranks strictly higher than the current status.
 * Terminal states (CANCELLED, FAILED) are excluded from the ladder — they are
 * always-allowed from any non-terminal state and absorbing once reached.
 */
const FORWARD_RANK: Record<DbFulfillmentStatus, number> = {
  PENDING: 0,
  SUBMITTED: 1,
  CONFIRMED: 2, // == canonical PROCESSING
  PRINTING: 3,
  SHIPPED: 4,
  DELIVERED: 5,
  CANCELLED: -1, // terminal, off-ladder
  FAILED: -1,    // terminal, off-ladder (== canonical ERROR)
};

const TERMINAL: ReadonlySet<DbFulfillmentStatus> = new Set(["CANCELLED", "FAILED"]);

export function isTerminal(status: DbFulfillmentStatus): boolean {
  return TERMINAL.has(status);
}

/** The lifecycle email to fire when a shipment first reaches a given status. */
const TRANSITION_EMAIL: Partial<Record<DbFulfillmentStatus, (foId: string) => Promise<void>>> = {
  PRINTING: sendShipmentPrintingEmail,
  SHIPPED: sendShipmentShippedEmail,
  DELIVERED: sendShipmentDeliveredEmail,
};

export interface TransitionResult {
  transitioned: boolean;
  status: DbFulfillmentStatus | null;
}

/**
 * Apply a provider-reported canonical status to one FulfillmentOrder. The single
 * transition seam for every detection path (US-MFTF-14.2).
 *
 * - Monotonic: a target ranked at or below the current status is logged and ignored
 *   (a stale/out-of-order callback never regresses the order).
 * - Terminal: CANCELLED / ERROR(→FAILED) are allowed from any non-terminal state and
 *   are no-ops once the order is already terminal.
 * - Idempotent: the write is a guarded `updateMany` keyed on the current status, so a
 *   replayed callback advances the row (and emails) at most once — this reuses the
 *   "row status is the idempotency guard" guarantee from US-MFTF-12.5.
 * - On a transition into PRINTING/SHIPPED/DELIVERED the matching buyer email fires;
 *   a MailerSend failure is logged and NEVER rolls back the status (US-MFTF-14.3).
 */
export async function applyFulfillmentTransition(
  fulfillmentOrderId: string,
  canonical: FulfillmentStatus,
  tracking: { trackingNumber?: string | null; carrier?: string | null },
): Promise<TransitionResult> {
  const target = canonicalToDbStatus(canonical);

  const fo = await prisma.fulfillmentOrder.findUnique({
    where: { id: fulfillmentOrderId },
    select: { id: true, status: true },
  });
  if (!fo) {
    console.warn(`[fulfillment-status] no FulfillmentOrder ${fulfillmentOrderId} for ${canonical}`);
    return { transitioned: false, status: null };
  }
  const current = fo.status as DbFulfillmentStatus;

  // Already terminal — nothing further may change it.
  if (isTerminal(current)) {
    return { transitioned: false, status: current };
  }

  let where: { id: string; status: { in: DbFulfillmentStatus[] } };
  const data: { status: DbFulfillmentStatus; trackingNumber?: string | null; carrier?: string | null } = { status: target };

  if (isTerminal(target)) {
    // CANCELLED / FAILED — allowed from any non-terminal state.
    where = { id: fulfillmentOrderId, status: { in: nonTerminalStatuses() } };
  } else {
    // Forward progression — only advance from a strictly-earlier status.
    if (FORWARD_RANK[target] <= FORWARD_RANK[current]) {
      console.warn(
        `[fulfillment-status] ignoring stale/out-of-order ${canonical} (${target}) for ${fulfillmentOrderId}: already ${current}`,
      );
      return { transitioned: false, status: current };
    }
    where = { id: fulfillmentOrderId, status: { in: statusesBelow(FORWARD_RANK[target]) } };
    if (target === "SHIPPED") {
      data.trackingNumber = tracking.trackingNumber ?? null;
      data.carrier = tracking.carrier ?? null;
    }
  }

  // Guarded write: count === 1 means THIS call performed the transition.
  const { count } = await prisma.fulfillmentOrder.updateMany({ where, data });
  if (count !== 1) {
    return { transitioned: false, status: current };
  }

  const email = TRANSITION_EMAIL[target];
  if (email) {
    // Email is best-effort: a failure is logged but the transition stands
    // (US-MFTF-14.3 — order state is the source of truth; no automatic re-send).
    await email(fulfillmentOrderId).catch((e) =>
      console.error(`[fulfillment-status] lifecycle email (${target}) failed for ${fulfillmentOrderId}`, e),
    );
  }

  return { transitioned: true, status: target };
}

function nonTerminalStatuses(): DbFulfillmentStatus[] {
  return (Object.keys(FORWARD_RANK) as DbFulfillmentStatus[]).filter((s) => !isTerminal(s));
}

function statusesBelow(rank: number): DbFulfillmentStatus[] {
  return (Object.keys(FORWARD_RANK) as DbFulfillmentStatus[]).filter(
    (s) => !isTerminal(s) && FORWARD_RANK[s] < rank,
  );
}
