import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Server-render guard: the create form must SSR to the same disabled/empty
// initial state the client hydrates to (a stale-build desync once showed the
// server rendering the action buttons *without* `disabled`, which produced a
// hydration mismatch). This locks the SSR output.

vi.mock("@/app/actions/referenced-apparel", () => ({
  resolveTeemillRefAction: vi.fn(),
  createReferencedListingAction: vi.fn(),
}));
vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const { default: NewReferencedListingForm } = await import(
  "@/components/seller/NewReferencedListingForm"
);

describe("US-MFTF-13.3 — create form SSR stability", () => {
  it("renders to static markup without throwing", () => {
    expect(() =>
      renderToStaticMarkup(
        <NewReferencedListingForm teemillDesignerUrl="https://teemill.com/create-a-product/?project=x" />,
      ),
    ).not.toThrow();
  });

  it("server-renders the action buttons disabled at initial state (matches client)", () => {
    const html = renderToStaticMarkup(
      <NewReferencedListingForm teemillDesignerUrl="https://teemill.com/create-a-product/?project=x" />,
    );
    // Resolve, Save as draft, and Publish are all disabled before a ref resolves.
    const disabledButtons = html.match(/<button[^>]*\sdisabled(=""|\s|>)/g) ?? [];
    expect(disabledButtons.length).toBeGreaterThanOrEqual(3);
  });

  it("server-renders an empty description textarea (no leading-newline gotcha)", () => {
    const html = renderToStaticMarkup(
      <NewReferencedListingForm teemillDesignerUrl="https://teemill.com/create-a-product/?project=x" />,
    );
    expect(html).toMatch(/<textarea[^>]*name="description"[^>]*><\/textarea>/);
  });
});
