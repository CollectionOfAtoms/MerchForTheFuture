"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

interface NavDropdownProps {
  user: { name?: string | null; email?: string | null } | null;
  roles: string[];
  /** Override current pathname — used in tests where Next.js router context is unavailable. */
  currentPath?: string;
}

export default function NavDropdown({ user, roles, currentPath }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Escape key — close and return focus to trigger
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  const hookPathname = usePathname();
  const pathname = currentPath ?? hookPathname;

  if (!user) return null;

  const isAdmin = roles.includes("ADMIN");
  const isSeller = roles.includes("SELLER");
  const isBuyer = roles.includes("BUYER");

  const dashboardHref = isAdmin
    ? "/dashboard/admin"
    : isSeller
    ? "/dashboard/seller"
    : "/dashboard/buyer";

  const settingsHref = isAdmin
    ? "/admin/settings"
    : isSeller
    ? "/seller/settings"
    : "/buyer/settings";

  const label = user.name ?? user.email ?? "Account";

  function isActive(href: string) {
    return pathname === href;
  }

  return (
    <div className="relative hidden sm:block z-50">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-blue-slate hover:text-cerulean transition-colors max-w-[160px]"
      >
        <span className="truncate">{label}</span>
        {/* Chevron-down — pointer-events:none prevents the SVG's transform
            compositor layer from intercepting clicks in Firefox/Waterfox. */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            pointerEvents: "none",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-tuscan-sun/30 bg-white py-1 shadow-lg max-h-[min(28rem,80vh)] overflow-y-auto"
        >
          <MenuItem href={dashboardHref} active={isActive(dashboardHref)}>
            Dashboard
          </MenuItem>

          {isBuyer && (
            <MenuItem href="/buyer/bids" active={isActive("/buyer/bids")}>
              My Bids
            </MenuItem>
          )}

          {isBuyer && (
            <MenuItem href="/buyer/orders" active={isActive("/buyer/orders")}>
              Orders
            </MenuItem>
          )}

          {isSeller && (
            <MenuItem href="/seller/listings" active={isActive("/seller/listings")}>
              Listings
            </MenuItem>
          )}

          {isAdmin && (
            <MenuItem href="/admin/products" active={isActive("/admin/products")}>
              Products
            </MenuItem>
          )}

          {isAdmin && (
            <MenuItem href="/admin/tracker" active={isActive("/admin/tracker")}>
              Tracker
            </MenuItem>
          )}

          {isAdmin && (
            <MenuItem href="/admin/users" active={isActive("/admin/users")}>
              Users
            </MenuItem>
          )}

          {isAdmin && (
            <MenuItem href="/admin/fulfillment" active={isActive("/admin/fulfillment")}>
              Fulfillment
            </MenuItem>
          )}

          <MenuItem href={settingsHref} active={isActive(settingsHref)}>
            Settings
          </MenuItem>

          <div className="my-1 border-t border-tuscan-sun/20" role="separator" />

          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="w-full px-4 py-2 text-left text-sm text-blue-slate hover:bg-tuscan-sun/5 hover:text-cerulean transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      data-active={active ? "true" : undefined}
      className="block px-4 py-2 text-sm text-blue-slate hover:bg-tuscan-sun/5 hover:text-cerulean transition-colors font-medium data-[active=true]:text-cerulean data-[active=true]:underline data-[active=true]:underline-offset-2"
    >
      {children}
    </Link>
  );
}
