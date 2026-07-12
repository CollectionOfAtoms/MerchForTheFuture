## Epic 15: Listing-Page Purchase & Print Availability

_This epic adds direct purchase actions on the listing detail page and introduces a simpler print availability model: rather than separate "original" and "print" listings (as originally specified in Epic 8), each listing now carries an "available for print" toggle. When enabled, buyers can order a print of the artwork directly from the same listing page, alongside the original purchase or auction action. This changes how prints are surfaced — instead of a dual-listing browse experience, prints are an attribute of a listing, and a dedicated /prints page filters listings by that attribute._

_**Note on Epic 8:** The Prodigi integration and order pipeline from Epic 8 still apply — the change is in how prints are exposed in the UI (toggle on a single listing instead of a separate listing entity). Epic 8 stories that have already passed remain valid; this epic adjusts the seller-facing and buyer-facing surfaces._

### US-15.1 — Buy from Listing Page (Fixed-Price)
**As a** buyer,
**I want to** purchase a "For Sale" artwork directly from the artwork's listing page,
**so that** I can complete the transaction without navigating to a separate checkout entry point.

**Acceptance Criteria:**
- Fixed-price listings display a clearly visible "Buy Now" button on the listing detail page.
- Clicking "Buy Now" initiates the checkout flow inline (modal or dedicated checkout page) without losing the buyer's context.
- The flow uses Stripe Checkout or Stripe Elements with Stripe Tax enabled, so tax is calculated based on the buyer's billing/shipping address before payment.
- Unauthenticated buyers are prompted to sign in or create an account before checkout.
- On successful payment, the listing is marked Sold (per US-2.4) and the buyer is redirected to the post-sale fulfillment page (US-14.1).
- _Note: This formalizes the UI flow that complements US-2.3 (Buy Now backend). If US-2.3's implementation already includes the listing-page button, this story is a verification/completeness pass._

### US-15.2 — Print Availability Toggle on Listing
**As a** seller,
**I want to** toggle "available for print" on each of my listings,
**so that** I can offer prints of my artwork without managing a separate print listing.

**Acceptance Criteria:**
- The listing creation and edit forms include an "Available for Print" toggle (boolean).
- When enabled, the seller is prompted to provide print-specific information: the print-ready high-resolution source file (separate from gallery images if needed), the print products available (selected from Prodigi's catalog — paper print, canvas, framed, etc.), available sizes per product, and retail price per product/size combination.
- The platform validates the source image resolution against the selected print sizes (warns if DPI is too low, per US-8.6).
- When disabled, no print options are shown to buyers regardless of any previously configured print settings (the configuration is preserved but inactive).
- The toggle and its associated configuration are part of the same listing entity — there is no separate "PrintListing" record.
- Existing listings created under the old dual-listing model are migrated: any existing print listing is folded into its parent artwork listing as a print configuration with the toggle enabled.

### US-15.3 — Prints Page (Filtered Browse)
**As a** buyer,
**I want to** see only artworks that are available for print on the /prints page,
**so that** I can browse exclusively for pieces I can purchase as prints.

**Acceptance Criteria:**
- A new /prints page displays only listings where "Available for Print" is enabled.
- The page uses the same masonry/tiled layout as /browse (per US-10.1) for visual consistency.
- Each tile shows the first image of the listing and a "Prints from $X" label indicating the lowest-priced print option.
- Sold or archived listings still appear on /prints if prints remain available (the original may be sold, but prints are unlimited).
- Tiles link to the listing detail page (US-10.2) with a query parameter or anchor that scrolls/focuses the print purchase section.
- /prints supports the same filtering and sorting options as /browse (per US-7.2), with an additional filter for print product type (paper print, canvas, framed).

### US-15.4 — Order a Print from Listing Page

> **REVISED by Epic MFTF-PF (2026-06-21).** The buyer-facing mockup preview below — originally "using Prodigi's mockup API or generated previews, per US-8.2" — is superseded: buyer display now uses **seller-uploaded per-size mockups** (`PrintSizeMockup.mockupUrl`, US-MFTF-PF.6/PF.7). No Prodigi mockup API call is made for buyer display. The order/checkout/Stripe-Tax path is unchanged. _(US-MFTF-11.3 also reworked this story's order path into add-to-cart.)_

**As a** buyer,
**I want to** order a print directly from the artwork's listing page,
**so that** I can purchase a print without leaving the page.

**Acceptance Criteria:**
- On listings where "Available for Print" is enabled, the listing detail page (US-10.2) includes a print purchase section alongside the original purchase / bid action.
- The print section displays available product types (paper, canvas, framed), sizes, and prices, with a mockup preview showing the artwork in the selected format (using Prodigi's mockup API or generated previews, per US-8.2).
- The buyer selects product type, size, and quantity, then clicks "Order Print" to proceed to checkout.
- Print checkout uses the same Stripe + Stripe Tax flow as other purchases, with the shipping address determining the tax calculation.
- On successful payment, the platform creates a Prodigi order via their API (per US-8.3) and the buyer is shown an order confirmation with expected production and shipping timeline.
- The print order appears in the buyer's order history (US-13.3) with a status of "Processing" and updates as Prodigi reports progress (per US-8.4).
- Buying a print does **not** affect the availability of the original artwork — they are independent transactions.

### US-15.5 — Structured Artwork Dimensions
**As a** seller,
**I want to** enter artwork dimensions as separate width, height, and unit (in/cm) fields when I create or edit a listing,
**so that** the values are always valid numbers and machine-readable.

**Acceptance Criteria:**
- Create and edit forms have width (number), height (number), and unit select (in/cm).
- Width and height are required on create; validated as positive finite numbers.
- Saved in canonical format "W×H unit" (e.g., "16×20 in").
- Invalid (non-positive, non-numeric) values return a validation error.
- Edit form pre-populates from stored string, handling legacy formats like `24" × 36"`.

### US-15.6 — Print Catalog Filtered by Aspect Ratio
**As a** seller enabling prints for a listing,
**I want to** see only print sizes whose proportions match my artwork's aspect ratio (within 10%),
**so that** I don't accidentally offer sizes that require cropping or padding.

**Acceptance Criteria:**
- Only sizes within 10% of the artwork's normalized aspect ratio are shown.
- List is sorted by ascending ratio difference (closest match first).
- Falls back to the full catalog if dimensions are not set or no sizes match.
- Previously-saved products are always shown even if outside the ratio threshold.
- A note "Showing sizes that match your artwork's proportions" appears when filtering is active.

> _Epic MFTF-PF (2026-06-21) keeps this behavior unchanged (Decision D: all aspect-matching sizes remain offered); re-run as a regression guard only._

### US-15.7 — Print Cost Estimates in Setup
**As a** seller configuring print options,
**I want to** see the estimated Prodigi fulfillment cost (~$X) next to each size,
**so that** I can make informed decisions about how much to charge.

**Acceptance Criteria:**
- `src/lib/print/costs.json` contains a cost for every catalog SKU.
- Costs are populated by running `scripts/fetch-prodigi-costs.ts` (one-time, committed).
- The seller edit form displays "~$X" (rounded to nearest dollar) next to each size.
- No live API calls are made at runtime — costs are bundled statically.
- Canvas SKUs use a fixed reference wrap for the static cost table. _(**Revised by Epic MFTF-PF, 2026-06-21:** originally "White". Wrap is now a seller-fixed choice defaulting to `MirrorWrap` (US-MFTF-PF.2); the cost table may retain a fixed reference wrap internally since wrap rarely shifts Prodigi canvas cost, but `MirrorWrap` — not "White" — is the seller-facing default.)_
