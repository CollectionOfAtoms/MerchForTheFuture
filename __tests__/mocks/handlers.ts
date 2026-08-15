import { http, HttpResponse } from "msw";
import { buildPoweredByPlantsCatalog } from "./teemill-fixture";

// ─── Stripe handlers ──────────────────────────────────────────────────────────
const stripeHandlers = [
  http.post("https://api.stripe.com/v1/payment_intents", () =>
    HttpResponse.json({
      id: "pi_test_mock",
      client_secret: "pi_test_mock_secret",
      status: "requires_payment_method",
      amount: 10000,
      currency: "usd",
    })
  ),
  http.post("https://api.stripe.com/v1/checkout/sessions", () =>
    HttpResponse.json({
      id: "cs_test_mock",
      client_secret: "cs_test_mock_secret",
      payment_status: "paid",
      status: "complete",
      amount_total: 50000,
      currency: "usd",
      total_details: { amount_tax: 0, breakdown: { taxes: [] } },
      metadata: { orderId: "" },
    })
  ),
  http.get("https://api.stripe.com/v1/checkout/sessions/:sessionId", ({ params }) => {
    const sessionId = params.sessionId as string;
    const isPaid = sessionId !== "cs_test_unpaid";
    return HttpResponse.json({
      id: sessionId,
      client_secret: `${sessionId}_secret`,
      payment_status: isPaid ? "paid" : "unpaid",
      status: isPaid ? "complete" : "open",
      amount_total: 30000,
      currency: "usd",
      total_details: { amount_tax: 0, breakdown: { taxes: [] } },
      metadata: { orderId: "" },
    });
  }),
  http.post("https://api.stripe.com/v1/accounts", () =>
    HttpResponse.json({
      id: "acct_test_mock",
      type: "express",
    })
  ),
  http.post("https://api.stripe.com/v1/transfers", () =>
    HttpResponse.json({ id: "tr_test_mock", amount: 9000 })
  ),
];

// ─── Prodigi handlers ─────────────────────────────────────────────────────────
// MSW v2 does not support RegExp URL patterns — use explicit string handlers for
// both the live and sandbox base URLs so tests are intercepted regardless of
// which PRODIGI_API_BASE_URL is set in the environment.
const PRODIGI_BASES = [
  "https://api.prodigi.com/v4.0",
  "https://api.sandbox.prodigi.com/v4.0",
];

const prodigiHandlers = PRODIGI_BASES.flatMap((base) => [
  http.get(`${base}/products`, () =>
    HttpResponse.json({
      products: [
        {
          sku: "GLOBAL-FAP-16X24",
          description: "Fine Art Print 16x24",
          productDimensions: { width: 16, height: 24, units: "inches" },
        },
      ],
    })
  ),
  // Single product details. Default: every SKU resolves (200) so existing
  // create/update flows validate; tests that exercise an INVALID SKU override
  // this per-test with `server.use(... 404 ...)` (BUG-16).
  http.get(`${base}/products/:sku`, ({ params }) =>
    HttpResponse.json({
      product: {
        sku: params.sku,
        description: `Product ${params.sku as string}`,
        productDimensions: { width: 16, height: 24, units: "inches" },
        attributes: {},
        variants: [],
      },
    })
  ),
  http.post(`${base}/orders`, () =>
    HttpResponse.json({
      outcome: "Created",
      order: { id: "ord-test-mock", status: { stage: "InProgress" } },
    })
  ),
  // Prodigi quote endpoint (US-MFTF-12.3). Costs are returned in the requested
  // currency (USD), so no FX is applied to Prodigi shipping.
  http.post(`${base}/quotes`, () =>
    HttpResponse.json({
      quotes: [
        {
          shipmentMethod: "Standard",
          costSummary: {
            items: { amount: "0.00", currency: "USD" },
            shipping: { amount: "4.99", currency: "USD" },
          },
        },
      ],
    })
  ),
  http.get(`${base}/orders/:orderId`, ({ params }) =>
    HttpResponse.json({
      order: {
        id: params.orderId,
        status: { stage: "InProgress" },
        shipments: [],
      },
    })
  ),
]);

// ─── Stripe Tax handlers (Epic 5) ─────────────────────────────────────────────
// Stripe Tax computes/applies tax natively (no TaxJar). These cover the Customer
// management used for tax exemptions (US-5.2) and the tax-registration list used
// for the admin nexus panel (US-5.3). Tests override with server.use() to assert
// exact request bodies.
const taxHandlers = [
  http.post("https://api.stripe.com/v1/customers", () =>
    HttpResponse.json({ id: "cus_test_mock", object: "customer" })
  ),
  http.post("https://api.stripe.com/v1/customers/:id", ({ params }) =>
    HttpResponse.json({ id: params.id, object: "customer", tax_exempt: "exempt" })
  ),
  http.get("https://api.stripe.com/v1/tax/registrations", () =>
    HttpResponse.json({
      object: "list",
      data: [
        { id: "taxreg_mock_or", object: "tax.registration", status: "active", country: "US", country_options: { us: { state: "OR" } } },
      ],
      has_more: false,
    })
  ),
];

// ─── Exchange rate handlers ───────────────────────────────────────────────────
const currencyHandlers = [
  http.get("https://api.exchangerate-api.com/v4/latest/:base", ({ params }) =>
    HttpResponse.json({
      base: params.base,
      date: "2026-05-09",
      rates: {
        USD: 1.0,
        EUR: 0.92,
        GBP: 0.79,
        CAD: 1.37,
        AUD: 1.55,
        JPY: 155.0,
      },
    })
  ),
];

// ─── MailerSend (email) handlers ─────────────────────────────────────────────
const emailHandlers = [
  http.post("https://api.mailersend.com/v1/email", () =>
    HttpResponse.json({ id: "email_test_mock" })
  ),
];

// ─── Teemill Orders API handlers ─────────────────────────────────────────────
// Base: https://api.teemill.com/v1 — verified shapes from /docs/teemill-api-notes.md.
// Auth (verified): Authorization = raw key (NO "Bearer"); ?project={JWT sub}.
const teemillHandlers = [
  http.get("https://api.teemill.com/v1/catalog/products", () =>
    HttpResponse.json(buildPoweredByPlantsCatalog())
  ),
  // Step 1 of the two-step Orders flow — returns shipping methods per fulfillment
  // without finalizing (used for quoteShipping in US-MFTF-12.3 and order create in
  // US-MFTF-12.5). Shape verified live 2026-06-17: per-order UUID method ids,
  // carrier-service names (incl. an in-store "Store Collect"), price in
  // totalPrice.amount (GBP; typically 0.00 since shipping is bundled into item cost).
  http.post("https://api.teemill.com/v1/orders", () =>
    HttpResponse.json(
      {
        id: "mock-order-id-123",
        fulfillments: [
          {
            id: "mock-fulfillment-id-1",
            availableShippingMethods: [
              // In-store collect is £0 but must never be auto-selected for a shipped order.
              { id: "collect-uuid", name: "Store Collect", totalPrice: { amount: "0.00" } },
              { id: "standard", name: "Standard", totalPrice: { amount: "3.99" } },
              { id: "express", name: "Express", totalPrice: { amount: "7.99" } },
            ],
          },
        ],
      },
      { status: 201 }
    )
  ),
  // Step 2 — confirm (US-MFTF-12.5). // UNVERIFIED status enum.
  http.post("https://api.teemill.com/v1/orders/:id/confirm", () =>
    HttpResponse.json({ id: "mock-order-id-123", status: "confirmed" }, { status: 200 })
  ),
  // Status polling (US-MFTF-12.6). // UNVERIFIED tracking field paths.
  http.get("https://api.teemill.com/v1/orders/:orderRef", ({ params }) =>
    HttpResponse.json({
      id: params.orderRef,
      status: "processing",
      fulfillments: [
        {
          id: "mock-fulfillment-id-1",
          availableShippingMethods: [{ id: "standard", name: "Standard", totalPrice: { amount: "3.99" } }],
        },
      ],
    })
  ),
];

// ─── Printify API handlers (US-MFTF-17.2) ────────────────────────────────────
// Base: https://api.printify.com/v1 — DESIGNED provider, two-step orders (create →
// send-to-production), shop-scoped endpoints. Catalog + shipping-calc shapes
// verified live 2026-07-12 (docs/printify-api-notes.md); order/status shapes are
// // UNVERIFIED and resolve at US-MFTF-17.3. No live Printify calls in tests. Tests
// override these per-case with server.use() to assert exact bodies / error paths.
const PRINTIFY_BASE = "https://api.printify.com/v1";
const printifyHandlers = [
  // Blueprint detail — stock/catalog images + brand/model (US-MFTF-17.5 admin lookup).
  http.get(`${PRINTIFY_BASE}/catalog/blueprints/:id.json`, ({ params }) =>
    HttpResponse.json({
      id: Number(params.id),
      title: "Women's Baby Tee",
      brand: "Generic brand",
      model: "",
      images: [
        "https://images.printify.com/mock-baby-tee-1",
        "https://images.printify.com/mock-baby-tee-2",
        "https://images.printify.com/mock-baby-tee-3",
      ],
    }),
  ),
  // Print providers offering a blueprint (US-MFTF-17.5 admin lookup). Returned with
  // Printify Choice NOT first, so the "Printify Choice first" sort is exercised by code.
  http.get(`${PRINTIFY_BASE}/catalog/blueprints/:id/print_providers.json`, () =>
    HttpResponse.json([
      { id: 217, title: "Fulfill Engine", decoration_methods: ["dtf"] },
      { id: 99, title: "Printify Choice", decoration_methods: ["dtf"] },
    ]),
  ),
  // Single print-provider detail — carries the location (a separate endpoint from
  // the blueprint's provider list). Location varies by id so ordering/labels can be
  // asserted (US-MFTF-17.5 location display).
  http.get(`${PRINTIFY_BASE}/catalog/print_providers/:id.json`, ({ params }) => {
    const byId: Record<string, { city: string; region: string; country: string; title: string }> = {
      "99": { city: "Miami", region: "FL", country: "US", title: "Printify Choice" },
      "217": { city: "Monroe", region: "NC", country: "US", title: "Fulfill Engine" },
    };
    const loc = byId[String(params.id)] ?? { city: "Somewhere", region: "TX", country: "US", title: `Provider ${params.id}` };
    return HttpResponse.json({
      id: Number(params.id),
      title: loc.title,
      location: { city: loc.city, region: loc.region, country: loc.country },
    });
  }),
  // Curated (blueprint, print_provider) variants. Printify hides out-of-stock
  // variants unless `show-out-of-stock=1` is passed, so the fixture mirrors that:
  // the full range (4) with the flag, a currently-in-stock SUBSET (3 — Black/M is
  // "out of stock") without it. Catalog sync uses the flag; the availability probe
  // (US-MFTF-17.4) uses the default to detect what's orderable now.
  http.get(`${PRINTIFY_BASE}/catalog/blueprints/:bp/print_providers/:pp/variants.json`, ({ request }) => {
    const full = [
      { id: 17391, title: "Heather Grey / S", options: { color: "Heather Grey", size: "S" } },
      { id: 17392, title: "Heather Grey / M", options: { color: "Heather Grey", size: "M" } },
      { id: 17401, title: "Black / S", options: { color: "Black", size: "S" } },
      { id: 17402, title: "Black / M", options: { color: "Black", size: "M" } },
    ];
    const showOOS = new URL(request.url).searchParams.get("show-out-of-stock") === "1";
    const body = showOOS ? full : full.filter((v) => v.id !== 17402); // Black/M OOS by default
    return HttpResponse.json({ variants: body });
  }),
  // Shipping calc (creates no order) — USD integer cents.
  http.post(`${PRINTIFY_BASE}/shops/:shop/orders/shipping.json`, () =>
    HttpResponse.json({ standard: 1959, express: 2959 }),
  ),
  // Design upload — returns the image id referenced in the order's print_areas.
  http.post(`${PRINTIFY_BASE}/uploads/images.json`, () =>
    HttpResponse.json({ id: "img-mock", file_name: "design.png" }),
  ),
  // Order create (step 1) — NOT produced until send-to-production.
  http.post(`${PRINTIFY_BASE}/shops/:shop/orders.json`, () =>
    HttpResponse.json({ id: "printify-order-mock", status: "pending" }),
  ),
  // Send to production (step 2, the safety valve).
  http.post(`${PRINTIFY_BASE}/shops/:shop/orders/:id/send-to-production.json`, ({ params }) =>
    HttpResponse.json({ id: params.id, status: "in-production" }),
  ),
  // Order status polling. // UNVERIFIED status vocabulary + tracking field paths.
  http.get(`${PRINTIFY_BASE}/shops/:shop/orders/:id.json`, ({ params }) =>
    HttpResponse.json({ id: params.id, status: "in-production", shipments: [] }),
  ),
];

export const handlers = [
  ...stripeHandlers,
  ...prodigiHandlers,
  ...taxHandlers,
  ...currencyHandlers,
  ...emailHandlers,
  ...teemillHandlers,
  ...printifyHandlers,
];
