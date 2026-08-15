// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// US-MFTF-17.6 fix — the admin "Sync from …" button is provider-aware: a Printify
// product type re-syncs from Printify (not Prodigi).

const prodigi = vi.fn(async (_id: string) => ({ sizes: 4, colors: 4 }));
const printify = vi.fn(async (_id: string) => ({ sizes: 4, colors: 4 }));
vi.mock("@/app/actions/admin/product-catalog", () => ({
  syncProductTypeFromProdigiAction: (id: string) => prodigi(id),
  syncProductTypeFromPrintifyAction: (id: string) => printify(id),
}));

import SyncProductButton from "@/components/admin/SyncProductButton";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-MFTF-17.6 — SyncProductButton is provider-aware", () => {
  it("labels + calls Prodigi by default", async () => {
    render(<SyncProductButton productTypeId="pt-1" />);
    const btn = screen.getByRole("button", { name: /sync from prodigi/i });
    fireEvent.click(btn);
    await waitFor(() => expect(prodigi).toHaveBeenCalledWith("pt-1"));
    expect(printify).not.toHaveBeenCalled();
  });

  it("labels + calls Printify for a Printify product type", async () => {
    render(<SyncProductButton productTypeId="pt-2" provider="PRINTIFY" />);
    expect(screen.queryByRole("button", { name: /sync from prodigi/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /sync from printify/i }));
    await waitFor(() => expect(printify).toHaveBeenCalledWith("pt-2"));
    expect(prodigi).not.toHaveBeenCalled();
  });
});
