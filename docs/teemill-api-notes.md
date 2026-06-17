# Teemill API Discovery Notes

**Status:** Live-verified — catalog shape confirmed 2026-06-12 against the live Orders API. Auth, variant ref shape, colour hex, sizes, mockups, stock, and GBP pricing all confirmed.
**Last updated:** 2026-06-12
**Unblocked by:** Teemill support resolved 2FA issue; API key generated at https://teemill.com/api

> **Reading order:** the "Live API Verification (2026-06-12)" section and the "MSW Stub Handlers" block are authoritative. Older inline sections below (Custom Product API options table, the pre-verification Mockup/Sizing notes, the original Open Questions table) are retained as research history and are explicitly superseded where they conflict. Conflicts are annotated inline.

---

## Summary for MFTF-3 / MFTF-12 / MFTF-13

> **Note (2026-06-12):** MFTF-7 (single-item apparel checkout) was dropped; its successors are MFTF-12 (multi-provider checkout/fulfillment) and MFTF-13 (referenced apparel listings). References to "MFTF-7" below are historical.

Teemill exposes **two distinct APIs** with different integration models. Understanding which to use is the first architectural decision:

| API | Base URL | Purpose | MFTF relevance |
|---|---|---|---|
| Custom Product API | `https://teemill.com/omnis/v3/` | Creates a product page **on Teemill's hosted storefront**; returns a URL the buyer visits to purchase | **Not what we want** — buyer leaves our site |
| Orders API | `https://api.teemill.com/v1/` | Submits orders programmatically from your own checkout flow | **This is what MFTF-7 needs** |

The Orders API is the correct integration target for MFTF. It lets us run our own Stripe Checkout and then call Teemill to create the fulfillment order, exactly like the existing Prodigi integration pattern.

---

## Live API Verification (2026-06-12)

_Verified against the **live** Orders API using the project's own credentials (read-only `GET /catalog/products`). Supersedes the `UNVERIFIED` guesses further down wherever they conflict._

### Auth — confirmed
- The **`project` parameter is NOT the public key.** It is the JWT `sub` claim on `TEEMILL_API_KEY` — for this account, `merchforthefuture-451391`. Pass it as `?project={sub}`. (Using the public key returned `404`.)
- Header is the raw API key: `Authorization: {TEEMILL_API_KEY}` — no `Bearer` prefix. Returned `200 OK`.
- Working call: `GET https://api.teemill.com/v1/catalog/products?project=merchforthefuture-451391` → `{ "products": [ … ] }`.

### `/catalog/products` lists *your* products, fully enumerated
The endpoint returns products that exist **in your project** (built via the Teemill site or the Custom Product API), each with every variant. The live test product **"Powered By Plants"** returned:

- **Product:** `id`, `ref`, `title`, `description` (HTML), `slug`, `enabled: true`, blank `sku` (`DIY-BLANK-9592969`), `attributes`, `images`, `variants`, plus a long tail of storefront/integration fields we can ignore (`shopifyId`, `seoMetadata`, `metafields`, `staticCollections`, …).
- **Attributes:** `Colour` = Denim Blue / Brown / Evergreen; `Size` = XS, S, M, L, XL, XXL.
- **15 variants** (3 colours × up to 6 sizes; not every combination stocked). Each variant carries:
  - `ref` — **the orderable variantRef**: `https://api.teemill.com/v1/catalog/variants/{uuid}` (note `/catalog/variants/`, correcting the `/v1/variants/` guess below).
  - `attributes` — `Size`, and `Colour` with a **hex** thumbnail (`{ "type": "color", "value": "#23312d" }`). Colours now carry hex, not just names.
  - `retailPrice` / `price` — `{ "amount": 21, "currencyCode": "GBP" }`. **Prices are GBP.**
  - `stock` — `{ "level": 73, "locations": [{ "country": "GB", "level": 73 }] }`. Live per-warehouse stock.
  - `applications[]` — the print spec: `technology: "dtg"`, `placement: "front"` (a **named zone, not x/y coordinates**), `src` = the design PNG (`images.podos.io/…`), `mockup: null`. Confirms Teemill owns placement; no coordinates are exposed in the Orders catalog.
  - `images[]` — rendered mockups, see below.

### Mockups ARE available via API
Both `product.images[]` and each `variant.images[]` carry rendered mockup URLs (`images.podos.io/…`), each tagged with `variantIds` linking the photo to its colour variant. Teemill generates and serves per-colour mockups. **We do not upload or generate mockups** for Teemill products — we read `images[].src`.

### What this resolves / changes
- **Open Q#1 (catalog shape):** answered — documented above.
- **Open Q#5 (programmatic mockups):** answered — **yes**. This largely **removes the need for MFTF-8** for Teemill products.
- **Open Q#6 (sizes per product):** answered — sizes are in the Orders catalog (variant attributes), not only in `/omnis/v3/product/options`.
- **3-colour free-tier cap:** confirmed live (the product maxed at exactly 3 colours).
- **Currency:** Teemill bases cost in **GBP** while the store is USD/Stripe — an FX/margin input to the open "apparel retail pricing model" question.

### Designer / per-product editor URLs (confirmed live 2026-06-13)
These are on the **public site** (`teemill.com`), not the API host:
- **New product (designer):** `https://teemill.com/create-a-product/?project={projectId}`
- **Edit an existing product:** `https://teemill.com/create-a-product/{slug}/?project={projectId}`

`{projectId}` is the JWT `sub` on the API key (`merchforthefuture-451391`) — the same value used as the `?project=` param on the Orders API. `{slug}` is the product `slug` from `/catalog/products` (e.g. `powered-by-plants`; the live product's reference address is `https://merchforthefuture.teemill.com/product/powered-by-plants/`). Implemented in `src/lib/fulfillment/teemill/client.ts` (`teemillDesignerUrl()` / `teemillEditUrl()`); the slug is cached at ingest on `ApparelListing.providerProductSlug`. This resolves the US-MFTF-13.4 "Edit on Teemill" live-confirm flag.

### Design implication (for a spec session — not decided here)
A Teemill custom design only becomes orderable once the product exists in the project, after which the catalog exposes design, colours, sizes, mockups, stock and base price by **product ref**. This points toward a "reference a Teemill product ref" listing model for Teemill — distinct from the Prodigi "send a design file to a chosen blank" model that MFTF-4/5 currently implement. That divergence is a spec-level decision; see the kickoff prompt handed to the design session.

---

## Authentication

Both APIs use the same API key mechanism:

- **Header:** `Authorization: {your-api-key}`
- API key is obtained from your Teemill account at https://teemill.com/api (requires account login + 2FA)
- The Orders API also requires a **`project`** query parameter on every request, identifying which Teemill "project" (store) the request belongs to
- No OAuth flow documented for server-to-server use; API key is the standard approach
- **Legacy bearer token** also accepted (older format, avoid for new integrations)

**Known gap:** Rate limits not publicly documented. To be filled in after live access.

**No sandbox environment found.** Teemill does not appear to offer a sandbox/test API base URL (unlike Prodigi's `api.sandbox.prodigi.com`). Live credentials against the production API will be required for integration testing. This is a significant operational difference from the existing Prodigi setup and should be flagged when writing MFTF-3 tests — MSW stubs will be the only option for automated testing.

---

## Orders API — Endpoints

Base URL: `https://api.teemill.com/v1`

All requests require:
- `Authorization: {api-key}` header
- `?project={projectName}` query parameter
- `Content-Type: application/json`

### GET `/catalog/products`

Retrieves the product catalog for the project. Response contains a `products` array.

**Known gap:** Full response schema not confirmed from public sources. Likely includes `variantRef` URLs (see Orders below) per variant. Shape to be verified with live API access.

### POST `/orders`

Creates and submits an order.

**Request body:**
```json
{
  "contactInformation": {
    "email": "buyer@example.com",
    "phone": "+44 7700 900000"
  },
  "shippingAddress": {
    "contactName": "Jane Smith",
    "company": "",
    "addressLine1": "123 High Street",
    "addressLine2": "",
    "city": "London",
    "postalCode": "SW1A 1AA",
    "country": "GB",
    "state": ""
  },
  "items": [
    {
      "variantRef": "https://api.teemill.com/v1/catalog/variants/{uuid}",
      "quantity": 1
    }
  ]
}
```

**Key fields:**
- `country`: ISO 2-letter code
- `variantRef`: the variant's `ref` from `/catalog/products` — an absolute URL of the form `https://api.teemill.com/v1/catalog/variants/{uuid}` (verified live 2026-06-12; earlier `/v1/variants/{uuid}` guess was wrong)

**Responses:**
- `201 Created` — returns order data as JSON
- `400 Bad Request` — returns `{ "message": "..." }` describing the error

### GET `/orders/{orderRef}`

Retrieves an order by its reference. Response includes an `id`, and a `fulfillments` array. Each fulfillment has:
- `id` — fulfillment identifier
- `availableShippingMethods` — array of `{ id, name, totalPrice: { amount } }`

### POST `/orders/{orderId}/confirm`

Confirms an order and selects a shipping method per fulfillment.

**Request body:**
```json
[
  {
    "fulfillmentId": "{fulfillment-id}",
    "shippingMethodId": "{shipping-method-id}"
  }
]
```

**Responses:**
- `200 OK` — confirmation details
- `400 Bad Request` — `{ "message": "..." }`

### Order Submission Flow (two-step)

The demo code reveals a **two-step order process**:

1. `POST /orders` — creates the order in a pending state, returns `fulfillments` with available shipping options
2. `POST /orders/{id}/confirm` — selects a shipping method per fulfillment to finalize

This differs from Prodigi's single-step order creation. MFTF-3 interface design must accommodate this. One option: `createOrder()` on the `FulfillmentProvider` interface covers both steps internally, and the caller only sees a confirmed result. Implementation detail to decide during MFTF-3.

---

## Custom Product API — Endpoints (for reference)

Base URL: `https://teemill.com/omnis/v3/`

These endpoints are for building a Teemill-hosted storefront product, **not for programmatic order submission**. Documented here as context for MFTF-8 (mockup generation) since product images are obtained this way.

### GET `/product/options`

Returns the full product catalog with item codes, available colors per product, and design placement coordinates.

**Sample response structure (confirmed from live endpoint):**

| Item Code | Product | Available Colors | Notes |
|---|---|---|---|
| RNA1 | Men's Basic T-shirt | Athletic Grey, Tie Dye, Navy Blue, Black, White, Mustard, Red, Dark Grey, Bright Blue (9) | Core unisex tee |
| RNB14 | Women's Crewneck T-shirt | 12 colors | Broadest color selection |
| RNA7 | Men's Pullover Hoodie | Light Heather, Navy, Black, Stone Blue, Rust, White (6) | |
| RNB13 | Women's Pullover Hoody | Navy Blue, Stone Blue, Mauve, Black, Light Heather (5) | |
| RNA4 | Men's Crew Neck Sweater | Navy Blue, Light Heather, Black, Sand, Brown, Khaki, White (7) | |
| RNB18 | Women's Crewneck Sweater | Mauve, Navy Blue, White, Light Heather, Black (5) | |
| RNA26 | Men's Long Sleeve T-shirt | Athletic Grey, Navy Blue, White, Black, Denim Blue (5) | |
| RNB22 | Women's Long Sleeve T-shirt | 6 colors | |
| RNB27 | Women's Boxy Tee | 7 colors | |
| RNB36 | Women's Relaxed Fit Tee | White, Stone Blue, Black (3) | |
| RNB33 | Women's Relaxed Fit Hoodie | White, Stone Blue, Black, Athletic Grey (4) | |
| RNB46 | Women's Plain T-shirt | White, Stone Blue (2) | |
| RNB3 | Women's Vest Top | Black, White (2) | |
| RNC1 | Kids' Basic T-Shirt | Mauve, Pink, Mustard, Denim Blue, Black, White, Bright Blue (7) | |
| RNT1 | Colour Tote Bag | Natural, White, Black (3) | |
| RNKEP70 | EP Tote | Black (1) | |
| STAU773 | Stanley/Stella Light Tote Bag | Spectra Yellow (1) | Third-party brand |
| RNK25 | Mug | White (1) | Non-apparel |

The response also includes `design placement` coordinates (`x`, `y`, `w`, `h` as fractions of image dimensions) for each product — useful for the MFTF-8 mockup generation flow.

**All products listed are described by Teemill as GOTS-certified organic cotton** (or in the case of the mug, non-apparel). Satisfies the brand's 100% cotton non-negotiable.

Colors are identified by **plain name strings** (e.g. `"White"`, `"Navy Blue"`, `"Athletic Grey"`) — not hex codes or numeric IDs.

### POST `/product/create`

Creates a product listing on Teemill's hosted storefront. **Not relevant for MFTF direct-checkout flow.**

**Request fields:**
- `image_url` (required): base64-encoded PNG of the design
- `item_code` (optional): product type, defaults to `RNA1`
- `colours` (optional): comma-separated color names (e.g. `"White,Black,Navy Blue"`)
- `name` (optional): product title
- `description` (optional): product page copy
- `price` (optional): retail price
- `cross_sell` (optional, boolean): allow design on other product types, defaults to `1`

**Response:** returns a `url` — a link to the product on Teemill's own storefront.

---

## Webhooks

**No webhook documentation found in publicly accessible sources.**

The Orders API (Stoplight-hosted docs) is JS-rendered and not crawlable. Webhook support exists for the Orders API based on spec references in MFTF-7.2 — specific event names, payload schema, and registration mechanism are all unknown.

**To verify with live access:**
- Does the Orders API support webhooks at all, or does it require polling `GET /orders/{ref}`?
- If webhooks exist: what events fire (dispatched, shipped, delivered, cancelled)?
- What does the payload look like — does it include a tracking number and carrier?
- How are webhooks registered (dashboard UI vs. API call)?

Until confirmed, MFTF-7.2 tests should use polling (`GET /orders/{ref}`) as the fallback, with a `// TODO: replace with webhook when shape is confirmed` comment.

---

## Mockup Generation (MFTF-8)

> **Update 2026-06-12 (live-verified):** This section is largely **moot for Teemill**. The Orders `/catalog/products` response already returns rendered per-colour mockups in `product.images[]` and `variant.images[]` (`images.podos.io`), linked to variants via `variantIds`. No compositing or upload needed — read `images[].src`. The compositing-from-placement-coordinates approach below is unnecessary for Teemill products; MFTF-8 should be re-evaluated (likely dropped) in the spec session. The notes below are retained as historical context.

Teemill markets an "AI T-shirt Mockup Generator" at https://teemill.com/t-shirt-mock-up-generator/ but this appears to be a **browser-based UI tool**, not a programmatic API endpoint.

The `omnis/v3/product/options` response includes design placement coordinates per product (`x`, `y`, `w`, `h`), which would be the inputs to any mockup compositing logic.

**Assessment:** A true mockup API endpoint has not been confirmed in public sources. MFTF-8 may need to be reconsidered — options are:

1. **Client-side compositing using placement coordinates** — fetch the product's blank image and overlay the design using canvas/Sharp, using the `x/y/w/h` coordinates from `/product/options`. No Teemill API call needed.
2. **Teemill mockup endpoint** — may exist behind authentication; needs verification with live access.
3. **Defer MFTF-8** until live API access resolves whether a programmatic mockup endpoint exists.

Flag this to the team: MFTF-8 is already marked Deferred and this research supports keeping it that way until 2FA is resolved.

---

## Sizing

Sizes are not returned by the `/product/options` endpoint (only colors and design placement are in that response). Size options are presumably returned by the `/catalog/products` endpoint as part of variant enumeration.

**Known gap:** Available sizes per product are unconfirmed. Standard assumption for a unisex tee would be XS–3XL. To verify with live `/catalog/products` call.

---

## Key Differences from Prodigi

| Concern | Prodigi | Teemill |
|---|---|---|
| Sandbox environment | Yes (`api.sandbox.prodigi.com`) | Not found — likely none |
| Order creation | Single-step | Two-step (create then confirm with shipping method) |
| Product identification | SKU string (e.g. `GLOBAL-FAP-16X20`) | `variantRef` URL (e.g. `/v1/variants/{uuid}`) |
| Color identification | Part of SKU | Named string (e.g. `"White"`) |
| Webhook documentation | Available | Not publicly documented |
| Base URL env var | `PRODIGI_API_BASE_URL` | TBD — suggest `TEEMILL_API_BASE_URL` |

---

## Open Questions (require live API access)

| # | Question | Status |
|---|---|---|
| 1 | Full `/catalog/products` response shape — what fields do variants expose? | **Resolved 2026-06-12** — see Live API Verification + MSW stubs. |
| 2 | Does the Orders API support webhooks? If so, what events and payload shape? | **Open** — none found; use polling `GET /orders/{ref}` until confirmed. Blocks the webhook upgrade of US-MFTF-12.6. |
| 3 | What are the API rate limits? | **Open** — undocumented; gates synchronous checkout-time live stock/price re-reads (US-MFTF-12.3). |
| 4 | Is there a sandbox/test mode? | **Resolved** — none; MSW is the only option. |
| 5 | Does a programmatic mockup endpoint exist? | **Resolved 2026-06-12** — moot; mockups are served in the catalog (`images[].variantIds`). MFTF-8 not needed for Teemill. |
| 6 | What sizes are available per product type? | **Resolved 2026-06-12** — sizes are variant attributes in `/catalog/products` (XS–XXL on the test product). |
| 7 | How is `shippingMethodId` chosen at confirm time — always-cheapest or buyer-facing? | **Resolved 2026-06-17 (live)** — `POST /orders` returns `fulfillments[].availableShippingMethods[]`, each `{ id (PER-ORDER UUID), name, description, deliveryEstimates, totalPrice: { amount, currencyCode } }`. Names are carrier services (e.g. `Spring Tracked`, `Store Collect`, `Spring USA`); there is **no stable "standard" id**. On the wholesale Orders API **shipping is bundled into the item cost** (item `totalPrice` ≈ £15.63; order-level `shippingPrice` 0.00), so the methods' `totalPrice.amount` are all **`0.00 GBP`** — a genuine £0, not a parse miss. Whole response is **GBP-only** (no currency request param). App logic (`chooseTeemillShippingMethod`): exclude in-store collect, pick cheapest shippable; store the method **name** at quote time and re-resolve to the per-order id at confirm. Still UNVERIFIED: whether an unconfirmed `POST /orders` expires/bills. |

---

## MSW Stub Handlers

> **Updated 2026-06-12 to verified shapes.** The block below reflects the live `/catalog/products` response (the "Powered By Plants" test product), the verified `…/catalog/variants/{uuid}` ref form, colour hex, per-warehouse stock, GBP prices, and per-colour mockups linked by `variantIds`. Fields still genuinely unconfirmed are marked `// UNVERIFIED` (order status enum values; webhook/tracking payload). Use these for MFTF-3, MFTF-12, and MFTF-13 tests.

```typescript
// Teemill Orders API stubs — base: https://api.teemill.com/v1
// Auth (verified): Authorization: {raw key, NO "Bearer"}; ?project={JWT sub} = "merchforthefuture-451391" (NOT the public key)

http.get('https://api.teemill.com/v1/catalog/products', () => {
  return HttpResponse.json({
    products: [
      {
        id: 'mock-product-powered-by-plants',
        ref: 'https://api.teemill.com/v1/catalog/products/mock-product-uuid',
        title: 'Powered By Plants',
        description: '<p>…</p>',
        slug: 'powered-by-plants',
        enabled: true,
        sku: 'DIY-BLANK-9592969',
        attributes: [
          { name: 'Colour', values: ['Denim Blue', 'Brown', 'Evergreen'] },
          { name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
        ],
        // Product-level rendered mockups, each tagged to the variants it depicts:
        images: [
          { src: 'https://images.podos.io/mock-denimblue.jpg', variantIds: ['v-denimblue-m'] },
          { src: 'https://images.podos.io/mock-evergreen.jpg', variantIds: ['v-evergreen-m'] },
        ],
        variants: [
          {
            id: 'v-evergreen-m',
            // Orderable variantRef — absolute, /catalog/variants/ (NOT /v1/variants/):
            ref: 'https://api.teemill.com/v1/catalog/variants/mock-variant-uuid-evergreen-m',
            attributes: [
              { name: 'Size', value: 'M' },
              { name: 'Colour', value: 'Evergreen', thumbnail: { type: 'color', value: '#23312d' } },
            ],
            retailPrice: { amount: 21, currencyCode: 'GBP' },
            price: { amount: 21, currencyCode: 'GBP' },
            stock: { level: 73, locations: [{ country: 'GB', level: 73 }] },
            applications: [
              { technology: 'dtg', placement: 'front', src: 'https://images.podos.io/design.png', mockup: null },
            ],
            images: [
              { src: 'https://images.podos.io/mock-evergreen.jpg', variantIds: ['v-evergreen-m'] },
            ],
          },
          // …additional colour/size variants (3 colours × up to 6 sizes; not every combo stocked = 15 total)
        ],
      },
    ],
  });
}),

http.post('https://api.teemill.com/v1/orders', () => {
  // Step 1 of two-step flow: returns fulfillments with availableShippingMethods (verified shape).
  return HttpResponse.json(
    {
      id: 'mock-order-id-123',
      fulfillments: [
        {
          id: 'mock-fulfillment-id-1',
          availableShippingMethods: [
            { id: 'standard', name: 'Standard', totalPrice: { amount: '3.99' } }, // UNVERIFIED — Open Q#7: is there a stable "standard" id, or buyer-facing choice?
            { id: 'express', name: 'Express', totalPrice: { amount: '7.99' } },
          ],
        },
      ],
    },
    { status: 201 }
  );
}),

http.post('https://api.teemill.com/v1/orders/:orderId/confirm', () => {
  // Step 2: body is [{ fulfillmentId, shippingMethodId }]
  return HttpResponse.json(
    {
      id: 'mock-order-id-123',
      status: 'confirmed', // UNVERIFIED — status enum values not confirmed live
    },
    { status: 200 }
  );
}),

http.get('https://api.teemill.com/v1/orders/:orderRef', () => {
  // Used for shipment-status POLLING (webhooks unconfirmed — see Webhooks section).
  return HttpResponse.json({
    id: 'mock-order-id-123',
    status: 'processing', // UNVERIFIED — status values unknown
    fulfillments: [
      {
        id: 'mock-fulfillment-id-1',
        // UNVERIFIED — tracking number + carrier field paths on a dispatched fulfillment not yet seen live:
        // trackingNumber: 'XXedrjfk', carrier: 'Royal Mail', status: 'dispatched',
        availableShippingMethods: [
          { id: 'standard', name: 'Standard', totalPrice: { amount: '3.99' } },
        ],
      },
    ],
  });
}),
```

---

## Sources

- [Teemill API Overview](https://teemill.com/api-docs/)
- [Orders API Documentation](https://teemill.com/api-docs/orders/)
- [Catalog API Documentation](https://teemill.com/api-docs/catalog/)
- [Orders API on Stoplight](https://teemill.stoplight.io/docs/public-api/e02037992e427-orders-api)
- [Teemill api-demos (GitHub)](https://github.com/Teemill/api-demos) — `nodejs/create-order.js`, `list-products.js`, `confirm-order.js`
- [node-red-custom-product (GitHub)](https://github.com/Teemill/node-red-custom-product)
- [teemill-ruby-sdk (GitHub)](https://github.com/G-Bro/teemill-ruby-sdk)
- [Product options live endpoint](https://teemill.com/omnis/v3/product/options)
- [Node-RED package docs](https://flows.nodered.org/node/@teemill/node-red-custom-product)
