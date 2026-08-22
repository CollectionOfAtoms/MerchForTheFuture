"use client";

import { useEffect, useState } from "react";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "@/lib/theme/theme";

/**
 * Dark-mode toggle (US-MFTF-19.4). On click it writes the manual choice to a
 * client-readable cookie (so SSR can read it next time for a no-flash paint) and
 * flips the root attribute immediately. Works for guests — no account or DB.
 *
 * Two presentations:
 * - `variant="switch"` (default) — a labeled switch row for use inside a menu
 *   (dropdown, mobile menu). `className` lets each host set its own row styling.
 * - `variant="icon"` — a bare sun/moon icon button for the top bar itself.
 *
 * The initial state prefers `initialTheme` (the server's cookie read, so returning
 * visitors get the right icon with no flash) and is then reconciled once on mount
 * against whatever the no-flash init script set on <html> — this fills in the
 * first-visit OS-preference case the server can't see, and avoids a hydration
 * mismatch.
 */
export default function ThemeToggle({
  className = "",
  variant = "switch",
  initialTheme = "light",
}: {
  className?: string;
  variant?: "switch" | "icon";
  initialTheme?: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains("dark") || root.getAttribute("data-theme") === "dark";
    setTheme(isDark ? "dark" : "light");
  }, []);

  function apply(next: Theme) {
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    root.setAttribute("data-theme", next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
    setTheme(next);
  }

  const isDark = theme === "dark";

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => apply(isDark ? "light" : "dark")}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-blue-slate transition-colors hover:text-cerulean dark:text-cream dark:hover:text-cream/80 ${className}`}
      >
        {isDark ? (
          // Sun — click to switch to light.
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          // Moon — click to switch to dark.
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      onClick={() => apply(isDark ? "light" : "dark")}
      className={`flex items-center justify-between gap-3 ${className}`}
    >
      <span>Dark mode</span>
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isDark ? "bg-cerulean" : "bg-stone-400/50"}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${isDark ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}
