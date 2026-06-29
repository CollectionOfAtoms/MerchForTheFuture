import { describe, it, expect } from "vitest";
import { groupStoriesByEpic, epicAnchor, type TrackerStory } from "@/lib/tracker/group";

// US-MFTF-19.2 — the admin tracker page groups stories into per-epic sections
// with status counts and per-story passed-dates. The transform is a pure function
// over the tracker JSON; epics are derived from the data (no hardcoded list) in
// first-appearance order.

function story(over: Partial<TrackerStory>): TrackerStory {
  return {
    id: "US-X",
    epic: "Epic A",
    title: "A story",
    status: "Not Started",
    testWrittenDate: null,
    testWrittenCommit: null,
    testPassedDate: null,
    testPassedCommit: null,
    notes: "",
    ...over,
  };
}

describe("groupStoriesByEpic", () => {
  it("groups stories by epic in first-appearance order (no hardcoded list)", () => {
    const sections = groupStoriesByEpic([
      story({ id: "US-1", epic: "Epic Z" }),
      story({ id: "US-2", epic: "Epic A" }),
      story({ id: "US-3", epic: "Epic Z" }),
      story({ id: "BUG-1", epic: "Bugs" }),
    ]);
    expect(sections.map((s) => s.epic)).toEqual(["Epic Z", "Epic A", "Bugs"]);
    expect(sections[0].stories.map((s) => s.id)).toEqual(["US-1", "US-3"]);
  });

  it("counts Passed / Not Started / Deferred per epic", () => {
    const [section] = groupStoriesByEpic([
      story({ epic: "E", status: "Passed" }),
      story({ epic: "E", status: "Passed" }),
      story({ epic: "E", status: "Not Started" }),
      story({ epic: "E", status: "Deferred" }),
      story({ epic: "E", status: "Complete" }),
    ]);
    expect(section.counts).toMatchObject({ passed: 3, notStarted: 1, deferred: 1, total: 5 });
  });

  it("carries each story's testPassedDate through, including the pending-commit case", () => {
    const [section] = groupStoriesByEpic([
      story({ id: "US-5.1", epic: "Epic 5", status: "Passed", testPassedDate: "2026-06-22", testPassedCommit: "pending" }),
      story({ id: "US-5.2", epic: "Epic 5", status: "Not Started", testPassedDate: null }),
    ]);
    expect(section.stories[0].testPassedDate).toBe("2026-06-22");
    // Date is surfaced even though the commit is the "pending" placeholder.
    expect(section.stories[0].testPassedCommit).toBe("pending");
    expect(section.stories[1].testPassedDate).toBeNull();
  });

  it("produces a stable, unique anchor slug per epic for section nav", () => {
    const sections = groupStoriesByEpic([
      story({ epic: "Epic MFTF-19: Storefront Polish & Pricing Visibility" }),
      story({ epic: "Epic 5: Tax" }),
    ]);
    expect(sections[0].anchor).toBe(epicAnchor("Epic MFTF-19: Storefront Polish & Pricing Visibility"));
    expect(sections[0].anchor).toMatch(/^[a-z0-9-]+$/);
    expect(sections[0].anchor).not.toBe(sections[1].anchor);
  });
});
