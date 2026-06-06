// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href, ...rest }, children),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock("@/app/actions/auth", () => ({
  signOutAction: vi.fn(),
}));

const { default: MobileMenu } = await import("@/components/MobileMenu");

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("US-20.1 — Mobile Navigation (MobileMenu)", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  describe("Toggle button", () => {
    it("renders a toggle button with aria-label 'Toggle menu'", () => {
      render(<MobileMenu user={null} roles={[]} />);
      expect(screen.getByRole("button", { name: /toggle menu/i })).toBeInTheDocument();
    });

    it("toggle button has aria-expanded=false initially", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const btn = screen.getByRole("button", { name: /toggle menu/i });
      expect(btn).toHaveAttribute("aria-expanded", "false");
    });

    it("toggle button has aria-expanded=true after click", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const btn = screen.getByRole("button", { name: /toggle menu/i });
      fireEvent.click(btn);
      expect(btn).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("Menu visibility", () => {
    it("menu is hidden initially (hidden attribute)", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const menu = document.getElementById("mobile-menu");
      expect(menu).toHaveAttribute("hidden");
    });

    it("menu becomes visible after toggle button click", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const btn = screen.getByRole("button", { name: /toggle menu/i });
      fireEvent.click(btn);
      const menu = document.getElementById("mobile-menu");
      expect(menu).not.toHaveAttribute("hidden");
    });

    it("menu hides again when toggle button is clicked a second time", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const btn = screen.getByRole("button", { name: /toggle menu/i });
      fireEvent.click(btn);
      fireEvent.click(btn);
      const menu = document.getElementById("mobile-menu");
      expect(menu).toHaveAttribute("hidden");
    });
  });

  describe("Nav links", () => {
    it("renders Browse, Auctions, Prints when menu is open", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByRole("link", { name: /^browse$/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /^auctions$/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /^prints$/i })).toBeInTheDocument();
    });

    it("Browse href is /browse", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByRole("link", { name: /^browse$/i })).toHaveAttribute("href", "/browse");
    });

    it("clicking a link closes the menu", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      fireEvent.click(screen.getByRole("link", { name: /^browse$/i }));
      const menu = document.getElementById("mobile-menu");
      expect(menu).toHaveAttribute("hidden");
    });
  });

  describe("Auth — logged out", () => {
    it("shows Sign In link when user is null", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    });

    it("shows Sign Up link when user is null", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByRole("link", { name: /sign up/i })).toBeInTheDocument();
    });

    it("does not show Sign Out button when user is null", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
    });
  });

  describe("Auth — logged in", () => {
    const user = { name: "Alice", email: "alice@example.com" };

    it("shows user name when logged in", () => {
      render(<MobileMenu user={user} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    it("shows Sign Out button when logged in", () => {
      render(<MobileMenu user={user} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    });

    it("does not show Sign In link when logged in", () => {
      render(<MobileMenu user={user} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    });

    it("falls back to email when name is null", () => {
      render(<MobileMenu user={{ name: null, email: "alice@example.com" }} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
  });

  describe("Keyboard — Escape key", () => {
    it("closes menu on Escape key press", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      fireEvent.keyDown(document, { key: "Escape" });
      const menu = document.getElementById("mobile-menu");
      expect(menu).toHaveAttribute("hidden");
    });
  });

  describe("Scroll lock", () => {
    it("sets overflow hidden on body when menu opens", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores overflow when menu closes", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const btn = screen.getByRole("button", { name: /toggle menu/i });
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(document.body.style.overflow).toBe("");
    });
  });

  describe("Accessibility", () => {
    it("menu has aria-label", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const menu = document.getElementById("mobile-menu");
      expect(menu).toHaveAttribute("aria-label", "Mobile navigation");
    });

    it("toggle button has aria-controls pointing to mobile-menu", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const btn = screen.getByRole("button", { name: /toggle menu/i });
      expect(btn).toHaveAttribute("aria-controls", "mobile-menu");
    });
  });

  describe("Focus ring", () => {
    it("nav links are rendered inside the scoped CSS focus rule (#mobile-menu a)", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      const menu = document.getElementById("mobile-menu");
      expect(menu).toBeInTheDocument();
      expect(menu!.querySelector("a")).not.toBeNull();
    });

    it("Sign In link is inside the menu and receives the focus rule", () => {
      render(<MobileMenu user={null} roles={[]} />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      const menu = document.getElementById("mobile-menu");
      const signIn = within(menu!).getByRole("link", { name: /sign in/i });
      expect(signIn).toBeInTheDocument();
    });
  });

  describe("Active page indicator", () => {
    it("sets data-active='true' on the link whose path matches currentPath", () => {
      render(<MobileMenu user={null} roles={[]} currentPath="/browse" />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByRole("link", { name: /^browse$/i })).toHaveAttribute("data-active", "true");
    });

    it("does not set data-active on links with query strings (filter shortcuts)", () => {
      render(<MobileMenu user={null} roles={[]} currentPath="/browse" />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByRole("link", { name: /^auctions$/i })).not.toHaveAttribute("data-active");
      expect(screen.getByRole("link", { name: /^prints$/i })).not.toHaveAttribute("data-active");
    });

    it("only one link has data-active at a time", () => {
      render(<MobileMenu user={null} roles={[]} currentPath="/browse" />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(document.querySelectorAll('[data-active="true"]')).toHaveLength(1);
    });

    it("highlights My Bids when currentPath is /buyer/bids", () => {
      render(<MobileMenu user={{ name: "Alice", email: "a@a.com" }} roles={["BUYER"]} currentPath="/buyer/bids" />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(screen.getByRole("link", { name: /my bids/i })).toHaveAttribute("data-active", "true");
      expect(screen.getByRole("link", { name: /^browse$/i })).not.toHaveAttribute("data-active");
    });

    it("no link is active when currentPath matches nothing in the list", () => {
      render(<MobileMenu user={null} roles={[]} currentPath="/some/other/page" />);
      fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
      expect(document.querySelectorAll('[data-active="true"]')).toHaveLength(0);
    });
  });
});
