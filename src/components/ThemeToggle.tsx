"use client";

import { useEffect, useState } from "react";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "@/lib/theme/theme";

/**
 * Dark-mode toggle, rendered as a labeled switch for use inside a menu
 * (US-MFTF-19.4). On click it writes the manual choice to a client-readable cookie
 * (so SSR can read it next time for a no-flash paint) and flips the root attribute
 * immediately. Works for guests — no account or DB. The initial state mirrors
 * whatever the no-flash init script set on <html>, read once on mount to avoid a
 * hydration mismatch. `className` lets each host (dropdown, mobile menu) set its
 * own row styling/text colour.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

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
