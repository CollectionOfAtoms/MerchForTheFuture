// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const addApparelImageAction = vi.fn();
const deleteApparelImageAction = vi.fn();
const setApparelPrimaryImageAction = vi.fn();
const replaceApparelDesignAction = vi.fn();
vi.mock("@/app/actions/apparel", () => ({
  addApparelImageAction: (...a: unknown[]) => addApparelImageAction(...a),
  deleteApparelImageAction: (...a: unknown[]) => deleteApparelImageAction(...a),
  setApparelPrimaryImageAction: (...a: unknown[]) => setApparelPrimaryImageAction(...a),
  replaceApparelDesignAction: (...a: unknown[]) => replaceApparelDesignAction(...a),
}));
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const { default: ApparelImageManager } = await import(
  "@/components/seller/ApparelImageManager"
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("US-MFTF-13.4 — ApparelImageManager in referenced mode", () => {
  it("hides the design-file section when showDesignFile is false", () => {
    render(
      <ApparelImageManager
        listingId="l1"
        initialImages={[]}
        designImageUrl={null}
        showDesignFile={false}
        refreshOnChange
      />,
    );
    expect(screen.queryByText(/design file/i)).toBeNull();
    // Lifestyle management is still present.
    expect(screen.getByText(/lifestyle photos/i)).toBeInTheDocument();
    expect(screen.getByText(/add photo/i)).toBeInTheDocument();
  });

  it("still shows the design-file section for designed listings (default)", () => {
    render(
      <ApparelImageManager
        listingId="l1"
        initialImages={[]}
        designImageUrl="https://blob/design.png"
      />,
    );
    expect(screen.getByText(/design file/i)).toBeInTheDocument();
  });

  it("refreshes server data after deleting a photo when refreshOnChange is set", async () => {
    deleteApparelImageAction.mockResolvedValue({ success: true });
    render(
      <ApparelImageManager
        listingId="l1"
        initialImages={[
          { id: "img1", originalUrl: "https://blob/a.jpg", displayUrl: "https://blob/a-d.jpg", isPrimary: true },
        ]}
        designImageUrl={null}
        showDesignFile={false}
        refreshOnChange
      />,
    );
    screen.getByLabelText(/delete photo/i).click();
    await waitFor(() => expect(deleteApparelImageAction).toHaveBeenCalledWith("l1", "img1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
