// Server-only loader for the admin project-tracker page (US-MFTF-23.1).
//
// After the 2026-07-11 tracker split, the tracker lives in two files:
//   spec/project-tracker.json         — active (Not Started/Deferred/pending)
//   spec/project-tracker-archive.json — archive (Passed/Dropped)
// This reads BOTH and merges their `stories` arrays before any grouping/counting,
// so /admin/tracker again reflects true project-wide completion. The archive read
// is best-effort: if the file is missing or unparseable the page falls back to
// active-only data and surfaces a visible warning (archiveError), never crashing.
//
// Uses fs/promises (server only) — do not import into a "use client" component.

import { readFile } from "fs/promises";
import path from "path";
import {
  groupStoriesByEpic,
  mergeTrackerStories,
  summarizeStories,
  type EpicSection,
  type TrackerStory,
} from "@/lib/tracker/group";

export interface Commit {
  hash: string;
  date: string;
  author: string;
  storiesAffected: string[];
  message: string;
  trackerUpdated: boolean;
}

interface TrackerFile {
  stories: TrackerStory[];
  commits?: Commit[];
}

export interface LoadedTracker {
  sections: EpicSection[];
  totalPassed: number;
  totalWritten: number;
  totalStories: number;
  /** From the active file only — the archive has no `commits` field. */
  commits: Commit[];
  /** True when the archive file was missing/unparseable and we fell back. */
  archiveError: boolean;
}

/**
 * Read + merge the active and archive trackers under `baseDir/spec`. `baseDir`
 * defaults to the process CWD (the repo root in production); tests pass a temp
 * dir. The active file is required; the archive is optional (best-effort).
 */
export async function loadTrackerData(baseDir: string = process.cwd()): Promise<LoadedTracker> {
  const activeRaw = await readFile(path.join(baseDir, "spec", "project-tracker.json"), "utf-8");
  const active: TrackerFile = JSON.parse(activeRaw);

  let archiveStories: TrackerStory[] = [];
  let archiveError = false;
  try {
    const archiveRaw = await readFile(
      path.join(baseDir, "spec", "project-tracker-archive.json"),
      "utf-8",
    );
    const archive: TrackerFile = JSON.parse(archiveRaw);
    archiveStories = archive.stories ?? [];
  } catch {
    // Missing or malformed archive — fall back to active-only, flag for banner.
    archiveError = true;
  }

  const merged = mergeTrackerStories(active.stories, archiveStories);
  const { totalPassed, totalWritten, totalStories } = summarizeStories(merged);

  return {
    sections: groupStoriesByEpic(merged),
    totalPassed,
    totalWritten,
    totalStories,
    commits: active.commits ?? [],
    archiveError,
  };
}
