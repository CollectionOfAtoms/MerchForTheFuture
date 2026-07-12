## Epic MFTF-3: Fulfillment Abstraction Layer

_This epic refactors the existing Prodigi fulfillment integration behind a shared interface, and stubs the T-Mill slot. No buyer-facing changes. Required before any second dropshipper can be added._

_**Context:** Currently, Prodigi-specific logic is called directly from `confirmShippingAction` and the print order flow. When T-Mill is integrated, duplicating that pattern would create two divergent fulfillment paths that are hard to maintain. This epic builds the abstraction layer first so MFTF-7 (apparel checkout) slots cleanly behind it._

### US-MFTF-3.1 — Define Fulfillment Provider Interface

**As a** platform,
**I want** all dropshipper integrations to implement a shared TypeScript interface,
**so that** adding a new dropshipper never requires changes to order processing logic.

**Acceptance Criteria:**
- [ ] A `FulfillmentProvider` interface is defined in `src/lib/fulfillment/types.ts` with at minimum: `createOrder(params: FulfillmentOrderParams): Promise<FulfillmentOrderResult>`, `getOrderStatus(externalOrderId: string): Promise<FulfillmentStatus>`, and `name: string`
- [ ] `FulfillmentOrderParams` includes: listing reference, color variant identifier, size, quantity, shipping address, buyer name, source image URL
- [ ] `FulfillmentOrderResult` includes: external order ID, estimated dispatch date, and any provider-specific metadata stored as opaque JSON
- [ ] `FulfillmentStatus` maps to a canonical set: `PROCESSING | PRINTING | SHIPPED | DELIVERED | CANCELLED | ERROR`
- [ ] The interface is exported from `src/lib/fulfillment/index.ts`

**TDD Notes:**
- Test file: `__tests__/fulfillment/interface.test.ts`
- Unit tests: TypeScript compilation alone validates the interface contract; write runtime tests that instantiate a mock provider implementing the interface and confirm it satisfies all required methods
- No external calls in this story

---

### US-MFTF-3.2 — Refactor Prodigi Behind the Interface

**As a** platform,
**I want** the existing Prodigi integration wrapped behind the `FulfillmentProvider` interface,
**so that** all Prodigi-specific logic is isolated and the order flow is provider-agnostic.

**Acceptance Criteria:**
- [ ] A `ProdigiFulfillmentProvider` class in `src/lib/fulfillment/providers/prodigi.ts` implements `FulfillmentProvider`
- [ ] All existing Prodigi API calls (order creation, status polling) are moved into this class; no Prodigi-specific imports remain outside `src/lib/fulfillment/providers/`
- [ ] `confirmShippingAction` and any other call sites are updated to call the provider via the interface, not Prodigi directly
- [ ] A `getFulfillmentProvider(listingType: string): FulfillmentProvider` factory function in `src/lib/fulfillment/index.ts` returns the correct provider; currently always returns `ProdigiFulfillmentProvider` for print orders
- [ ] All existing Epic 8 and Epic 15 tests continue to pass without modification to the tests themselves
- [ ] MSW intercepts remain unchanged — the abstraction layer does not change the outbound HTTP calls, only how they are invoked internally

**TDD Notes:**
- Test file: `__tests__/fulfillment/prodigi-provider.test.ts`
- Integration tests: confirm `ProdigiFulfillmentProvider.createOrder()` produces the same Prodigi API request shape as the previous direct calls
- Regression: run full test suite; Epic 8 and 15 tests must remain green

---

### US-MFTF-3.3 — Stub T-Mill Provider

**As a** platform,
**I want** a stubbed `TeemillFulfillmentProvider` that satisfies the interface but throws a `NotImplemented` error,
**so that** the provider slot exists and can be wired up in MFTF-7 without touching the abstraction layer again.

**Acceptance Criteria:**
- [ ] `TeemillFulfillmentProvider` in `src/lib/fulfillment/providers/teemill.ts` implements `FulfillmentProvider`
- [ ] All methods throw `new Error('TeemillFulfillmentProvider: not yet implemented')` with a descriptive message
- [ ] The factory function recognises `'APPAREL'` as a listing type and returns `TeemillFulfillmentProvider`
- [ ] A test confirms the stub throws the expected error rather than silently failing

**TDD Notes:**
- Test file: `__tests__/fulfillment/teemill-stub.test.ts`
- Unit test: instantiate provider, call `createOrder`, assert it throws with the expected message
