// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import TrackerSections from "@/components/admin/TrackerSections";
import { groupStoriesByEpic, type TrackerStory } from "@/lib/tracker/group";

afterEach(cleanup);

function story(over: Partial<TrackerStory>): TrackerStory {
  return {
    id: "US-X", epic: "Epic A", title: "A story", status: "Not Started",
    testWrittenDate: null, testWrittenCommit: null, testPassedDate: null,
    testPassedCommit: null, notes: "", ...over,
  };
}

const sections = groupStoriesByEpic([
  story({ id: "US-19.1", epic: "Epic MFTF-19: Storefront Polish", status: "Passed", testPassedDate: "2026-06-25", testPassedCommit: "pending" }),
  story({ id: "US-19.2", epic: "Epic MFTF-19: Storefront Polish", status: "Not Started" }),
  // Epic 5 has a distinct count (2 passed) so "1 passed" uniquely identifies the
  // MFTF-19 section header below.
  story({ id: "US-5.1", epic: "Epic 5: Tax", status: "Passed", testPassedDate: "2026-06-22", testPassedCommit: "pending" }),
  story({ id: "US-5.2", epic: "Epic 5: Tax", status: "Passed", testPassedDate: "2026-06-22", testPassedCommit: "pending" }),
]);

describe("TrackerSections (US-MFTF-19.2)", () => {
  it("renders keyboard-operable section nav with one link per epic", () => {
    render(<TrackerSections sections={sections} />);
    const nav = screen.getByRole("navigation", { name: /sections/i });
    expect(within(nav).getByRole("link", { name: /Storefront Polish/ })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: /Epic 5: Tax/ })).toBeTruthy();
  });

  it("shows per-epic status counts at the section level", () => {
    render(<TrackerSections sections={sections} />);
    // The MFTF-19 section has 1 passed / 1 not started.
    expect(screen.getByText(/1 passed/i)).toBeTruthy();
  });

  it("collapses a section and exposes expanded/collapsed state", () => {
    render(<TrackerSections sections={sections} />);
    const toggle = screen.getAllByRole("button", { name: /Storefront Polish/ })[0];
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Row is visible while expanded.
    expect(screen.getByText("US-19.1")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("US-19.1")).toBeNull();
  });

  it("surfaces each story's passed-date (even with a pending commit) and an empty state when null", () => {
    render(<TrackerSections sections={sections} />);
    expect(screen.getByText(/2026-06-25/)).toBeTruthy(); // pending-commit story still shows its date
    // The Not Started row (US-19.2) shows an empty-state marker rather than a date.
    const row = screen.getByText("US-19.2").closest("[data-story-row]") as HTMLElement;
    expect(within(row).getByText(/not passed|—/i)).toBeTruthy();
  });
});
