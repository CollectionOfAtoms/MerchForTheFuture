// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PrintifyPlacementPanel from "@/components/PrintifyPlacementPanel";

// US-MFTF-17.8 — the seller placement tool. Drag repositions (x/y), the resize
// handle scales (clamped), the rotate handle rotates (angle); "Reset to centered"
// clears a saved placement; re-opening pre-loads a saved placement; and a product
// type with no captured print area shows an unavailable state (no drag surface).

const confirmPrintifyPlacementAction = vi.fn(async (..._a: unknown[]) => ({ success: true as const }));
const resetPrintifyPlacementAction = vi.fn(async (..._a: unknown[]) => ({ success: true as const }));
vi.mock("@/app/actions/apparel", () => ({
  confirmPrintifyPlacementAction: (...a: unknown[]) => confirmPrintifyPlacementAction(...a),
  resetPrintifyPlacementAction: (...a: unknown[]) => resetPrintifyPlacementAction(...a),
}));

// jsdom lacks PointerEvent + pointer-capture; polyfill enough for fireEvent.pointer*.
beforeAll(() => {
  if (typeof PointerEvent === "undefined") {
    class PE extends MouseEvent {
      pointerId: number;
      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 0;
      }
    }
    (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PE;
  }
  for (const m of ["setPointerCapture", "releasePointerCapture", "hasPointerCapture"] as const) {
    if (!(Element.prototype as unknown as Record<string, unknown>)[m]) {
      (Element.prototype as unknown as Record<string, unknown>)[m] = () => false;
    }
  }
  // A fixed 400×500 print-area box so pointer deltas map to known fractions.
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 400, height: 500, left: 0, top: 0, right: 400, bottom: 500, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const printArea = { width: 2400, height: 2800 };

function renderPanel(overrides: Partial<React.ComponentProps<typeof PrintifyPlacementPanel>> = {}) {
  return render(
    <PrintifyPlacementPanel
      listingId="listing-1"
      designUrl="https://blob/design.png"
      printArea={printArea}
      blankImageUrl={null}
      initialPlacement={null}
      {...overrides}
    />,
  );
}

function design() {
  return screen.getByTestId("placement-design");
}
function nums() {
  const d = design();
  return {
    x: Number(d.getAttribute("data-x")),
    y: Number(d.getAttribute("data-y")),
    scale: Number(d.getAttribute("data-scale")),
    angle: Number(d.getAttribute("data-angle")),
  };
}

describe("US-MFTF-17.8 — placement tool", () => {
  it("opens centred at the 60% tool default when there is no saved placement", () => {
    renderPanel();
    expect(nums()).toMatchObject({ x: 0.5, y: 0.5, scale: 0.6, angle: 0 });
  });

  it("drag repositions the design (updates x/y)", () => {
    renderPanel();
    const surface = screen.getByTestId("placement-surface");
    fireEvent.pointerDown(design(), { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    // +40/400 = +0.1 in x, +50/500 = +0.1 in y.
    expect(nums().x).toBeCloseTo(0.6);
    expect(nums().y).toBeCloseTo(0.6);
  });

  it("the resize handle scales, clamped to the max", () => {
    renderPanel();
    const surface = screen.getByTestId("placement-surface");
    const handle = screen.getByTestId("placement-resize-handle");

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 0, pointerId: 1 }); // +200/400 = +0.5
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(nums().scale).toBeCloseTo(1.1); // starts at the 0.6 tool default

    // A huge drag is clamped to MAX_SCALE (3.0), never larger.
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 5000, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(nums().scale).toBe(3);
  });

  it("the rotate handle rotates (updates angle)", () => {
    renderPanel();
    const surface = screen.getByTestId("placement-surface");
    const handle = screen.getByTestId("placement-rotate-handle");
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 0, pointerId: 1 }); // +100/400*180 = 45°
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(nums().angle).toBeCloseTo(45);
  });

  it("re-opening pre-loads a saved placement", () => {
    renderPanel({ initialPlacement: { x: 0.3, y: 0.7, scale: 1.4, angle: -20 } });
    expect(nums()).toMatchObject({ x: 0.3, y: 0.7, scale: 1.4, angle: -20 });
  });

  it("'Reset to centered' clears the saved placement", async () => {
    renderPanel({ initialPlacement: { x: 0.3, y: 0.7, scale: 1.4, angle: -20 } });
    fireEvent.click(screen.getByTestId("reset-placement"));
    // Server call to delete the row…
    expect(resetPrintifyPlacementAction).toHaveBeenCalledWith("listing-1");
    // …and the tool returns to the centred 60% starting default locally.
    await vi.waitFor(() => expect(nums()).toMatchObject({ x: 0.5, y: 0.5, scale: 0.6, angle: 0 }));
  });

  it("confirm persists the current placement", async () => {
    renderPanel();
    const surface = screen.getByTestId("placement-surface");
    fireEvent.pointerDown(design(), { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 40, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    fireEvent.click(screen.getByTestId("confirm-placement"));
    await vi.waitFor(() => expect(confirmPrintifyPlacementAction).toHaveBeenCalledTimes(1));
    const [id, placement] = confirmPrintifyPlacementAction.mock.calls[0] as unknown as [string, { x: number }];
    expect(id).toBe("listing-1");
    expect(placement.x).toBeCloseTo(0.6);
  });

  it("shows an unavailable state (no drag surface) when the product type has no print area", () => {
    renderPanel({ printArea: null });
    expect(screen.getByTestId("placement-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("placement-surface")).toBeNull();
  });
});
