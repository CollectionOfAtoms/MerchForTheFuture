## Epic 23: Desktop Nav User Dropdown

### US-23.1 — User Dropdown Menu in Desktop Nav

**As a** signed-in user on a desktop browser,
**I want** my role-specific links and account actions to appear in a dropdown under my name,
**so that** the top nav bar stays uncluttered and Browse, Auctions, and Prints are always visible.

**Acceptance Criteria:**
- Browse, Auctions, and Prints remain as always-visible inline links in the desktop nav bar — no change.
- When signed in, the user's name (or email if no name is set) is rendered as a button with a chevron-down icon. Clicking it toggles a dropdown panel.
- When signed out, the existing Sign in and Sign up links are shown as today — no dropdown.
- The inline role links (My Bids, Settings, Listings, Admin) and the Sign out button are removed from the flat nav and moved into the dropdown.
- **Dropdown contents (role-dependent):** Always present: Dashboard link (role-appropriate), Settings, Sign out. Buyers: My Bids, Orders. Sellers: Listings. Admins: Admin.
- The dropdown is visually distinct: white card, subtle drop shadow, rounded corners, positioned below-right of the trigger button.
- The active page item in the dropdown is visually highlighted.
- The dropdown closes on: second click of the trigger, click outside, or Escape keypress. Escape returns focus to the trigger button.
- **Mobile menu is completely unaffected.**

### US-23.2 — Restructured Mobile Menu with Role-Aware Sections
**As a** signed-in user on a mobile browser,
**I want** the mobile menu organized into role-aware sections,
**so that** I can find my links without a long flat scroll.

**Acceptance Criteria:**
- The mobile menu groups links into clear sections rather than one flat list.
- Sections and their items are role-aware (buyer / seller / admin), mirroring the desktop dropdown's role logic.
- Always-visible primary links (Browse, Auctions, Prints) and account actions (Settings, Sign out) remain reachable.
- The menu remains accessible and keyboard/touch operable.

_Status: Passed (tracker). Added to spec 2026-06-25 to reconcile spec with tracker._

---

## Tech Stack & Architecture

### Frontend & Framework
- **Framework:** Next.js (App Router) with React
- **Deployment:** Vercel
- **Styling:** Tailwind CSS (or designer's choice — specify in implementation)
- **Image Hosting:** Vercel Blob or a dedicated CDN (e.g., Cloudinary) for artwork images. Artwork images are the core product; they must be served optimized (responsive sizes, WebP/AVIF, lazy loading) with CDN edge caching.

### Backend & API
- **API Layer:** Next.js API Routes and Server Actions (co-located with the frontend on Vercel)
- **ORM:** Prisma (provides type-safe database access, migrations, and works seamlessly with Next.js and Vercel)
- **Authentication:** NextAuth.js (Auth.js) for session management, OAuth, and credential-based login

### Database: PostgreSQL
- **Why PostgreSQL over other SQL options:**
  - **Transactional integrity** — Auctions and payments require ACID guarantees. Concurrent bids need row-level locking or `SELECT ... FOR UPDATE` to prevent race conditions. PostgreSQL handles this natively and reliably.
  - **JSONB columns** — Artwork metadata (dimensions, medium, custom attributes) can vary between listings. PostgreSQL's JSONB lets you store flexible attributes alongside structured relational data without needing a separate NoSQL store.
  - **Full-text search** — PostgreSQL's built-in `tsvector` / `tsquery` full-text search is sufficient for artwork search by title, description, and artist name, avoiding the need for a separate search service at launch.
  - **Money and precision** — The `NUMERIC` type handles currency amounts without floating-point errors.
  - **Vercel compatibility** — Vercel Postgres (powered by Neon) provides serverless PostgreSQL with connection pooling, zero cold starts, and native integration with the Vercel dashboard and environment variables. Alternatively, a managed instance on Supabase, Neon, or Railway works just as well.
  - **Mature ecosystem** — First-class support in Prisma, extensive extension library (e.g., `pg_trgm` for fuzzy search, `pgcrypto` for UUIDs).

### Payments
- **Payment Processor:** Stripe
  - Stripe Checkout or Stripe Elements for the buyer-facing payment form
  - Stripe Connect (Standard or Express) for seller onboarding and payouts to business accounts
  - Stripe handles PCI compliance, 3D Secure / SCA, and multi-currency

### Tax Calculation
- **Tax Service:** Stripe Tax (enabled in the Stripe Dashboard, integrated natively with Stripe Checkout / Payment Intents)
  - Calculated server-side by Stripe at checkout based on buyer address
  - Handles US sales tax, EU/UK VAT, GST (CA/AU/NZ/SG), and other supported jurisdictions
  - Tax breakdown automatically included on Stripe-generated receipts
  - Nexus monitoring built in; alerts when approaching registration thresholds in new jurisdictions
  - **Note:** Stripe Tax calculates and reports but does not file. Filing remains a manual responsibility.

### Real-Time (Auctions)
- **Approach:** Vercel supports WebSockets via third-party providers. Use one of:
  - **Pusher** or **Ably** for real-time bid updates and outbid notifications
  - **Alternatively:** Server-Sent Events (SSE) for simpler one-way updates if full WebSocket isn't needed at launch
- Auction close is handled by a scheduled server-side job (e.g., Vercel Cron or an external scheduler like Inngest)

### Email / Notifications
- **Transactional Email:** Resend, SendGrid, or Postmark for purchase confirmations, outbid alerts, auction results, and print shipping notifications
- **In-App Notifications:** Stored in PostgreSQL, delivered via real-time channel or polling

### Print Fulfillment: Prodigi
- **Service:** Prodigi (https://www.prodigi.com) — premium print-on-demand fulfillment
- **API:** Prodigi REST API v4 (https://api.prodigi.com/v4.0/)
  - **Product catalog** — query available products, sizes, and pricing by destination country
  - **Order creation** — submit orders with source image URL, product SKU, quantity, and shipping address
  - **Order status** — poll or receive webhooks for status updates (created → in production → shipped → delivered)
  - **Image requirements** — high-resolution source files; API returns warnings if DPI is insufficient for selected size
- **Integration pattern:**
  - Source images are stored in the platform's CDN (same high-res uploads used for the gallery)
  - At checkout, the platform creates a Prodigi order server-side, passing the CDN image URL
  - Prodigi handles printing, quality control, packaging, and shipping globally
  - The buyer never interacts with Prodigi directly — the entire experience stays on-site
  - Webhook endpoint receives fulfillment updates and maps them to buyer-facing order statuses

### Key Architecture Notes for Implementation
- **Data model:** An `Artwork` is the parent entity. Each artwork can have up to two child listings: an `OriginalListing` (fixed price or auction, quantity of 1) and a `PrintListing` (unlimited quantity, linked to Prodigi products). Browse/search queries against the `Artwork` table, not listings, to ensure one result per piece.
- Use Next.js App Router with Server Components for product pages (SEO, performance).
- Client Components for interactive elements (bid forms, image galleries, print option selectors, checkout).
- All payment, tax, and Prodigi API logic runs server-side (API routes / server actions) — never expose keys or sensitive logic to the client.
- Image uploads flow through a signed-URL pattern (client → presigned URL → Blob/CDN) to avoid routing large files through the API. Print-ready source files are stored at full resolution in the CDN and the URL is passed to Prodigi at order time.
- Database migrations managed through Prisma Migrate.

---

## Development Methodology: Test-Driven Development (TDD)

### Process

This project follows strict TDD. For every user story, the development cycle is:

1. **Red** — Write a failing test (or tests) derived from the user story's acceptance criteria BEFORE writing any implementation code. Each acceptance criterion becomes at least one test assertion. The test must fail, confirming it is testing something that does not yet exist.
2. **Green** — Write the minimum implementation code required to make the test pass. No more, no less.
3. **Refactor** — Clean up the implementation while keeping all tests green. Improve structure, remove duplication, clarify naming — but do not add functionality beyond what the tests cover.

This cycle repeats for every user story, in order, within each epic. Do not skip ahead to implementation. Do not write implementation code without a corresponding failing test.

### Test Organization

Tests are organized to mirror the user story structure:

```
__tests__/
├── epic-1-listings/
│   ├── US-1.1-create-listing.test.ts
│   ├── US-1.2-upload-images.test.ts
│   ├── US-1.3-artwork-details.test.ts
│   ├── US-1.4-sale-type.test.ts
│   ├── US-1.5-edit-listing.test.ts
│   └── US-1.6-remove-listing.test.ts
├── epic-2-fixed-price/
│   ├── US-2.1-set-price.test.ts
│   └── ...
├── epic-3-auction/
│   ├── US-3.1-configure-auction.test.ts
│   ├── US-3.2-place-bid.test.ts
│   └── ...
├── epic-4-payments/
├── epic-5-tax/
├── epic-6-auth/
├── epic-7-browsing/
├── epic-8-print-shop/
├── epic-9-seller-dashboard/
├── epic-10-browse-product-ux/
│   ├── US-10.1-browse-gallery-layout.test.ts
│   └── US-10.2-listing-detail-page.test.ts
├── epic-11-seller-listing-lifecycle/
│   ├── US-11.1-require-image.test.ts
│   ├── US-11.2-deactivate-listing.test.ts
│   └── US-11.3-delete-unsold-listing.test.ts
└── epic-12-buyer-experience/
    ├── US-12.1-place-bid-ui.test.ts
    ├── US-12.2-my-bids-page.test.ts
    ├── US-12.3-outbid-email.test.ts
    └── US-12.4-buyer-account-settings.test.ts
└── epic-13-dashboards/          # ⚡ PRIORITY — implement first
    ├── US-13.1-admin-dashboard.test.ts
    ├── US-13.2-seller-dashboard.test.ts
    └── US-13.3-buyer-dashboard.test.ts
└── epic-14-fulfillment/
    ├── US-14.1-fulfillment-page.test.ts
    ├── US-14.2-shipping-address.test.ts
    ├── US-14.3-auction-payment.test.ts
    ├── US-14.4-confirmation-status.test.ts
    ├── US-14.5-admin-fulfillment-queue.test.ts
    └── US-14.6-payment-deadline.test.ts
└── epic-15-listing-purchase-prints/
    ├── US-15.1-buy-from-listing.test.ts
    ├── US-15.2-print-availability-toggle.test.ts
    ├── US-15.3-prints-page.test.ts
    └── US-15.4-order-print-from-listing.test.ts
```

### Test Types by Layer

Each user story may require tests at multiple layers. Use the appropriate test type for what the acceptance criterion is actually verifying:

- **Unit tests** — Pure logic: price calculations, bid validation rules, tax computation, DPI validation, auction closing logic. These are fast, isolated, and have no external dependencies.
- **Integration tests** — Database operations: creating listings, placing bids, recording transactions, querying artworks. These test Prisma models against a real (test) PostgreSQL database.
- **API route tests** — HTTP layer: request validation, auth guards, correct status codes, response shapes. Test Next.js API routes and server actions with mocked or real database.
- **Component tests** — React components: forms render correct fields, buttons are disabled/enabled in the right states, galleries display images, auction timers count down. Use React Testing Library.
- **End-to-end tests** — Critical user flows: "buyer finds artwork → selects print options → completes checkout → sees confirmation." These run in a browser against the full stack.

### Testing Stack

- **Test runner:** Vitest (fast, native ESM/TypeScript, compatible with Next.js)
- **React component testing:** React Testing Library + Vitest
- **API / integration testing:** Vitest with a test PostgreSQL database (seeded/reset per suite)
- **End-to-end testing:** Playwright
- **External service mocking:** MSW (Mock Service Worker) for Stripe, Prodigi, and tax API calls during unit and integration tests. E2E tests may use Stripe test mode and Prodigi sandbox.
- **Coverage:** Aim for >90% on business logic (bid validation, payment flows, tax calculation, order creation). UI coverage is secondary to behavioral correctness.

### TDD Mapping Example

To illustrate how acceptance criteria become tests, here is an example using US-3.2 (Place Bid):

**Acceptance Criteria:**
- Buyer enters a bid amount that must exceed the current highest bid by a minimum increment.
- Bid is recorded with a timestamp and buyer ID.
- Buyer must be logged in to bid.
- Buyer receives confirmation that their bid was placed.

**Resulting tests (written BEFORE implementation):**

```
US-3.2-place-bid.test.ts

Unit:
  ✗ rejects a bid that does not exceed current highest bid by minimum increment
  ✗ rejects a bid equal to the current highest bid
  ✗ accepts a bid that exceeds current highest bid by exactly the minimum increment
  ✗ accepts a bid that exceeds current highest bid by more than the minimum increment

Integration:
  ✗ persists a valid bid with timestamp and buyer ID
  ✗ returns the updated highest bid after a successful bid

API:
  ✗ returns 401 if buyer is not authenticated
  ✗ returns 400 if bid amount is missing or invalid
  ✗ returns 200 and confirmation payload on successful bid

Component:
  ✗ bid form displays current highest bid and minimum next bid
  ✗ submit button is disabled when input is below minimum
  ✗ shows confirmation message after successful bid submission
```

All of these tests are written first and must fail. Then implementation proceeds until they pass.

### Instructions for Claude Code

When working through each epic:

1. Read the user stories and acceptance criteria for the epic.
2. Generate the full test file(s) for that epic FIRST. Run them to confirm they fail.
3. Update `project-tracker.json`: set each story's status to "Test Written," fill in the test written date and commit hash.
4. Implement the code to make each test pass, one at a time.
5. After all tests in the epic pass, refactor.
6. Run the full test suite **once, before pushing the first PR for the epic**, to confirm no regressions. See "Test Suite Scope Policy" below for what to run during subsequent PR iterations.
7. Update `project-tracker.json`: set each passing story's status to "Passed," fill in the test passed date and commit hash. Add a row to the commits array.
8. Commit with a message referencing the epic and story IDs (e.g., "feat(epic-3): implement US-3.1 through US-3.6 — auction sales"). The tracker file MUST be included in the commit.
9. Move to the next epic.

**Critical: Every commit must include an update to `project-tracker.json`.** Commits without a tracker update should be rejected. See the Project Tracker section below for git hook enforcement.

### Test Suite Scope Policy

_Added 2026-06-12. The full suite now takes several minutes; running it on every iteration slows development without adding signal._

- **Before the first PR push for an epic:** run the **full test suite** once and confirm green. This is the regression gate for the epic's initial implementation.
- **During PR review iterations** (feedback, bugfixes, the back-and-forth of resolving errors): run **only the epic's test directory** (e.g. `npx vitest run __tests__/mftf-11-cart/`) plus any test files belonging to stories the change directly touches (e.g. US-15.4's file when MFTF-11.3 modifies it). Do not run the full suite on every iteration.
- **Before merge (human QA gate):** every PR description must end with a QA checklist containing at minimum:
  - `- [ ] Full test suite run locally and green (human — required before merge)`

  The human developer runs the full suite and checks this box before merging. Claude Code creates the checklist but never checks this box itself.

---

## Project Tracker

### File: `project-tracker.json`

This JSON file lives in the project root and is the single source of truth for project progress. It contains three top-level keys (`stories`, `commits`, `epicOrder`) plus `lastUpdated`:

**stories** — One object per user story (US-1.1 through US-12.4). Fields:
- id, epic, title
- status: "Not Started" → "Test Written" → "In Progress" → "Passed" (or "Deferred")
- testWrittenDate + testWrittenCommit
- testPassedDate + testPassedCommit
- notes

**commits** — One object per commit. Fields:
- hash (short), date, author, storiesAffected (array of story IDs), message, trackerUpdated (always true)

**epicOrder** — The authoritative implementation sequence. `epicOrder.sequence` is an ordered array of `{ epic, rationale }` objects (epic strings match the `epic` field on stories exactly); `epicOrder.deferred` lists epics intentionally parked. Claude Code works the first epic in `sequence` that has stories not yet `Passed`/`Dropped`/`Deferred`, unless the handoff prompt says otherwise. Sequencing changes happen only in `tdd-spec-session` sessions — implementation sessions never reorder it.

### Git Hook: Enforce Tracker Updates

Add this pre-commit hook to `.husky/pre-commit` (or `.git/hooks/pre-commit`) during project setup:

```bash
#!/bin/sh

# Verify project-tracker.json is staged with every commit
if ! git diff --cached --name-only | grep -q "project-tracker.json"; then
  echo ""
  echo "ERROR: project-tracker.json must be updated with every commit."
  echo "Stage your tracker changes and try again:"
  echo "  git add project-tracker.json"
  echo ""
  exit 1
fi
```

Make it executable: `chmod +x .husky/pre-commit`

This ensures no commit can land without a corresponding tracker update.

---

## Non-Functional Requirements (for implementation reference)

- **Performance:** Product pages load in under 2 seconds. Auction bid placement completes in under 500ms.
- **Security:** PCI DSS compliance for payments. All data encrypted in transit (TLS) and at rest. OWASP Top 10 mitigated.
- **Scalability:** System handles concurrent auction bidding without race conditions (optimistic locking or similar).
- **Accessibility:** WCAG 2.1 AA compliance.
- **Internationalization:** Support for multiple currencies, locales, and tax jurisdictions from day one.
- **Test Coverage:** >90% coverage on business logic. All user stories have corresponding tests written before implementation. CI pipeline runs the full test suite on every push.
