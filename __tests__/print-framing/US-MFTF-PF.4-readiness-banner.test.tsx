// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { PrintReadiness } from "@/lib/print/framing";
import PrintReadinessBanner from "@/components/PrintReadinessBanner";

function readiness(overrides: Partial<PrintReadiness>): PrintReadiness {
  return {
    enabled: true,
    offeredAspects: [],
    offeredSizes: [],
    framedAspects: [],
    missingAspects: [],
    mockedSizes: [],
    missingSizes: [],
    needsReframeAspects: [],
    ready: false,
    ...overrides,
  };
}

describe("US-MFTF-PF.4 — PrintReadinessBanner (component)", () => {
  it("enumerates unframed aspects with a fix link", () => {
    render(
      <PrintReadinessBanner
        readiness={readiness({ missingAspects: ["4:5", "2:3"], offeredAspects: [{ aspectRatio: "4:5", isCanvas: true }, { aspectRatio: "2:3", isCanvas: false }] })}
      />,
    );
    expect(screen.getByText(/4:5/)).toBeInTheDocument();
    expect(screen.getByText(/2:3/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /frame it/i }).length).toBeGreaterThan(0);
  });

  it("distinguishes needs-reframe aspects from never-framed ones", () => {
    render(
      <PrintReadinessBanner
        readiness={readiness({ missingAspects: ["4:5"], needsReframeAspects: ["4:5"] })}
      />,
    );
    expect(screen.getByText(/needs a reframe/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /reframe it/i })).toBeInTheDocument();
  });

  it("lists missing-mockup sizes by their human label", () => {
    render(
      <PrintReadinessBanner
        readiness={readiness({ missingSizes: ["GLOBAL-FAP-12X18"] })}
        sizeLabels={{ "GLOBAL-FAP-12X18": "12×18 in" }}
      />,
    );
    expect(screen.getByText(/12×18 in/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add one/i })).toBeInTheDocument();
  });

  it("renders nothing when the listing is print-ready", () => {
    const { container } = render(<PrintReadinessBanner readiness={readiness({ ready: true })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when prints are disabled", () => {
    const { container } = render(
      <PrintReadinessBanner readiness={readiness({ enabled: false, ready: false })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
