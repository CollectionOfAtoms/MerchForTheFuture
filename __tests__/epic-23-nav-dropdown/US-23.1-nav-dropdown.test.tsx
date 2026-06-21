// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
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

const { default: NavDropdown } = await import("@/components/NavDropdown");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const buyerUser = { name: "Alice", email: "alice@example.com" };
const sellerUser = { name: "Sam", email: "sam@example.com" };
const adminUser = { name: "Admin", email: "admin@example.com" };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("US-23.1 — Desktop Nav User Dropdown (NavDropdown)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Signed-out state ────────────────────────────────────────────────────────

  describe("Signed out", () => {
    it("renders nothing when user is null", () => {
      const { container } = render(<NavDropdown user={null} roles={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });

  // ─── Trigger button ──────────────────────────────────────────────────────────

  describe("Trigger button", () => {
    it("shows the user's name as the trigger button label", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      expect(screen.getByRole("button", { name: /alice/i })).toBeInTheDocument();
    });

    it("falls back to email when name is null", () => {
      render(<NavDropdown user={{ name: null, email: "alice@example.com" }} roles={["BUYER"]} />);
      expect(screen.getByRole("button", { name: /alice@example\.com/i })).toBeInTheDocument();
    });

    it("has aria-expanded=false initially", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      expect(screen.getByRole("button", { name: /alice/i })).toHaveAttribute("aria-expanded", "false");
    });

    it("has aria-expanded=true after click", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("button", { name: /alice/i })).toHaveAttribute("aria-expanded", "true");
    });

    it("renders a chevron-down icon inside the trigger", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      const btn = screen.getByRole("button", { name: /alice/i });
      expect(btn.querySelector("svg")).toBeInTheDocument();
    });
  });

  // ─── Dropdown visibility ─────────────────────────────────────────────────────

  describe("Dropdown visibility", () => {
    it("dropdown panel is not visible initially", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("dropdown panel appears after trigger click", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("dropdown closes on second click of trigger", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      const btn = screen.getByRole("button", { name: /alice/i });
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("dropdown closes when Escape is pressed", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("Escape returns focus to the trigger button", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      const btn = screen.getByRole("button", { name: /alice/i });
      fireEvent.click(btn);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.activeElement).toBe(btn);
    });

    it("dropdown closes on click outside", () => {
      render(
        <div>
          <NavDropdown user={buyerUser} roles={["BUYER"]} />
          <button>Outside</button>
        </div>
      );
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      fireEvent.mouseDown(screen.getByRole("button", { name: /outside/i }));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("dropdown does not close on click inside itself", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      const menu = screen.getByRole("menu");
      fireEvent.mouseDown(menu);
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });
  });

  // ─── Always-present items ────────────────────────────────────────────────────

  describe("Always-present dropdown items", () => {
    it("always shows a Dashboard link", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menuitem", { name: /dashboard/i })).toBeInTheDocument();
    });

    it("always shows a Settings link", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();
    });

    it("always shows a Sign out button", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
    });
  });

  // ─── Role-dependent items ────────────────────────────────────────────────────

  describe("Buyer role", () => {
    it("shows My Bids link", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menuitem", { name: /my bids/i })).toBeInTheDocument();
    });

    it("shows Orders link", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menuitem", { name: /orders/i })).toBeInTheDocument();
    });

    it("Dashboard link points to /dashboard/buyer", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menuitem", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard/buyer");
    });

    it("does not show Listings link", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.queryByRole("menuitem", { name: /listings/i })).not.toBeInTheDocument();
    });

    it("does not show Tracker link", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.queryByRole("menuitem", { name: /^tracker$/i })).not.toBeInTheDocument();
    });
  });

  describe("Seller role", () => {
    it("shows Listings link", () => {
      render(<NavDropdown user={sellerUser} roles={["SELLER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /sam/i }));
      expect(screen.getByRole("menuitem", { name: /listings/i })).toBeInTheDocument();
    });

    it("Dashboard link points to /dashboard/seller", () => {
      render(<NavDropdown user={sellerUser} roles={["SELLER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /sam/i }));
      expect(screen.getByRole("menuitem", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard/seller");
    });

    it("does not show My Bids or Orders", () => {
      render(<NavDropdown user={sellerUser} roles={["SELLER"]} />);
      fireEvent.click(screen.getByRole("button", { name: /sam/i }));
      expect(screen.queryByRole("menuitem", { name: /my bids/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: /orders/i })).not.toBeInTheDocument();
    });
  });

  describe("Seller fulfillment badge (US-MFTF-15.1)", () => {
    it("shows the Fulfillment menu item linking to /seller/fulfillment", () => {
      render(<NavDropdown user={sellerUser} roles={["SELLER"]} fulfillmentCount={0} />);
      fireEvent.click(screen.getByRole("button", { name: /sam/i }));
      const link = screen.getByRole("menuitem", { name: /fulfillment/i });
      expect(link).toHaveAttribute("href", "/seller/fulfillment");
    });

    it("badges the trigger AND the Fulfillment item with the count when > 0", () => {
      render(<NavDropdown user={sellerUser} roles={["SELLER"]} fulfillmentCount={3} />);
      // Trigger badge: the count is part of the trigger's accessible content.
      const trigger = screen.getByRole("button", { name: /sam/i });
      expect(within(trigger).getByText("3")).toBeInTheDocument();
      // Menu item badge + highlight.
      fireEvent.click(trigger);
      const link = screen.getByRole("menuitem", { name: /fulfillment/i });
      expect(within(link).getByText("3")).toBeInTheDocument();
      expect(link).toHaveAttribute("data-highlight", "true");
    });

    it("shows no badge when the count is 0", () => {
      render(<NavDropdown user={sellerUser} roles={["SELLER"]} fulfillmentCount={0} />);
      const trigger = screen.getByRole("button", { name: /sam/i });
      expect(within(trigger).queryByText("0")).not.toBeInTheDocument();
      fireEvent.click(trigger);
      const link = screen.getByRole("menuitem", { name: /fulfillment/i });
      expect(link).not.toHaveAttribute("data-highlight", "true");
    });

    it("does not badge non-sellers", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} fulfillmentCount={5} />);
      const trigger = screen.getByRole("button", { name: /alice/i });
      expect(within(trigger).queryByText("5")).not.toBeInTheDocument();
    });
  });

  describe("Admin role", () => {
    it("shows Tracker link", () => {
      render(<NavDropdown user={adminUser} roles={["ADMIN"]} />);
      fireEvent.click(screen.getByRole("button", { name: /admin/i }));
      expect(screen.getByRole("menuitem", { name: /^tracker$/i })).toBeInTheDocument();
    });

    it("shows Users link pointing to /admin/users", () => {
      render(<NavDropdown user={adminUser} roles={["ADMIN"]} />);
      fireEvent.click(screen.getByRole("button", { name: /admin/i }));
      const usersLink = screen.getByRole("menuitem", { name: /^users$/i });
      expect(usersLink).toBeInTheDocument();
      expect(usersLink).toHaveAttribute("href", "/admin/users");
    });

    it("shows Dropship exceptions link pointing to /admin/fulfillment", () => {
      render(<NavDropdown user={adminUser} roles={["ADMIN"]} />);
      fireEvent.click(screen.getByRole("button", { name: /admin/i }));
      const fulfillmentLink = screen.getByRole("menuitem", { name: /dropship exceptions/i });
      expect(fulfillmentLink).toBeInTheDocument();
      expect(fulfillmentLink).toHaveAttribute("href", "/admin/fulfillment");
    });

    it("Dashboard link points to /dashboard/admin", () => {
      render(<NavDropdown user={adminUser} roles={["ADMIN"]} />);
      fireEvent.click(screen.getByRole("button", { name: /admin/i }));
      expect(screen.getByRole("menuitem", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard/admin");
    });
  });

  // ─── Active page highlight ───────────────────────────────────────────────────

  describe("Active page highlight", () => {
    it("marks the current page link with data-active", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} currentPath="/buyer/bids" />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menuitem", { name: /my bids/i })).toHaveAttribute("data-active", "true");
    });

    it("does not mark non-current links as active", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} currentPath="/buyer/bids" />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(screen.getByRole("menuitem", { name: /orders/i })).not.toHaveAttribute("data-active", "true");
    });

    it("no link is active when currentPath matches nothing in the menu", () => {
      render(<NavDropdown user={buyerUser} roles={["BUYER"]} currentPath="/some/other" />);
      fireEvent.click(screen.getByRole("button", { name: /alice/i }));
      expect(document.querySelectorAll('[data-active="true"]')).toHaveLength(0);
    });
  });

  // ─── Mobile unaffected ───────────────────────────────────────────────────────

  describe("Mobile menu unaffected", () => {
    it("NavDropdown root element carries no sm:hidden or mobile-specific class", () => {
      const { container } = render(<NavDropdown user={buyerUser} roles={["BUYER"]} />);
      // The component is intended for desktop — it must NOT be wrapped in sm:hidden
      expect(container.firstChild).not.toHaveClass("sm:hidden");
    });
  });
});
