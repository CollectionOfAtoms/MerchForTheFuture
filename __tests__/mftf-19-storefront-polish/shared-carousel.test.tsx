// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Carousel, { type CarouselImage } from "@/components/Carousel";

afterEach(cleanup);

const images: CarouselImage[] = [
  { url: "https://x/a.jpg", backgroundColor: null },
  { url: "https://x/b.jpg", backgroundColor: "#000000", badge: "Mockup · Black" },
  { url: "https://x/c.jpg", backgroundColor: "#ffffff" },
];

const mainSrc = () => (screen.getAllByRole("img")[0] as HTMLImageElement).src;

describe("Carousel (shared)", () => {
  it("cycles with on-screen arrows, wrapping around", () => {
    render(<Carousel images={images} title="Tee" />);
    expect(mainSrc()).toBe("https://x/a.jpg");
    fireEvent.click(screen.getByRole("button", { name: /next image/i }));
    expect(mainSrc()).toBe("https://x/b.jpg");
    fireEvent.click(screen.getByRole("button", { name: /previous image/i }));
    expect(mainSrc()).toBe("https://x/a.jpg");
    fireEvent.click(screen.getByRole("button", { name: /previous image/i }));
    expect(mainSrc()).toBe("https://x/c.jpg"); // wrapped below zero
  });

  it("cycles with Left/Right arrow keys, ignoring keys typed in a field", () => {
    render(<Carousel images={images} title="Tee" />);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(mainSrc()).toBe("https://x/b.jpg");

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(mainSrc()).toBe("https://x/b.jpg"); // unchanged while typing
    input.remove();
  });

  it("jumps to a thumbnail's image when clicked", () => {
    render(<Carousel images={images} title="Tee" />);
    fireEvent.click(screen.getByRole("button", { name: /view image 3/i }));
    expect(mainSrc()).toBe("https://x/c.jpg");
  });

  it("composites the active image's background and shows its badge", () => {
    render(<Carousel images={images} title="Tee" />);
    fireEvent.click(screen.getByRole("button", { name: /next image/i }));
    const frame = (screen.getAllByRole("img")[0] as HTMLElement).parentElement as HTMLElement;
    expect(frame.style.backgroundColor).toBe("rgb(0, 0, 0)");
    expect(screen.getByText("Mockup · Black")).toBeTruthy();
  });

  it("supports a controlled index + onIndexChange", () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(<Carousel images={images} title="Tee" index={0} onIndexChange={onIndexChange} />);
    expect(mainSrc()).toBe("https://x/a.jpg");
    // Controlled: arrow asks the parent to change, doesn't move on its own.
    fireEvent.click(screen.getByRole("button", { name: /next image/i }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(mainSrc()).toBe("https://x/a.jpg"); // still 0 until parent updates
    rerender(<Carousel images={images} title="Tee" index={1} onIndexChange={onIndexChange} />);
    expect(mainSrc()).toBe("https://x/b.jpg");
  });

  it("renders an empty state with no arrows for an empty image list", () => {
    render(<Carousel images={[]} title="Tee" emptyLabel="No images yet" />);
    expect(screen.getByText("No images yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /next image/i })).toBeNull();
  });
});
