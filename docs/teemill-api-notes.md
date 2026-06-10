# Teemill API Discovery Notes

**Status:** Partially complete — API key access blocked pending 2FA support resolution.  
**Last updated:** 2026-06-07  
**Unblocked by:** Teemill support resolving 2FA, then generating an API key at https://teemill.com/api

---

## Summary for MFTF-3 / MFTF-7

Teemill exposes **two distinct APIs** with different integration models. Understanding which to use is the first architectural decision:

| API | Base URL | Purpose | MFTF relevance |
|---|---|---|---|
| Custom Product API | `https://teemill.com/omnis/v3/` | Creates a product page **on Teemill's hosted storefront**; returns a URL the buyer visits to purchase | **Not what we want** — buyer leaves our site |
| Orders API | `https://api.teemill.com/v1/` | Submits orders programmatically from your own checkout flow | **This is what MFTF-7 needs** |

The Orders API is the correct integration target for MFTF. It lets us run our own Stripe Checkout and then call Teemill to create the fulfillment order, exactly like the existing Prodigi integration pattern.

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
      "variantRef": "/v1/variants/{uuid}",
      "quantity": 1
    }
  ]
}
```

**Key fields:**
- `country`: ISO 2-letter code
- `variantRef`: a relative URL path referencing a specific product variant (UUID obtained from `/catalog/products`)

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

| # | Question | Blocks |
|---|---|---|
| 1 | Full `/catalog/products` response shape — what fields do variants expose? | MFTF-3.3 stub accuracy, MFTF-7 |
| 2 | Does the Orders API support webhooks? If so, what events and payload shape? | MFTF-7.2 |
| 3 | What are the API rate limits? | MFTF-3.3 test design |
| 4 | Is there a sandbox/test mode? (Strong prior: no.) | MFTF-3 and MFTF-7 testing strategy |
| 5 | Does a programmatic mockup endpoint exist behind auth? | MFTF-8 scoping decision |
| 6 | What sizes are available per product type? | MFTF-4 (admin product catalog) |
| 7 | How is `shippingMethodId` chosen at order-confirm time? Is this buyer-facing or always the cheapest? | MFTF-7.1 order flow |

---

## MSW Stub Handlers

The following stubs should be written for `__tests__/mocks/handlers.ts` to support MFTF-3 and MFTF-7 tests. Shapes marked `// UNVERIFIED` need live-API confirmation before MFTF-7 goes to "Passed".

```typescript
// Teemill Orders API stubs — base: https://api.teemill.com/v1

http.get('https://api.teemill.com/v1/catalog/products', () => {
  return HttpResponse.json({
    products: [
      {
        // UNVERIFIED — shape inferred from demo code
        id: 'mock-product-1',
        name: "Men's Basic T-shirt",
        variants: [
          { url: '/v1/variants/mock-variant-uuid-1', colour: 'White', size: 'M' },
          { url: '/v1/variants/mock-variant-uuid-2', colour: 'Black', size: 'M' },
        ],
      },
    ],
  });
}),

http.post('https://api.teemill.com/v1/orders', () => {
  return HttpResponse.json(
    {
      id: 'mock-order-id-123',
      fulfillments: [
        {
          id: 'mock-fulfillment-id-1',
          availableShippingMethods: [
            { id: 'standard', name: 'Standard', totalPrice: { amount: '3.99' } },
            { id: 'express', name: 'Express', totalPrice: { amount: '7.99' } },
          ],
        },
      ],
    },
    { status: 201 }
  );
}),

http.post('https://api.teemill.com/v1/orders/:orderId/confirm', () => {
  return HttpResponse.json(
    {
      id: 'mock-order-id-123',
      status: 'confirmed', // UNVERIFIED — status field name unknown
    },
    { status: 200 }
  );
}),

http.get('https://api.teemill.com/v1/orders/:orderRef', () => {
  return HttpResponse.json({
    id: 'mock-order-id-123',
    status: 'processing', // UNVERIFIED — status values unknown
    fulfillments: [
      {
        id: 'mock-fulfillment-id-1',
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
