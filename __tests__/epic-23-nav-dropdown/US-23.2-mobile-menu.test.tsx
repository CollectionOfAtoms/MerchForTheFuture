// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const buyerUser  = { name: "Alice", email: "alice@example.com" };
const sellerUser = { name: "Sam",   email: "sam@example.com"   };
const adminUser  = { name: "Admin", email: "admin@example.com" };

function open() {
  fireEvent.click(screen.getByRole("button", { name: /toggle menu/i }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-23.2 — Restructured Mobile Menu with Role-Aware Sections", () => {
  beforeEach(() => { document.body.style.overflow = ""; });
  afterEach(() => {
    document.body.style.overflow = "";
    vi.restoreAllMocks();
  });

  // ─── Always-present nav links ──────────────────────────────────────────────

  describe("Always-present nav links", () => {
    it("shows Browse link when signed out", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.getByRole("link", { name: /^browse$/i })).toBeInTheDocument();
    });

    it("shows Auctions link when signed out", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.getByRole("link", { name: /^auctions$/i })).toBeInTheDocument();
    });

    it("shows Prints link when signed out", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.getByRole("link", { name: /^prints$/i })).toBeInTheDocument();
    });

    it("Browse href is /browse", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.getByRole("link", { name: /^browse$/i })).toHaveAttribute("href", "/browse");
    });

    it("Auctions href is /browse?type=auction", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.getByRole("link", { name: /^auctions$/i })).toHaveAttribute("href", "/browse?type=auction");
    });

    it("Prints href is /browse?type=print", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.getByRole("link", { name: /^prints$/i })).toHaveAttribute("href", "/browse?type=print");
    });

    it("shows Browse / Auctions / Prints when signed in as buyer", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByRole("link", { name: /^browse$/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /^auctions$/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /^prints$/i })).toBeInTheDocument();
    });
  });

  // ─── Signed-out state ─────────────────────────────────────────────────────

  describe("Signed out", () => {
    it("shows Sign In link", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    });

    it("shows Sign Up link", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.getByRole("link", { name: /sign up/i })).toBeInTheDocument();
    });

    it("does not show Sign Out button", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
    });

    it("does not show Dashboard link", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
    });
  });

  // ─── Signed-in: user identity section ─────────────────────────────────────

  describe("Signed-in identity section", () => {
    it("shows the user's name", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByText(/alice/i)).toBeInTheDocument();
    });

    it("falls back to email when name is null", () => {
      render(<MobileMenu user={{ name: null, email: "alice@example.com" }} roles={["BUYER"]} />);
      open();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    it("renders a horizontal rule separator", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(document.getElementById("mobile-menu")!.querySelector("hr")).toBeInTheDocument();
    });

    it("does not show Sign In or Sign Up when signed in", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument();
    });

    it("shows Sign Out button", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    });
  });

  // ─── Dashboard link ───────────────────────────────────────────────────────

  describe("Dashboard link — role-appropriate href", () => {
    it("BUYER Dashboard points to /dashboard/buyer", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard/buyer");
    });

    it("SELLER Dashboard points to /dashboard/seller", () => {
      render(<MobileMenu user={sellerUser} roles={["SELLER"]} />);
      open();
      expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard/seller");
    });

    it("ADMIN Dashboard points to /dashboard/admin", () => {
      render(<MobileMenu user={adminUser} roles={["ADMIN"]} />);
      open();
      expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard/admin");
    });
  });

  // ─── Settings link ────────────────────────────────────────────────────────

  describe("Settings link — role-appropriate href", () => {
    it("BUYER Settings points to /buyer/settings", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/buyer/settings");
    });

    it("SELLER Settings points to /seller/settings", () => {
      render(<MobileMenu user={sellerUser} roles={["SELLER"]} />);
      open();
      expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/seller/settings");
    });

    it("ADMIN Settings points to /admin/settings", () => {
      render(<MobileMenu user={adminUser} roles={["ADMIN"]} />);
      open();
      expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/admin/settings");
    });
  });

  // ─── BUYER role ───────────────────────────────────────────────────────────

  describe("BUYER role", () => {
    it("shows My Bids link", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByRole("link", { name: /my bids/i })).toBeInTheDocument();
    });

    it("shows Orders link", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByRole("link", { name: /^orders$/i })).toBeInTheDocument();
    });

    it("My Bids href is /buyer/bids", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByRole("link", { name: /my bids/i })).toHaveAttribute("href", "/buyer/bids");
    });

    it("Orders href is /buyer/orders", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.getByRole("link", { name: /^orders$/i })).toHaveAttribute("href", "/buyer/orders");
    });

    it("does not show Listings link", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.queryByRole("link", { name: /listings/i })).not.toBeInTheDocument();
    });

    it("does not show Tracker link", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} />);
      open();
      expect(screen.queryByRole("link", { name: /^tracker$/i })).not.toBeInTheDocument();
    });
  });

  // ─── SELLER role ──────────────────────────────────────────────────────────

  describe("SELLER role", () => {
    it("shows Listings link", () => {
      render(<MobileMenu user={sellerUser} roles={["SELLER"]} />);
      open();
      expect(screen.getByRole("link", { name: /listings/i })).toBeInTheDocument();
    });

    it("Listings href is /seller/listings", () => {
      render(<MobileMenu user={sellerUser} roles={["SELLER"]} />);
      open();
      expect(screen.getByRole("link", { name: /listings/i })).toHaveAttribute("href", "/seller/listings");
    });

    it("does not show My Bids link", () => {
      render(<MobileMenu user={sellerUser} roles={["SELLER"]} />);
      open();
      expect(screen.queryByRole("link", { name: /my bids/i })).not.toBeInTheDocument();
    });

    it("does not show Orders link", () => {
      render(<MobileMenu user={sellerUser} roles={["SELLER"]} />);
      open();
      expect(screen.queryByRole("link", { name: /^orders$/i })).not.toBeInTheDocument();
    });
  });

  // ─── ADMIN role ───────────────────────────────────────────────────────────

  describe("ADMIN role", () => {
    it("shows Tracker link pointing to /admin/tracker", () => {
      render(<MobileMenu user={adminUser} roles={["ADMIN"]} />);
      open();
      const link = screen.getByRole("link", { name: /^tracker$/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/admin/tracker");
    });

    it("shows Users link pointing to /admin/users", () => {
      render(<MobileMenu user={adminUser} roles={["ADMIN"]} />);
      open();
      const link = screen.getByRole("link", { name: /^users$/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/admin/users");
    });

    it("shows Fulfillment link pointing to /admin/fulfillment", () => {
      render(<MobileMenu user={adminUser} roles={["ADMIN"]} />);
      open();
      const link = screen.getByRole("link", { name: /^fulfillment$/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/admin/fulfillment");
    });

    it("does not show My Bids or Orders", () => {
      render(<MobileMenu user={adminUser} roles={["ADMIN"]} />);
      open();
      expect(screen.queryByRole("link", { name: /my bids/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /^orders$/i })).not.toBeInTheDocument();
    });
  });

  // ─── Active page highlight ────────────────────────────────────────────────

  describe("Active page highlight", () => {
    it("marks Browse with data-active when currentPath is /browse", () => {
      render(<MobileMenu user={null} roles={[]} currentPath="/browse" />);
      open();
      expect(screen.getByRole("link", { name: /^browse$/i })).toHaveAttribute("data-active", "true");
    });

    it("does not mark Auctions/Prints active (query-string links excluded)", () => {
      render(<MobileMenu user={null} roles={[]} currentPath="/browse" />);
      open();
      expect(screen.getByRole("link", { name: /^auctions$/i })).not.toHaveAttribute("data-active", "true");
      expect(screen.getByRole("link", { name: /^prints$/i })).not.toHaveAttribute("data-active", "true");
    });

    it("marks My Bids active when currentPath is /buyer/bids", () => {
      render(<MobileMenu user={buyerUser} roles={["BUYER"]} currentPath="/buyer/bids" />);
      open();
      expect(screen.getByRole("link", { name: /my bids/i })).toHaveAttribute("data-active", "true");
    });

    it("marks Listings active when currentPath is /seller/listings", () => {
      render(<MobileMenu user={sellerUser} roles={["SELLER"]} currentPath="/seller/listings" />);
      open();
      expect(screen.getByRole("link", { name: /listings/i })).toHaveAttribute("data-active", "true");
    });

    it("no link is active when currentPath matches nothing", () => {
      render(<MobileMenu user={null} roles={[]} currentPath="/some/other" />);
      open();
      expect(document.querySelectorAll('[data-active="true"]')).toHaveLength(0);
    });
  });

  // ─── Toggle / visibility (smoke tests preserved from US-20.1) ─────────────

  describe("Toggle and visibility", () => {
    it("menu is not in the DOM initially", () => {
      render(<MobileMenu user={null} roles={[]} />);
      expect(document.getElementById("mobile-menu")).toBeNull();
    });

    it("menu is mounted after toggle click", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      expect(document.getElementById("mobile-menu")).toBeInTheDocument();
    });

    it("menu is removed from DOM on second toggle click", () => {
      render(<MobileMenu user={null} roles={[]} />);
      const btn = screen.getByRole("button", { name: /toggle menu/i });
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(document.getElementById("mobile-menu")).toBeNull();
    });

    it("Escape closes the menu", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.getElementById("mobile-menu")).toBeNull();
    });

    it("clicking a link closes the menu", () => {
      render(<MobileMenu user={null} roles={[]} />);
      open();
      fireEvent.click(screen.getByRole("link", { name: /^browse$/i }));
      expect(document.getElementById("mobile-menu")).toBeNull();
    });
  });
});
