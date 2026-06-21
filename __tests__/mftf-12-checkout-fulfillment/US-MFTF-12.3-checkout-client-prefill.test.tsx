// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { CartView } from "@/lib/cart/cart";
import type { FulfillmentShippingAddress } from "@/lib/fulfillment/types";

vi.mock("@/app/actions/checkout", () => ({ createCheckoutAction: vi.fn() }));
vi.mock("@/components/CartPaymentForm", () => ({ default: () => null }));

const { default: CheckoutClient } = await import("@/components/CheckoutClient");

const view: CartView = { items: [], subtotal: 0, itemCount: 0 };

describe("CheckoutClient — primary address pre-fill (buying cycle)", () => {
  it("pre-fills the shipping form with the buyer's primary saved address", () => {
    const initial: FulfillmentShippingAddress = {
      name: "Pat Buyer", line1: "1 Main St", line2: "Apt 2", city: "Portland", state: "OR", postal: "97201", country: "US",
    };
    render(<CheckoutClient view={view} initialAddress={initial} />);

    expect(screen.getByPlaceholderText("Full name")).toHaveValue("Pat Buyer");
    expect(screen.getByPlaceholderText("Address line 1")).toHaveValue("1 Main St");
    expect(screen.getByPlaceholderText("Address line 2 (optional)")).toHaveValue("Apt 2");
    expect(screen.getByPlaceholderText("City")).toHaveValue("Portland");
    expect(screen.getByPlaceholderText("State / region")).toHaveValue("OR");
    expect(screen.getByPlaceholderText("Postal code")).toHaveValue("97201");
    expect(screen.getByPlaceholderText("Country (ISO)")).toHaveValue("US");
  });

  it("leaves the form empty (country defaulting to US) when there is no saved address", () => {
    render(<CheckoutClient view={view} initialAddress={null} />);
    expect(screen.getByPlaceholderText("Full name")).toHaveValue("");
    expect(screen.getByPlaceholderText("City")).toHaveValue("");
    expect(screen.getByPlaceholderText("Country (ISO)")).toHaveValue("US");
  });
});
