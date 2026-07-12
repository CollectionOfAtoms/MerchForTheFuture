import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// The admin tracker page at /admin/tracker reads spec/project-tracker.json
// (active) AND spec/project-tracker-archive.json (Passed/Dropped) and renders
// per-epic progress bars + story status badges over the MERGED set (US-MFTF-23.1).
// These tests verify the merged data source is well-formed and contains the
// expected structure. Post the 2026-07-11 split, historically-Passed epics (e.g.
// Epic 9) live in the archive file, so we read both — matching what the page does.

type Story = {
  id: string;
  epic: string;
  title: string;
  status: string;
  testWrittenDate: string | null;
  testWrittenCommit: string | null;
  testPassedDate: string | null;
  testPassedCommit: string | null;
  notes: string;
};

function readStories(file: string): Story[] {
  return (JSON.parse(readFileSync(join(process.cwd(), file), "utf-8")) as { stories: Story[] }).stories;
}

const tracker = {
  stories: [...readStories("spec/project-tracker.json"), ...readStories("spec/project-tracker-archive.json")],
};

const VALID_STATUSES = new Set(["Not Started", "Test Written", "In Progress", "Passed", "Complete", "Deferred", "Dropped", "Blocked", "Tests Passing — pending live confirmation"]);

describe("US-9.6 — Admin Project Tracker", () => {
  it("tracker JSON has a stories array", () => {
    expect(Array.isArray(tracker.stories)).toBe(true);
    expect(tracker.stories.length).toBeGreaterThan(0);
  });

  it("every story has required fields: id, epic, title, status", () => {
    for (const story of tracker.stories) {
      expect(story.id, `${story.id} missing id`).toBeTruthy();
      expect(story.epic, `${story.id} missing epic`).toBeTruthy();
      expect(story.title, `${story.id} missing title`).toBeTruthy();
      expect(story.status, `${story.id} missing status`).toBeTruthy();
    }
  });

  it("every story status is one of the recognised values", () => {
    for (const story of tracker.stories) {
      expect(VALID_STATUSES.has(story.status), `${story.id} has unknown status: "${story.story}"`).toBe(true);
    }
  });

  it("all Epic 9 stories are present", () => {
    const epic9Ids = ["US-9.1", "US-9.2", "US-9.3", "US-9.4", "US-9.5", "US-9.6"];
    const trackerIds = new Set(tracker.stories.map((s) => s.id));
    for (const id of epic9Ids) {
      expect(trackerIds.has(id), `Missing ${id} from tracker`).toBe(true);
    }
  });

  it("all Epic 9 stories are marked Passed", () => {
    const epic9 = tracker.stories.filter((s) => s.id.startsWith("US-9."));
    for (const story of epic9) {
      expect(story.status, `${story.id} should be Passed`).toBe("Passed");
    }
  });

  it("stories grouped by epic are in the correct epic bucket", () => {
    const epic9 = tracker.stories.filter((s) => s.id.startsWith("US-9."));
    for (const story of epic9) {
      expect(story.epic).toContain("Epic 9");
    }
  });

  it("tracker contains entries from multiple epics", () => {
    const epics = new Set(tracker.stories.map((s) => s.epic));
    expect(epics.size).toBeGreaterThanOrEqual(5);
  });

  it("Epic 9 Passed stories have a testPassedDate", () => {
    // Older epics (pre-tracker discipline) may legitimately lack dates.
    // We enforce the rule strictly for Epic 9 onwards.
    const epic9Passed = tracker.stories.filter((s) => s.id.startsWith("US-9.") && s.status === "Passed");
    expect(epic9Passed.length).toBeGreaterThan(0);
    for (const story of epic9Passed) {
      expect(story.testPassedDate, `${story.id} Passed but no testPassedDate`).toBeTruthy();
    }
  });
});
