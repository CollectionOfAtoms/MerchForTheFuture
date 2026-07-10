// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

// ─── Mocks (hoisted before imports) ───────────────────────────────────────────

// (ImageLightbox now renders the shared Carousel, which uses plain <img> — no
// next/image mock needed.)
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => "/"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

const { default: ImageLightbox } = await import("@/components/ImageLightbox");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ONE = [
  {
    url: "https://cdn.test/art.jpg",
    displayUrl: "https://cdn.test/display.jpg",
    isPrimary: true,
    order: 0,
  },
];

const THREE = [
  {
    url: "https://cdn.test/a1.jpg",
    displayUrl: "https://cdn.test/d1.jpg",
    isPrimary: true,
    order: 0,
  },
  {
    url: "https://cdn.test/a2.jpg",
    displayUrl: "https://cdn.test/d2.jpg",
    isPrimary: false,
    order: 1,
  },
  {
    url: "https://cdn.test/a3.jpg",
    displayUrl: null,
    isPrimary: false,
    order: 2,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockMatchMedia(isTouch: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: isTouch, // true when "(hover: none)" matches → touch device
      media: q,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function openLightbox() {
  fireEvent.click(
    screen.getByRole("button", { name: /open image in fullscreen/i }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ImageLightbox", () => {
  beforeEach(() => {
    mockMatchMedia(false); // desktop with hover capability by default
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  // ── US-19.1 — Open Image Lightbox ─────────────────────────────────────────

  describe("US-19.1 — Open lightbox", () => {
    it("main image button has cursor-zoom-in class", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      const btn = screen.getByRole("button", {
        name: /open image in fullscreen/i,
      });
      expect(btn).toHaveClass("cursor-zoom-in");
    });

    it("lightbox is not visible before any click", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
    });

    it("clicking the main image opens the lightbox overlay", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      expect(screen.getByTestId("lightbox")).toBeInTheDocument();
    });

    it("lightbox shows displayUrl as the image src", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      const lb = screen.getByTestId("lightbox");
      const img = within(lb).getByRole("img");
      expect(img).toHaveAttribute("src", "https://cdn.test/display.jpg");
    });

    it("lightbox falls back to url when displayUrl is null", () => {
      const noDisplay = [
        {
          url: "https://cdn.test/art.jpg",
          displayUrl: null,
          isPrimary: true,
          order: 0,
        },
      ];
      render(<ImageLightbox images={noDisplay} title="Art" />);
      openLightbox();
      const lb = screen.getByTestId("lightbox");
      const img = within(lb).getByRole("img");
      expect(img).toHaveAttribute("src", "https://cdn.test/art.jpg");
    });

    it("renders a semi-transparent backdrop behind the lightbox image", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      expect(screen.getByTestId("lightbox-backdrop")).toBeInTheDocument();
    });

    it("clicking the backdrop closes the lightbox", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      fireEvent.click(screen.getByTestId("lightbox-backdrop"));
      expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
    });
  });

  // ── US-19.2 — Carousel Navigation Inside Lightbox ─────────────────────────

  describe("US-19.2 — Carousel navigation in lightbox", () => {
    it("shows prev/next buttons inside lightbox when multiple images", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      const lb = screen.getByTestId("lightbox");
      expect(
        within(lb).getByLabelText("Previous image"),
      ).toBeInTheDocument();
      expect(within(lb).getByLabelText("Next image")).toBeInTheDocument();
    });

    it("does not show nav buttons when only one image", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      const lb = screen.getByTestId("lightbox");
      expect(
        within(lb).queryByLabelText("Previous image"),
      ).not.toBeInTheDocument();
      expect(
        within(lb).queryByLabelText("Next image"),
      ).not.toBeInTheDocument();
    });

    it("shows index indicator '1 / N' starting at first image", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    it("ArrowRight key advances to the next image", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      fireEvent.keyDown(document, { key: "ArrowRight" });
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });

    it("ArrowLeft key goes to the previous image", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      fireEvent.keyDown(document, { key: "ArrowRight" }); // → 2
      fireEvent.keyDown(document, { key: "ArrowLeft" }); // → 1
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    it("navigation wraps from last image to first", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      fireEvent.keyDown(document, { key: "ArrowRight" }); // → 2
      fireEvent.keyDown(document, { key: "ArrowRight" }); // → 3
      fireEvent.keyDown(document, { key: "ArrowRight" }); // → wraps to 1
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    it("navigation wraps from first image to last", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      fireEvent.keyDown(document, { key: "ArrowLeft" }); // 1 → wraps to 3
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });

    it("clicking Next button advances the image", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      const lb = screen.getByTestId("lightbox");
      fireEvent.click(within(lb).getByLabelText("Next image"));
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });

    it("clicking Previous button goes back", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      const lb = screen.getByTestId("lightbox");
      fireEvent.click(within(lb).getByLabelText("Next image")); // → 2
      fireEvent.click(within(lb).getByLabelText("Previous image")); // → 1
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    it("keyboard navigation does not fire when lightbox is closed", () => {
      render(<ImageLightbox images={THREE} title="Art" />);
      // lightbox is closed — arrow key should do nothing (no crash, no indicator)
      fireEvent.keyDown(document, { key: "ArrowRight" });
      expect(screen.queryByText("2 / 3")).not.toBeInTheDocument();
    });
  });

  // ── US-19.3 — Close Lightbox ───────────────────────────────────────────────

  describe("US-19.3 — Close lightbox", () => {
    it("close (×) button is present inside the lightbox", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      expect(screen.getByLabelText("Close lightbox")).toBeInTheDocument();
    });

    it("clicking the × button closes the lightbox", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      fireEvent.click(screen.getByLabelText("Close lightbox"));
      expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
    });

    it("pressing Escape closes the lightbox", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("lightbox")).not.toBeInTheDocument();
    });

    it("document.body.style.overflow is 'hidden' while lightbox is open", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("document.body.style.overflow is restored to '' after closing", () => {
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      fireEvent.click(screen.getByLabelText("Close lightbox"));
      expect(document.body.style.overflow).toBe("");
    });

    it("window.scrollTo is called with saved scroll position when lightbox closes", () => {
      const scrollTo = window.scrollTo as ReturnType<typeof vi.fn>;
      render(<ImageLightbox images={ONE} title="Art" />);
      scrollTo.mockClear();
      openLightbox();
      scrollTo.mockClear(); // clear any calls from opening
      fireEvent.click(screen.getByLabelText("Close lightbox"));
      expect(scrollTo).toHaveBeenCalledOnce();
      expect(scrollTo).toHaveBeenCalledWith(0, expect.any(Number));
    });
  });

  // ── US-19.4 — Magnifier Lens ───────────────────────────────────────────────

  describe("US-19.4 — Magnifier lens on hover", () => {
    it("magnifier appears on mousemove over lightbox image on desktop", () => {
      mockMatchMedia(false); // desktop
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      const container = screen.getByTestId("lightbox-img-container");
      fireEvent.mouseMove(container, { clientX: 100, clientY: 100 });
      expect(screen.getByTestId("magnifier")).toBeInTheDocument();
    });

    it("magnifier disappears on mouseleave", () => {
      mockMatchMedia(false);
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      const container = screen.getByTestId("lightbox-img-container");
      fireEvent.mouseMove(container, { clientX: 100, clientY: 100 });
      fireEvent.mouseLeave(container);
      expect(screen.queryByTestId("magnifier")).not.toBeInTheDocument();
    });

    it("magnifier is not rendered on touch devices (hover:none)", () => {
      mockMatchMedia(true); // touch device
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      const container = screen.getByTestId("lightbox-img-container");
      fireEvent.mouseMove(container, { clientX: 100, clientY: 100 });
      expect(screen.queryByTestId("magnifier")).not.toBeInTheDocument();
    });

    it("magnifier element has a border (visually distinct)", () => {
      mockMatchMedia(false);
      render(<ImageLightbox images={ONE} title="Art" />);
      openLightbox();
      const container = screen.getByTestId("lightbox-img-container");
      fireEvent.mouseMove(container, { clientX: 100, clientY: 100 });
      const magnifier = screen.getByTestId("magnifier");
      // border is applied via inline style or a CSS class
      const hasBorder =
        magnifier.style.border ||
        magnifier.style.borderWidth ||
        magnifier.className.includes("border");
      expect(hasBorder).toBeTruthy();
    });

    it("magnifier is not shown before lightbox is opened", () => {
      mockMatchMedia(false);
      render(<ImageLightbox images={ONE} title="Art" />);
      expect(screen.queryByTestId("magnifier")).not.toBeInTheDocument();
    });
  });

  // ── Mobile lightbox controls layout & auto-hide ────────────────────────────

  describe("Mobile — controls layout and auto-hide", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("right arrow does not have right-16 class (should be right-4)", () => {
      mockMatchMedia(false);
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      const lb = screen.getByTestId("lightbox");
      const nextBtn = lb.querySelector('[aria-label="Next image"]') as HTMLElement;
      expect(nextBtn.className).not.toContain("right-16");
      expect(nextBtn.className).toContain("right-4");
    });

    it("controls are visible when lightbox first opens on touch", () => {
      mockMatchMedia(true);
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      const lb = screen.getByTestId("lightbox");
      const nextBtn = lb.querySelector('[aria-label="Next image"]') as HTMLElement;
      // Should start visible (opacity-100 class)
      expect(nextBtn.className).toContain("opacity-100");
      expect(nextBtn.className).not.toContain("opacity-0");
    });

    it("controls fade out after 3 seconds of no interaction on touch", () => {
      mockMatchMedia(true);
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      act(() => { vi.advanceTimersByTime(3000); });
      const lb = screen.getByTestId("lightbox");
      const nextBtn = lb.querySelector('[aria-label="Next image"]') as HTMLElement;
      expect(nextBtn.className).toContain("opacity-0");
    });

    it("controls reappear on touch after being hidden", () => {
      mockMatchMedia(true);
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      act(() => { vi.advanceTimersByTime(3000); }); // hide controls
      const lb = screen.getByTestId("lightbox");
      fireEvent.touchStart(lb); // touch anywhere to reveal
      const nextBtn = lb.querySelector('[aria-label="Next image"]') as HTMLElement;
      expect(nextBtn.className).toContain("opacity-100");
      expect(nextBtn.className).not.toContain("opacity-0");
    });

    it("touching resets the 3-second timer", () => {
      mockMatchMedia(true);
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      act(() => { vi.advanceTimersByTime(2000); });
      const lb = screen.getByTestId("lightbox");
      fireEvent.touchStart(lb); // touch at 2s — timer resets
      act(() => { vi.advanceTimersByTime(2000); }); // only 2s since last touch, not 3
      const nextBtn = lb.querySelector('[aria-label="Next image"]') as HTMLElement;
      // Should still be visible (timer hasn't hit 3s since last touch)
      expect(nextBtn.className).toContain("opacity-100");
    });

    it("controls are always visible on non-touch (pointer) devices", () => {
      mockMatchMedia(false); // desktop / hover
      render(<ImageLightbox images={THREE} title="Art" />);
      openLightbox();
      act(() => { vi.advanceTimersByTime(10000); }); // far past 3s — should not hide
      const lb = screen.getByTestId("lightbox");
      const nextBtn = lb.querySelector('[aria-label="Next image"]') as HTMLElement;
      expect(nextBtn.className).not.toContain("opacity-0");
    });
  });
});
