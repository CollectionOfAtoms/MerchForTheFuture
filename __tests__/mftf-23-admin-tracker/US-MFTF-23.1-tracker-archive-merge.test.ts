import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  groupStoriesByEpic,
  mergeTrackerStories,
  summarizeStories,
  type TrackerStory,
} from "@/lib/tracker/group";
import { loadTrackerData } from "@/lib/tracker/load";

// US-MFTF-23.1 — after the 2026-07-11 tracker split, /admin/tracker must merge
// spec/project-tracker.json (active) with spec/project-tracker-archive.json
// (177 Passed/Dropped stories) before grouping/counting, so overall + per-epic
// completion reflect the true project-wide state, not just open work.

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

describe("mergeTrackerStories (US-MFTF-23.1)", () => {
  it("merges an epic's active + archived stories into ONE section, not two", () => {
    const active = [
      story({ id: "US-E.4", epic: "Epic E", status: "Not Started" }),
      story({ id: "US-E.5", epic: "Epic E", status: "Deferred" }),
    ];
    const archive = [
      story({ id: "US-E.1", epic: "Epic E", status: "Passed" }),
      story({ id: "US-E.2", epic: "Epic E", status: "Passed" }),
      story({ id: "US-E.3", epic: "Epic E", status: "Dropped" }),
    ];

    const sections = groupStoriesByEpic(mergeTrackerStories(active, archive));

    expect(sections).toHaveLength(1);
    expect(sections[0].epic).toBe("Epic E");
    expect(sections[0].stories).toHaveLength(5);
    expect(sections[0].counts.total).toBe(5);
    expect(sections[0].counts.passed).toBe(2);
  });

  it("keeps each epic's stories contiguous when active + archive span several epics", () => {
    const active = [
      story({ id: "US-A.2", epic: "Epic A", status: "Not Started" }),
      story({ id: "US-B.2", epic: "Epic B", status: "Not Started" }),
    ];
    const archive = [
      story({ id: "US-A.1", epic: "Epic A", status: "Passed" }),
      story({ id: "US-B.1", epic: "Epic B", status: "Passed" }),
      story({ id: "US-C.1", epic: "Epic C", status: "Passed" }),
    ];

    const sections = groupStoriesByEpic(mergeTrackerStories(active, archive));

    // Each epic collapses to exactly one section (no disjoint per-epic blocks).
    expect(sections.map((s) => s.epic)).toEqual(["Epic A", "Epic B", "Epic C"]);
    expect(sections.map((s) => s.stories.length)).toEqual([2, 2, 1]);
    // An archive-only epic still appears.
    expect(sections[2].counts.passed).toBe(1);
  });

  it("does not mutate the input arrays", () => {
    const active = [story({ id: "US-1", epic: "Epic A" })];
    const archive = [story({ id: "US-2", epic: "Epic A" })];
    mergeTrackerStories(active, archive);
    expect(active).toHaveLength(1);
    expect(archive).toHaveLength(1);
  });
});

describe("summarizeStories (US-MFTF-23.1)", () => {
  it("computes overall counts from the MERGED list, not one file", () => {
    const active = [
      story({ status: "Not Started" }),
      story({ status: "Test Written" }),
    ];
    const archive = [
      story({ status: "Passed" }),
      story({ status: "Passed" }),
      story({ status: "Complete" }),
    ];

    const merged = mergeTrackerStories(active, archive);
    const summary = summarizeStories(merged);

    expect(summary.totalStories).toBe(5);
    expect(summary.totalPassed).toBe(3); // 2 Passed + 1 Complete, all from archive
    expect(summary.totalWritten).toBe(1);
  });
});

describe("loadTrackerData (US-MFTF-23.1)", () => {
  it("merges the real active + archive spec files so totals span both", async () => {
    const active = JSON.parse(
      await readFile(path.join(process.cwd(), "spec", "project-tracker.json"), "utf-8"),
    );
    const archive = JSON.parse(
      await readFile(path.join(process.cwd(), "spec", "project-tracker-archive.json"), "utf-8"),
    );
    const expectedTotal = active.stories.length + archive.stories.length;
    const expectedPassed = [...active.stories, ...archive.stories].filter(
      (s: TrackerStory) => s.status === "Passed" || s.status === "Complete",
    ).length;

    const data = await loadTrackerData(process.cwd());

    expect(data.archiveError).toBe(false);
    expect(data.totalStories).toBe(expectedTotal);
    expect(data.totalPassed).toBe(expectedPassed);
    // Sanity: the merged view is far larger than the active-only tracker, and
    // reflects the ~174/210 pre-split completion picture.
    expect(data.totalStories).toBeGreaterThan(active.stories.length);
    expect(data.totalPassed).toBeGreaterThan(100);
    // commits come from the active file only (archive has no commits field).
    expect(Array.isArray(data.commits)).toBe(true);
  });

  it("surfaces per-epic passed/total from the merged data for a fully-historical epic", async () => {
    const data = await loadTrackerData(process.cwd());
    // Every section's passed count never exceeds its total, and at least one epic
    // is 100% historically passed (proving archived epics are counted, not 0/0).
    for (const s of data.sections) {
      expect(s.counts.passed).toBeLessThanOrEqual(s.counts.total);
    }
    expect(data.sections.some((s) => s.counts.total > 0 && s.counts.passed === s.counts.total)).toBe(true);
  });

  it("falls back to active-only + archiveError flag when the archive file is missing", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "mftf23-"));
    await mkdir(path.join(base, "spec"), { recursive: true });
    const activeFixture = {
      stories: [
        story({ id: "US-A.1", epic: "Epic A", status: "Not Started" }),
        story({ id: "US-A.2", epic: "Epic A", status: "Passed" }),
      ],
      commits: [],
    };
    await writeFile(
      path.join(base, "spec", "project-tracker.json"),
      JSON.stringify(activeFixture),
    );
    // No archive file written.

    const data = await loadTrackerData(base);

    expect(data.archiveError).toBe(true);
    expect(data.totalStories).toBe(2); // active-only, does not crash
    expect(data.sections).toHaveLength(1);
  });

  it("falls back to active-only + archiveError flag when the archive file is malformed", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "mftf23-"));
    await mkdir(path.join(base, "spec"), { recursive: true });
    await writeFile(
      path.join(base, "spec", "project-tracker.json"),
      JSON.stringify({ stories: [story({ id: "US-A.1", epic: "Epic A", status: "Passed" })], commits: [] }),
    );
    await writeFile(path.join(base, "spec", "project-tracker-archive.json"), "{ not valid json ");

    const data = await loadTrackerData(base);

    expect(data.archiveError).toBe(true);
    expect(data.totalStories).toBe(1);
  });
});
