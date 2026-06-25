// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CartView } from "@/lib/cart/cart";
import type { CheckoutSummary } from "@/lib/checkout/types";

vi.mock("@/app/actions/checkout", () => ({ createCheckoutAction: vi.fn() }));
vi.mock("@/components/CartPaymentForm", () => ({ default: () => null }));

const { createCheckoutAction } = await import("@/app/actions/checkout");
const { default: CheckoutClient } = await import("@/components/CheckoutClient");

const view: CartView = { items: [], subtotal: 0, itemCount: 0 };

const SUMMARY: CheckoutSummary = {
  status: "ok",
  removed: [],
  priceChanges: [],
  itemsSubtotal: 50,
  shippingTotal: 0,
  total: 50,
  groups: [
    { label: "Shipment 1", items: [], shippingMethod: "Standard", shippingCost: 0, options: [{ method: "Standard", cost: 0 }] },
  ],
};

function submitAddress() {
  // calculate() runs on form submit and has no client-side gating.
  fireEvent.submit(document.querySelector("form")!);
}

describe("US-5.4 — checkout local-currency cue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the pre-tax total converted to the buyer's currency (Stripe still charges USD)", async () => {
    vi.mocked(createCheckoutAction).mockResolvedValue({ summary: SUMMARY } as never);
    render(<CheckoutClient view={view} display={{ currency: "GBP", rate: 0.8 }} />);
    submitAddress();

    expect(await screen.findByText("Approx. in GBP")).toBeTruthy();
    expect(screen.getByText("≈ £40.00")).toBeTruthy(); // 50 * 0.8
    expect(screen.getByText(/Your card is charged in USD/)).toBeTruthy();
  });

  it("shows no conversion line when the buyer's currency is USD", async () => {
    vi.mocked(createCheckoutAction).mockResolvedValue({ summary: SUMMARY } as never);
    render(<CheckoutClient view={view} display={{ currency: "USD", rate: null }} />);
    submitAddress();

    expect(await screen.findByText("Total before tax")).toBeTruthy();
    expect(screen.queryByText(/Approx. in/)).toBeNull();
  });
});
