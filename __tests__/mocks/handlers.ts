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

// ─── TaxJar handlers ──────────────────────────────────────────────────────────
const taxHandlers = [
  http.post("https://api.taxjar.com/v2/taxes", () =>
    HttpResponse.json({
      tax: {
        amount_to_collect: 8.5,
        rate: 0.085,
        has_nexus: true,
        freight_taxable: false,
        tax_source: "destination",
        breakdown: {
          state_tax_rate: 0.06,
          county_tax_rate: 0.0025,
          city_tax_rate: 0,
          special_district_tax_rate: 0.0225,
        },
      },
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

export const handlers = [
  ...stripeHandlers,
  ...prodigiHandlers,
  ...taxHandlers,
  ...currencyHandlers,
  ...emailHandlers,
  ...teemillHandlers,
];
