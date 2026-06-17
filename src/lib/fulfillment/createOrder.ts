import type { FulfillmentProvider, FulfillmentOrderParams, FulfillmentOrderResult } from "./types";
import { sendFulfillmentErrorEmail } from "@/lib/payments/email";

/** The minimal provider surface `createFulfillmentOrder` depends on. */
type SingleItemCreator = Pick<FulfillmentProvider, "name" | "createOrder">;

/**
 * Calls provider.createOrder() and, if it throws, sends an "Action required"
 * alert to the seller before re-throwing.
 *
 * Use this instead of calling provider.createOrder() directly so that every
 * current and future fulfillment provider automatically notifies the seller on
 * failure without each call site having to remember to do it.
 *
 * The error is always re-thrown — callers decide whether to surface it to the
 * buyer or swallow it gracefully.
 */
export async function createFulfillmentOrder(
  orderId: string,
  provider: SingleItemCreator,
  params: FulfillmentOrderParams,
): Promise<FulfillmentOrderResult> {
  try {
    return await provider.createOrder(params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[fulfillment:${provider.name}] order creation failed:`, err);
    await sendFulfillmentErrorEmail(orderId, message).catch(
      (e) => console.error(`[fulfillment:${provider.name}] error notification email failed:`, e),
    );
    throw err;
  }
}
