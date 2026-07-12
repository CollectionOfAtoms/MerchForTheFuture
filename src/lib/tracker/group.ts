// Pure, Prisma-free transforms for the admin project-tracker page (US-MFTF-19.2).
// Kept dependency-free so the client TrackerSections component can import it
// without dragging server-only code into the browser bundle.

export interface TrackerStory {
  id: string;
  epic: string;
  title: string;
  status: string;
  testWrittenDate: string | null;
  testWrittenCommit: string | null;
  testPassedDate: string | null;
  testPassedCommit: string | null;
  notes: string | null;
}

export interface EpicCounts {
  passed: number;
  notStarted: number;
  deferred: number;
  total: number;
}

export interface EpicSection {
  epic: string;
  /** Stable slug used for the section id + nav anchor. */
  anchor: string;
  stories: TrackerStory[];
  counts: EpicCounts;
}

/** Slugify an epic name into a stable, URL-safe anchor for in-page nav. */
export function epicAnchor(epic: string): string {
  return (
    "epic-" +
    epic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

function countStatus(stories: TrackerStory[]): EpicCounts {
  let passed = 0;
  let notStarted = 0;
  let deferred = 0;
  for (const s of stories) {
    if (s.status === "Passed" || s.status === "Complete") passed += 1;
    else if (s.status === "Not Started") notStarted += 1;
    else if (s.status === "Deferred") deferred += 1;
  }
  return { passed, notStarted, deferred, total: stories.length };
}

export interface TrackerSummary {
  totalPassed: number;
  totalWritten: number;
  totalStories: number;
}

/**
 * Overall completion counts across a story list. Computed on the MERGED
 * active+archive list (US-MFTF-23.1) so "Overall completion" reflects true
 * project-wide state, not just the open stories in the active tracker.
 */
export function summarizeStories(stories: TrackerStory[]): TrackerSummary {
  let totalPassed = 0;
  let totalWritten = 0;
  for (const s of stories) {
    if (s.status === "Passed" || s.status === "Complete") totalPassed += 1;
    else if (s.status === "Test Written") totalWritten += 1;
  }
  return { totalPassed, totalWritten, totalStories: stories.length };
}

/**
 * Merge the active tracker's stories with the archive's into one list (US-MFTF-23.1).
 *
 * After the 2026-07-11 tracker split, active (Not Started/Deferred/pending) and
 * archived (Passed/Dropped) stories for the same epic live in two files. This
 * concatenates them into a single array **grouped by epic** so that
 * `groupStoriesByEpic` produces one section per epic (not two disjoint blocks):
 * epics keep their first-appearance order across the combined stream, and each
 * epic's stories are emitted contiguously (its active stories, then its archived
 * ones). Inputs are not mutated.
 */
export function mergeTrackerStories(
  active: TrackerStory[],
  archive: TrackerStory[],
): TrackerStory[] {
  const order: string[] = [];
  const byEpic = new Map<string, TrackerStory[]>();
  for (const s of [...active, ...archive]) {
    const bucket = byEpic.get(s.epic);
    if (bucket) {
      bucket.push(s);
    } else {
      byEpic.set(s.epic, [s]);
      order.push(s.epic);
    }
  }
  return order.flatMap((epic) => byEpic.get(epic)!);
}

/**
 * Group stories into per-epic sections in first-appearance order. Epics are
 * derived entirely from the data — there is no hardcoded epic list, so new epics
 * (designed, referenced, original, BUG, CHORE) appear automatically. Each section
 * carries status counts and its stories (with their testPassedDate intact — the
 * date is surfaced even where testPassedCommit is the "pending" placeholder).
 */
export function groupStoriesByEpic(stories: TrackerStory[]): EpicSection[] {
  const order: string[] = [];
  const byEpic = new Map<string, TrackerStory[]>();
  for (const s of stories) {
    const bucket = byEpic.get(s.epic);
    if (bucket) {
      bucket.push(s);
    } else {
      byEpic.set(s.epic, [s]);
      order.push(s.epic);
    }
  }
  return order.map((epic) => {
    const epicStories = byEpic.get(epic)!;
    return { epic, anchor: epicAnchor(epic), stories: epicStories, counts: countStatus(epicStories) };
  });
}
