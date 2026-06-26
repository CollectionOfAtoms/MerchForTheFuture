// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ThemeToggle from "@/components/ThemeToggle";
import { THEME_COOKIE } from "@/lib/theme/theme";

beforeEach(() => {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-theme");
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
});
afterEach(cleanup);

describe("ThemeToggle (US-MFTF-19.4)", () => {
  it("exposes an accessible switch with a label and pressed/checked state", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /dark mode/i });
    expect(toggle.getAttribute("aria-checked")).toBe("false"); // light default
  });

  it("flips the root attribute and writes the cookie on toggle", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /dark mode/i });
    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("toggles back to light", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /dark mode/i });
    fireEvent.click(toggle); // → dark
    fireEvent.click(toggle); // → light
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.cookie).toContain(`${THEME_COOKIE}=light`);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("is keyboard-operable (rendered as a real button element)", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: /dark mode/i });
    expect(toggle.tagName).toBe("BUTTON");
  });
});
