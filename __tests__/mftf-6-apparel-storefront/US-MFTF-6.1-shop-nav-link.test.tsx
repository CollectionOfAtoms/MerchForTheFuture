// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));
vi.mock("@/app/actions/auth", () => ({ signOutAction: vi.fn() }));

const { default: MobileMenu } = await import("@/components/MobileMenu");

afterEach(cleanup);

// AC: navigation includes a link to /shop visible to all users.
describe("US-MFTF-6.1 — /shop navigation link", () => {
  it("exposes a Shop link to anonymous (logged-out) visitors", () => {
    render(<MobileMenu user={null} roles={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
    const shop = screen.getByRole("link", { name: /^shop$/i });
    expect(shop.getAttribute("href")).toBe("/shop");
  });

  it("exposes a Shop link to signed-in buyers", () => {
    render(<MobileMenu user={{ name: "Bee", email: "bee@test.com" }} roles={["BUYER"]} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
    const shop = screen.getByRole("link", { name: /^shop$/i });
    expect(shop.getAttribute("href")).toBe("/shop");
  });
});
