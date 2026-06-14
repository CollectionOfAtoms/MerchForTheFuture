"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

interface MobileMenuProps {
  user: { name?: string | null; email?: string | null } | null;
  roles: string[];
  /** Override the current pathname — used in tests where the Next.js router context is unavailable. */
  currentPath?: string;
}

const sharedLinks = [
  { href: "/shop", label: "Shop" },
  { href: "/browse", label: "Browse" },
  { href: "/browse?type=auction", label: "Auctions" },
  { href: "/browse?type=print", label: "Prints" },
];

export default function MobileMenu({ user, roles, currentPath }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  // showLinks lags behind isOpen by ~420ms so links only animate in
  // after the splash overlay has finished expanding.
  const [showLinks, setShowLinks] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const linksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (linksTimerRef.current) clearTimeout(linksTimerRef.current);
    setShowLinks(false);
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      setIsOpen(true);
      if (linksTimerRef.current) clearTimeout(linksTimerRef.current);
      // Overlay expand takes ~420ms; start link animations just after.
      linksTimerRef.current = setTimeout(() => setShowLinks(true), 420);
    }
  }, [isOpen, close]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { if (linksTimerRef.current) clearTimeout(linksTimerRef.current); };
  }, []);

  // Escape key + tab trap
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        toggleRef.current?.focus();
        return;
      }
      if (e.key === "Tab") {
        const focusables = Array.from(
          menuRef.current?.querySelectorAll<HTMLElement>("a, button") ?? []
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          toggleRef.current?.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first?.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  // Scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // currentPath prop overrides the hook — used only in tests where Next.js router context is absent.
  const hookPathname = usePathname();
  const pathname = currentPath ?? hookPathname;

  // Only highlight links that have no query string and whose path matches exactly.
  function isActivePath(href: string): boolean {
    if (href.includes("?")) return false;
    return pathname === href;
  }

  const isAdmin  = roles.includes("ADMIN");
  const isSeller = roles.includes("SELLER");
  const isBuyer  = roles.includes("BUYER");

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

  // ─── Item builders ───────────────────────────────────────────────────────

  function navLink(href: string, label: string) {
    return {
      key: href,
      node: (
        <Link
          href={href}
          onClick={close}
          data-active={isActivePath(href) ? "true" : undefined}
          className="block px-6 py-3 text-lg font-medium uppercase tracking-widest text-white hover:text-tuscan-sun focus-visible:text-tuscan-sun focus-visible:outline-none transition-colors"
        >
          {label}
        </Link>
      ),
    };
  }

  // ─── Build item list ─────────────────────────────────────────────────────

  // 1. Always: Browse, Auctions, Prints
  const topItems = sharedLinks.map((l) => navLink(l.href, l.label));

  // 2. If signed in: separator + name, then role links + sign out
  //    If signed out: sign in + sign up
  const authItems: { key: string; node: React.ReactNode }[] = user
    ? [
        {
          key: "__separator__",
          node: (
            <div className="flex flex-col items-center gap-2 py-2" style={{ width: "75vw" }}>
              <p className="text-sm text-tuscan-sun/70 truncate max-w-full">
                {user.name ?? user.email}
              </p>
              <hr className="w-full border-cerulean/40" />
            </div>
          ),
        },
        navLink(dashboardHref, "Dashboard"),
        ...(isBuyer  ? [navLink("/buyer/bids",         "My Bids"),    navLink("/buyer/orders",      "Orders")]      : []),
        ...(isSeller ? [navLink("/seller/listings",     "Listings")]                                                 : []),
        ...(isAdmin  ? [
          navLink("/admin/products",   "Products"),
          navLink("/admin/tracker",    "Tracker"),
          navLink("/admin/users",      "Users"),
          navLink("/admin/fulfillment","Fulfillment"),
        ] : []),
        navLink(settingsHref, "Settings"),
        {
          key: "__signout__",
          node: (
            <form action={signOutAction}>
              <button
                type="submit"
                className="px-6 py-3 text-lg font-medium uppercase tracking-widest text-tuscan-sun/70 hover:text-white focus-visible:text-white focus-visible:outline-none transition-colors"
              >
                Sign Out
              </button>
            </form>
          ),
        },
      ]
    : [
        {
          key: "__signin__",
          node: (
            <Link
              href="/sign-in"
              onClick={close}
              data-active={isActivePath("/sign-in") ? "true" : undefined}
              className="block px-6 py-3 text-lg font-medium uppercase tracking-widest text-white hover:text-tuscan-sun focus-visible:text-tuscan-sun focus-visible:outline-none transition-colors"
            >
              Sign In
            </Link>
          ),
        },
        {
          key: "__signup__",
          node: (
            <Link
              href="/sign-up"
              onClick={close}
              data-active={isActivePath("/sign-up") ? "true" : undefined}
              className="block px-6 py-3 text-lg font-medium uppercase tracking-widest text-tuscan-sun/70 hover:text-white focus-visible:text-white focus-visible:outline-none transition-colors"
            >
              Sign Up
            </Link>
          ),
        },
      ];

  const allItems = [...topItems, ...authItems];

  return (
    <div className="sm:hidden">
      {/*
        Keyframe for link slide-in. Using a namespaced name (mb-slide-in)
        to avoid collisions. The `both` fill-mode keeps items at opacity 0
        during the delay period and locked at opacity 1 after completion.
      */}
      <style>{`
        @keyframes mb-slide-in {
          from { opacity: 0; transform: translateY(-18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* Current-page indicator: underline */
        #mobile-menu [data-active="true"] {
          text-decoration: underline;
          text-decoration-color: rgba(255,255,255,0.55);
          text-underline-offset: 5px;
        }
      `}</style>

      {/* Splash overlay — always in the DOM (inside sm:hidden so it can't
          interfere with desktop layouts). isOpen drives the CSS transition
          directly; no conditional mounting needed. */}
      {/*
        Splash origin is pinned to the button's center:
          top  = header py-4 (1rem) + half button height (22px)
          right = header px-6 (1.5rem) + half button width (22px)
      */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: "calc(1rem + 22px)",
          right: "calc(1.5rem + 22px)",
          width: 1,
          height: 1,
          zIndex: 40,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            borderRadius: "50%",
            backgroundColor: "#277da1", // cerulean
            width: "284vmax",
            height: "284vmax",
            top: "-142vmax",
            left: "-142vmax",
            transform: isOpen ? "scale(1)" : "scale(0)",
            transformOrigin: "50% 50%",
            transition: isOpen
              ? "transform .42s cubic-bezier(0.755, 0.050, 0.855, 0.060)"
              : "transform .42s cubic-bezier(0.145, 0.885, 0.355, 1.000)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Menu items — unmounted when closed */}
      {isOpen && (
        <ul
          ref={menuRef}
          id="mobile-menu"
          aria-label="Mobile navigation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "safe center",
            gap: "0.25rem",
            listStyle: "none",
            margin: 0,
            /* top padding clears the fixed close button; bottom gives breathing room */
            paddingTop: "5rem",
            paddingBottom: "2rem",
            overflowY: "auto",
          }}
        >
          {allItems.map(({ key, node }, i) => (
            <li
              key={key}
              style={
                showLinks
                  ? {
                      animation: `mb-slide-in 0.32s cubic-bezier(0.000, 0.995, 0.990, 1.000) ${i * 0.055}s both`,
                    }
                  : { opacity: 0 }
              }
            >
              {node}
            </li>
          ))}
        </ul>
      )}

      {/*
        The toggle button is position:fixed so it never shifts when the
        scroll lock or any viewport change alters the page layout.
        top/right mirror the header's py-4 (1rem) / px-6 (1.5rem) so
        the button sits in the same visual spot it would occupy in flow.
        A 44×44 px spacer div remains in-flow to preserve the header height.
      */}
      <div aria-hidden="true" style={{ width: 44, height: 44, flexShrink: 0 }} />
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        aria-label="Toggle menu"
        onClick={handleToggle}
        className="rounded-full p-2 transition-colors hover:bg-tuscan-sun/20"
        style={{
          position: "fixed",
          top: "1rem",
          right: "1.5rem",
          zIndex: 50,
          backgroundColor: isOpen ? "white" : undefined,
        }}
      >
        {/*
          SVG viewBox is 0 0 50 50, center at (25, 25).
          All three bars are defined at y=25 so their natural position
          is the center. In hamburger state they are displaced ±8px via
          translateY. In X state they rotate ±45° around transformOrigin
          "25px 25px" — the pixel-coordinate center of the viewBox.
          Percentage-based transform-origin on SVG <line> elements is
          unreliable (it resolves relative to the zero-height bounding box
          of the line, not the SVG viewport), so we use explicit pixels.
        */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 50 50"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <g fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
            {/* Top bar → becomes the \ of the X */}
            <line
              x1="13" y1="25" x2="37" y2="25"
              style={{
                transformOrigin: "25px 25px",
                transform: isOpen ? "rotate(45deg)" : "translateY(-8px)",
                transition: "transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
            {/* Middle bar → fades out */}
            <line
              x1="13" y1="25" x2="37" y2="25"
              style={{
                opacity: isOpen ? 0 : 1,
                transition: "opacity 0.2s ease 0.05s",
              }}
            />
            {/* Bottom bar → becomes the / of the X */}
            <line
              x1="13" y1="25" x2="37" y2="25"
              style={{
                transformOrigin: "25px 25px",
                transform: isOpen ? "rotate(-45deg)" : "translateY(8px)",
                transition: "transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            />
            {/* Circle that draws itself on open */}
            <circle
              r="23" cx="25" cy="25"
              style={{
                strokeDasharray: "144.513",
                strokeDashoffset: isOpen ? "0" : "144.513",
                transition: "stroke-dashoffset 0.35s linear 0.08s",
              }}
            />
          </g>
        </svg>
      </button>
    </div>
  );
}
