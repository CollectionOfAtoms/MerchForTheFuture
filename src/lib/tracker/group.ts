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
