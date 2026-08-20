# Art Marketplace — User Stories

## Project Summary

An online marketplace for a renewable energy themed art auction. Sellers list artwork with images, choose between fixed-price sales or auctions for original pieces, and receive payments to a business account. Buyers browse, bid, or purchase artwork using credit cards. The platform also offers high-quality prints of digital artwork via Prodigi print-on-demand integration, allowing buyers who can't afford or don't win an original to purchase a premium print without leaving the site. The platform handles international tax calculation based on buyer location.

**Key concept:** A single piece of artwork can have two listing types — an "Original" listing (fixed price or auction, one-of-one) and a "Print" listing (unlimited, fulfilled by Prodigi). When browsing, each artwork appears only once; the product page presents whichever purchase options are available for that piece.

---

---

## Epic Index

This file is the index. Full acceptance criteria for each epic live in `spec/epics/`.
**Read the relevant epic's file when working on it — do not read every epic file.**
See `spec/README.md` for the full spec-file protocol (tracker split, per-epic spec split,
and what a fresh coding or spec session should read first).

### Active development order

Epics below follow `project-tracker.json`'s `epicOrder.sequence` — the order Claude Code
works them in, first-not-yet-Passed-first — followed by explicitly deferred epics, followed
by the historical numbered epics (1–23) from the original Art Marketplace spec, which are
effectively an addendum/foundation layer predating the MFTF epic numbering.

| Epic | Status | File |
|---|---|---|
| **MFTF-23**: Admin Tracker Archive Merge | Passed | [`mftf-23-admin-tracker-archive-merge.md`](epics/mftf-23-admin-tracker-archive-merge.md) |
| **MFTF-5**: Apparel Listing Creation | Passed | [`mftf-5-apparel-listing-creation.md`](epics/mftf-5-apparel-listing-creation.md) |
| **MFTF-13**: Referenced Apparel Listings (Teemill Product Ref) | Passed | [`mftf-13-referenced-apparel-listings-teemill-product-ref.md`](epics/mftf-13-referenced-apparel-listings-teemill-product-ref.md) |
| **MFTF-6**: Apparel Product Page & Browse | Passed | [`mftf-6-apparel-product-page-browse.md`](epics/mftf-6-apparel-product-page-browse.md) |
| **MFTF-11**: Cart | Passed | [`mftf-11-cart.md`](epics/mftf-11-cart.md) |
| **MFTF-12**: Multi-Provider Checkout & Fulfillment | Mixed (2 Tests Passing — pending live confirmation, 4 Passed) | [`mftf-12-multi-provider-checkout-fulfillment.md`](epics/mftf-12-multi-provider-checkout-fulfillment.md) |
| **MFTF-14**: Provider Webhooks, Status Mapping & Lifecycle Emails | Passed | [`mftf-14-provider-webhooks-status-mapping-lifecycle-emails.md`](epics/mftf-14-provider-webhooks-status-mapping-lifecycle-emails.md) |
| **MFTF-15**: Seller Fulfillment for Originals | Passed | [`mftf-15-seller-fulfillment-for-originals.md`](epics/mftf-15-seller-fulfillment-for-originals.md) |
| **MFTF-16**: Storefront & Catalog Corrections | Passed | [`mftf-16-storefront-catalog-corrections.md`](epics/mftf-16-storefront-catalog-corrections.md) |
| **MFTF-17**: Printify Integration | Not Started | [`mftf-17-printify-integration.md`](epics/mftf-17-printify-integration.md) |
| **MFTF-PF**: Print Framing, Canvas Wrap & Seller Mockups | Passed | [`mftf-pf-print-framing-canvas-wrap-seller-mockups.md`](epics/mftf-pf-print-framing-canvas-wrap-seller-mockups.md) |
| **5**: Tax Calculation (via Stripe Tax) _(also listed below — see note)_ | Passed | [`5-tax-calculation-via-stripe-tax.md`](epics/5-tax-calculation-via-stripe-tax.md) |
| **MFTF-19**: Storefront Polish & Pricing Visibility | Passed | [`mftf-19-storefront-polish-pricing-visibility.md`](epics/mftf-19-storefront-polish-pricing-visibility.md) |
| **MFTF-20**: About & Contact Pages | Not Started | [`mftf-20-about-contact-pages.md`](epics/mftf-20-about-contact-pages.md) |
| **MFTF-21**: Contact Page & Feedback Form | Not Started | [`mftf-21-contact-page-feedback-form.md`](epics/mftf-21-contact-page-feedback-form.md) |
| **MFTF-24**: Apparel Categories, Collections & Navigation | Not Started | [`mftf-24-apparel-categories-collections-navigation.md`](epics/mftf-24-apparel-categories-collections-navigation.md) |
| **MFTF-22**: SEO Foundation | Not Started | [`mftf-22-seo-foundation.md`](epics/mftf-22-seo-foundation.md) |
| **MFTF-10**: Pre-Launch Checklist | Not Started | [`mftf-10-pre-launch-checklist.md`](epics/mftf-10-pre-launch-checklist.md) |
| **MFTF-18**: Printful Integration | Deferred | [`mftf-18-printful-integration.md`](epics/mftf-18-printful-integration.md) |
| **MFTF-8**: T-Mill Mockup Generation | Deferred | [`mftf-8-t-mill-mockup-generation.md`](epics/mftf-8-t-mill-mockup-generation.md) |
| **MFTF-9**: Seller Apparel Product Management | Deferred | [`mftf-9-seller-apparel-product-management.md`](epics/mftf-9-seller-apparel-product-management.md) |

### Foundational epics (Epics 1–23, original Art Marketplace spec)

Predates the `MFTF-*` epic numbering introduced when apparel/dropshipper work began.
All are `Passed` — retained for historical reference and regression context, not active work.
_Note: Epic 5 (Tax Calculation) is a special case — it's one of the original numbered epics but
was resequenced into the active `epicOrder.sequence` (see the table above) rather than staying
purely historical, since tax work was deliberately reordered after the MFTF fulfillment epics
per the 2026-06-18 spec session. It's listed in both tables for that reason, not by mistake._

| Epic | Status | File |
|---|---|---|
| **1**: Artwork Listing & Product Page | Passed | [`1-artwork-listing-product-page.md`](epics/1-artwork-listing-product-page.md) |
| **2**: Fixed-Price Sales | Passed | [`2-fixed-price-sales.md`](epics/2-fixed-price-sales.md) |
| **3**: Auction Sales | Passed | [`3-auction-sales.md`](epics/3-auction-sales.md) |
| **4**: Payments (Credit Card to Business) | Mixed (1 Deferred, 4 Passed) | [`4-payments-credit-card-to-business.md`](epics/4-payments-credit-card-to-business.md) |
| **5**: Tax Calculation (via Stripe Tax) | Passed | [`5-tax-calculation-via-stripe-tax.md`](epics/5-tax-calculation-via-stripe-tax.md) |
| **6**: User Accounts & Authentication | Mixed (3 Passed, 1 Dropped) | [`6-user-accounts-authentication.md`](epics/6-user-accounts-authentication.md) |
| **7**: Browsing & Discovery | Passed | [`7-browsing-discovery.md`](epics/7-browsing-discovery.md) |
| **8**: Print Shop (Prodigi Integration) | Passed | [`8-print-shop-prodigi-integration.md`](epics/8-print-shop-prodigi-integration.md) |
| **9**: Seller Dashboard & Listing Management | Passed | [`9-seller-dashboard-listing-management.md`](epics/9-seller-dashboard-listing-management.md) |
| **10**: Browse & Product Page UX | Passed | [`10-browse-product-page-ux.md`](epics/10-browse-product-page-ux.md) |
| **11**: Seller Listing Lifecycle | Passed | [`11-seller-listing-lifecycle.md`](epics/11-seller-listing-lifecycle.md) |
| **12**: Buyer Experience | Passed | [`12-buyer-experience.md`](epics/12-buyer-experience.md) |
| **13**: Role-Based Dashboards | Passed | [`13-role-based-dashboards.md`](epics/13-role-based-dashboards.md) |
| **14**: Post-Sale Fulfillment (Originals) | Passed | [`14-post-sale-fulfillment-originals.md`](epics/14-post-sale-fulfillment-originals.md) |
| **15**: Listing-Page Purchase & Print Availability | Passed | [`15-listing-page-purchase-print-availability.md`](epics/15-listing-page-purchase-print-availability.md) |
| **16**: Seller UX Improvements | Passed | [`16-seller-ux-improvements.md`](epics/16-seller-ux-improvements.md) |
| **17**: Password Reset | Passed | [`17-password-reset.md`](epics/17-password-reset.md) |
| **18**: Image Upload & Processing Pipeline | Passed | [`18-image-upload-processing-pipeline.md`](epics/18-image-upload-processing-pipeline.md) |
| **19**: Artwork Image Lightbox & Magnifier | Passed | [`19-artwork-image-lightbox-magnifier.md`](epics/19-artwork-image-lightbox-magnifier.md) |
| **20**: Mobile Usability | Passed | [`20-mobile-usability.md`](epics/20-mobile-usability.md) |
| **21**: Stripe Checkout Sessions Migration & Payment UX | Passed | [`21-stripe-checkout-sessions-migration-payment-ux.md`](epics/21-stripe-checkout-sessions-migration-payment-ux.md) |
| **22**: Buyer Order History & Order Detail | Passed | [`22-buyer-order-history-order-detail.md`](epics/22-buyer-order-history-order-detail.md) |
| **23**: Desktop Nav User Dropdown | Passed | [`23-desktop-nav-user-dropdown.md`](epics/23-desktop-nav-user-dropdown.md) |

### Early MFTF foundation epics (not in `epicOrder` — already resolved before that structure existed)

These four early `MFTF-*` epics (spike, abstraction layer, catalog, and the dropped single-item
checkout flow) predate `epicOrder.sequence`/`epicOrder.deferred` as a tracking concept and were
already `Passed`/`Dropped`/complete by the time that structure was introduced, so they were never
added to it. Listed here for completeness — every epic file in `spec/epics/` is linked from
somewhere in this index.

| Epic | Status | File |
|---|---|---|
| **MFTF-2**: T-Mill API Discovery Spike | Chore (not tracked as stories; output is `/docs/teemill-api-notes.md`) | [`mftf-2-t-mill-api-discovery-spike.md`](epics/mftf-2-t-mill-api-discovery-spike.md) |
| **MFTF-3**: Fulfillment Abstraction Layer | Passed | [`mftf-3-fulfillment-abstraction-layer.md`](epics/mftf-3-fulfillment-abstraction-layer.md) |
| **MFTF-4**: Platform Product Catalog | Passed | [`mftf-4-platform-product-catalog.md`](epics/mftf-4-platform-product-catalog.md) |
| **MFTF-7**: Apparel Checkout & Order Fulfillment ❌ REPLACED | Dropped (superseded by MFTF-11/MFTF-12; retained for history only) | [`mftf-7-apparel-checkout-order-fulfillment.md`](epics/mftf-7-apparel-checkout-order-fulfillment.md) |

---

_Split into per-epic files under `spec/epics/` on 2026-07-11. The original monolithic file
(`user-stories-art-marketplace.md`, 254KB / 3359 lines / all 45 epics inline) is preserved
in git history if a full-text search across every epic at once is ever needed — but the
day-to-day protocol is to read only the epic file(s) relevant to current work. See
`spec/README.md`._
