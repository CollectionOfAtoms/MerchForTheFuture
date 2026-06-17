// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import OrderShipments from "@/components/OrderShipments";
import type { OrderShipmentsView } from "@/lib/checkout/shipments";

afterEach(cleanup);

const view: OrderShipmentsView = {
  id: "order-1",
  aggregateStatus: "Processing",
  shipments: [
    {
      label: "Shipment 1 of 2",
      status: "SHIPPED",
      trackingNumber: "TM-TRACK-1",
      carrier: "Royal Mail",
      items: [{ title: "Powered By Plants", selectionSummary: "Evergreen · M", quantity: 1 }],
    },
    {
      label: "Shipment 2 of 2",
      status: "CONFIRMED",
      trackingNumber: null,
      carrier: null,
      items: [{ title: "Sunrise", selectionSummary: "Fine Art Paper · 16x24", quantity: 1 }],
    },
  ],
};

describe("OrderShipments (US-MFTF-12.6)", () => {
  it("renders each shipment grouped as 'Shipment N of M'", () => {
    render(<OrderShipments view={view} />);
    expect(screen.getByText("Shipment 1 of 2")).toBeTruthy();
    expect(screen.getByText("Shipment 2 of 2")).toBeTruthy();
  });

  it("shows tracking for a shipped shipment and never exposes provider names", () => {
    const { container } = render(<OrderShipments view={view} />);
    expect(screen.getByText(/TM-TRACK-1/)).toBeTruthy();
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("teemill");
    expect(text).not.toContain("prodigi");
  });
});
