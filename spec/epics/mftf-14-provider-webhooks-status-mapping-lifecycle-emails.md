## Epic MFTF-14: Provider Webhooks, Status Mapping & Lifecycle Emails

_Added 2026-06-18. Makes order status flow back from fulfillment providers automatically and emails the buyer at each lifecycle transition. Retires the polling TODO left in US-MFTF-12.6 by making provider status-detection real behind the existing `checkFulfillmentStatus()` seam (US-MFTF-12.1). Prodigi uses confirmed webhooks; Teemill is forked on still-unverified webhook support and falls back to the polling path without changing the status-transition or email contract. The three buyer emails map onto the canonical `FulfillmentStatus` values already defined in US-MFTF-3.1 (`PRINTING | SHIPPED | DELIVERED`) — no new status enum is introduced. The initial "order received" email is already covered by the post-checkout confirmation (US-4.5 / US-21.2 / US-MFTF-12.6) and is deliberately not duplicated here._

### US-MFTF-14.1 — Provider Webhook Endpoint & Verification

**As a** platform,
**I want** authenticated webhook endpoints that accept provider status callbacks,
**so that** fulfillment status updates arrive without manual polling where the provider supports it.

**Acceptance Criteria:**
- [ ] A webhook route per provider (e.g. `/api/webhooks/prodigi`, and `/api/webhooks/teemill` **only if** live verification confirms Teemill webhook support — otherwise the Teemill route is not created and Teemill status detection stays on the polling path from US-MFTF-12.6)
- [ ] Each endpoint verifies authenticity using that provider's documented mechanism (Prodigi signature/secret); a request failing verification returns 401 and is not processed
- [ ] Verified payloads are parsed into a provider-agnostic internal shape and handed to the status-mapping step (US-MFTF-14.2); the route itself contains no status-transition logic
- [ ] The Prodigi route handles a defined, enumerated set of event types — at minimum the dispatch/shipment event that carries tracking number + carrier, and the order-status events that correspond to the canonical `PRINTING`/`DELIVERED` transitions (the exact Prodigi event names are taken from Prodigi's webhook docs and recorded in `/docs/` alongside the Teemill notes). This enumerated set is what "recognized" means for the next criterion
- [ ] Event types **outside** that enumerated set are acknowledged with 200 and ignored (no error, no transition), so unexpected provider events don't cause retry storms. (Tested with a fixture event whose type is deliberately not in the handled set.)
- [ ] Processing is idempotent at the endpoint: a replayed webhook for an already-applied transition is a no-op (reuses the US-MFTF-12.5 idempotency guarantee)

**TDD Notes:**
- Test file: `__tests__/mftf-14-webhooks-status-emails/US-MFTF-14.1-webhook-endpoint-verification.test.ts`
- MSW/route tests: valid Prodigi signature → 200 + handed to mapper; invalid signature → 401, not processed; unknown event → 200 no-op
- **Live-API confirmation flag (gates the Teemill route):** Open Q — whether Teemill exposes webhooks at all, plus event names + payload (tracking + carrier field paths). Until confirmed, **no Teemill webhook route is shipped**; Teemill remains on polling. Leave the existing `// TODO: replace Teemill polling with webhook once payload shape is confirmed live` marker until this resolves.

### US-MFTF-14.2 — Provider Status → Canonical FulfillmentOrder Mapping

**As a** platform,
**I want** each provider's status vocabulary mapped to the canonical `FulfillmentStatus` set,
**so that** order state is uniform regardless of which provider reported it.

**Acceptance Criteria:**
- [ ] A mapping step (living behind each provider's `checkFulfillmentStatus()`, per US-MFTF-12.1) translates raw provider status into the canonical set defined in US-MFTF-3.1: `PROCESSING | PRINTING | SHIPPED | DELIVERED | CANCELLED | ERROR`
- [ ] When a mapped status advances a `FulfillmentOrder` (e.g. `PRINTING` → `SHIPPED`), the row's status is updated and, for `SHIPPED`, tracking number + carrier are persisted from the payload
- [ ] Forward progression is monotonic: the ordered sequence is `PROCESSING → PRINTING → SHIPPED → DELIVERED`. A stale/out-of-order callback reporting a status **earlier in this sequence** than the `FulfillmentOrder`'s current status does not regress it (logged, ignored)
- [ ] `CANCELLED` and `ERROR` are **always-allowed terminal transitions** — they are not part of the forward ordering and the monotonic guard does not block them. A `CANCELLED`/`ERROR` callback may transition the order from any non-terminal state; once terminal, further callbacks are no-ops
- [ ] A status value that does not match any known provider mapping is recorded as a parse warning and does **not** silently transition the order (fails safe; surfaces for admin review rather than guessing)
- [ ] Both the webhook path (Prodigi) and the polling path (Teemill, from US-MFTF-12.6) feed this same mapping step — the transition contract is identical regardless of detection method

**TDD Notes:**
- Test file: `__tests__/mftf-14-webhooks-status-emails/US-MFTF-14.2-status-mapping.test.ts`
- Unit tests: each provider raw status → expected canonical value; unknown value → warning, no transition; out-of-order callback does not regress status
- Integration: a Prodigi webhook and a Teemill poll both drive the same `FulfillmentOrder` through identical transitions

### US-MFTF-14.3 — Buyer Lifecycle Emails on Each Transition

**As a** buyer,
**I want** an email at each stage of my order's progress,
**so that** I always know where my order is without checking the site.

**Acceptance Criteria:**
- [ ] A buyer email is sent (MailerSend, existing transactional pattern) on each of these per-`FulfillmentOrder` transitions: → `PRINTING` ("Your order is being printed"), → `SHIPPED` ("Your order is on its way!", includes tracking number + carrier + tracking link), → `DELIVERED` ("Your order has been delivered")
- [ ] Each email lists **only that shipment's** items (consistent with the per-shipment model in US-MFTF-12.6); a multi-shipment order produces independent emails per shipment per transition
- [ ] Provider/dropshipper names never appear in any email — shipments are referred to in buyer-facing terms ("Shipment 1 of 2")
- [ ] Emails are sent exactly once per transition: the idempotency guard (US-MFTF-14.1) prevents duplicate sends when a webhook/poll is replayed
- [ ] The email-trigger path is identical whether the transition was detected via webhook (Prodigi) or polling (Teemill)
- [ ] If a MailerSend send fails, the failure is logged and the status transition itself is **never rolled back** (the order state is the source of truth; a missed email must not corrupt it). This is the testable contract: MSW returns a 500 from MailerSend → assert the `FulfillmentOrder` status transition still persisted and the failure was logged. Automatic re-send of a failed lifecycle email is **deferred** (see Open Questions → "Lifecycle email retry"); it is not in scope for this story and no test should assert a re-send occurs
- [ ] No "order received" email is sent from this epic — that moment is already covered by the post-checkout confirmation (US-4.5 / US-21.2 / US-MFTF-12.6)

**TDD Notes:**
- Test file: `__tests__/mftf-14-webhooks-status-emails/US-MFTF-14.3-lifecycle-emails.test.ts`
- MSW intercepts MailerSend; assert one email per transition with correct subject + shipment-scoped items
- Idempotency test: replayed `SHIPPED` callback → exactly one shipping email total
- Two-shipment order: independent `PRINTING`/`SHIPPED`/`DELIVERED` emails per shipment
