// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { default: RefreshOnMount } = await import("@/components/RefreshOnMount");

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("RefreshOnMount (clears stale cart badge after checkout)", () => {
  it("calls router.refresh exactly once on mount and renders nothing", () => {
    const { container } = render(<RefreshOnMount />);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe("");
  });
});
