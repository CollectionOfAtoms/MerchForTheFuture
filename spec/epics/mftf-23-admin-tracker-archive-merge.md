## Epic MFTF-23: Admin Tracker Archive Merge

_Added 2026-07-11, as a direct consequence of the same-day tracker split (see `spec/README.md` and the "Structural change" revision-history entry in `project-description.md`). The admin tracker page (`/admin/tracker`, US-MFTF-19.2) was built when `spec/project-tracker.json` was the single, complete tracker. After the split, it still reads only that file — which now holds just the 33 active (Not Started/Deferred/pending-live-confirmation) stories — so the page silently regressed: it shows "33 stories total, 0 passed" and the per-epic completion bars for every historically-completed epic (1–23, most MFTF-\* epics) read 0/0 or missing entirely, instead of reflecting the 177 Passed/Dropped stories now living in `spec/project-tracker-archive.json`. This epic fixes the page to merge both files. Small, standalone, no dependency on any other open epic — sequenced ahead of MFTF-17 (Printify) per founder priority._

_**Scope note:** This is a read-side fix only. It does not change the tracker-split data model, the "move a story from active to archive on Passed" maintenance step documented in `spec/README.md`, or add any tooling to automate that step — those are out of scope here and can be a separate future story if the manual move becomes a pain point._

### US-MFTF-23.1 — Admin Tracker Page Reads Both Active and Archive Trackers

**As an** admin (founder),
**I want** the `/admin/tracker` page to show every story — active and archived — merged into one view,
**so that** the tracker page still reflects true project completion after the 2026-07-11 tracker split, instead of only showing the 33 stories still in progress.

**Acceptance Criteria:**
- [ ] The server component at `src/app/(main)/admin/tracker/page.tsx` reads **both** `spec/project-tracker.json` (active) and `spec/project-tracker-archive.json` (archive) and merges their `stories` arrays into one list before any grouping/counting happens
- [ ] The merge preserves story order in a stable, sensible way — archived (historically completed) stories and active (in-progress) stories interleave correctly within each epic's section rather than all archived stories appearing before/after all active ones regardless of original epic position. (`groupStoriesByEpic` in `src/lib/tracker/group.ts` groups by first-appearance order of the `epic` field per story in the merged array — feed it a merged array ordered so each epic's stories appear together, not two disjoint blocks per epic.)
- [ ] `commits` continues to come from the active file only (`project-tracker-archive.json` does not have a `commits` field — confirmed in the current archive schema) — no attempt to merge a nonexistent field
- [ ] The page's overall summary counts (`totalPassed`, `totalWritten`, `totalStories`) are computed from the **merged** story list, so "Overall completion" again reflects true project-wide state (expect roughly 174 passed / 210 total immediately after this ships, matching the pre-split numbers, modulo any stories that changed status in between)
- [ ] Per-epic section counts (`counts.passed`, `counts.notStarted`, `counts.deferred`, `counts.total` in `EpicSection`) are likewise computed from the merged list, so epics that are 100% historically Passed (e.g. Epic 1, Epic 3, most foundational epics) show their true `passed/total` instead of `0/0` or being absent from the page entirely
- [ ] If `project-tracker-archive.json` is ever missing or fails to parse, the page does not crash — it falls back to active-only data and surfaces a visible (not silent) warning banner at the top of the page (e.g. "Archive tracker unavailable — showing active stories only, totals will be incomplete") rather than either crashing or silently showing wrong-looking-but-plausible numbers
- [ ] No changes to `src/lib/tracker/group.ts` or `src/components/admin/TrackerSections.tsx` are required for status handling — both already handle `Passed` and `Dropped` statuses correctly (verified: `STATUS_CONFIG` in `TrackerSections.tsx` already has entries for both). If the merge surfaces any status string neither file currently handles, that is a separate bug to flag, not silently patched here
- [ ] Page load performance is not meaningfully affected — both files are read from local disk (`fs/promises`), same mechanism as today, just two reads instead of one; no new network calls or external dependencies introduced

**TDD Notes:**
- Test file: `__tests__/mftf-23-admin-tracker/US-MFTF-23.1-tracker-archive-merge.test.ts`
- Unit test: a merge helper function (e.g. `mergeTrackerStories(active, archive)` in `src/lib/tracker/group.ts` or a new small module) takes two story arrays and returns one, preserving epic-grouping order — test with a fixture where an epic has 2 active + 3 archived stories and assert `groupStoriesByEpic` on the merged output produces one section with 5 stories, not two
- Unit test: overall summary counts computed on a merged fixture (e.g. 2 active stories + 3 archived Passed stories) equal the sum across both files, not just the active file
- Unit test: missing/malformed archive file — mock `readFile` to reject for the archive path only, assert the page still renders with active-only data and the warning banner is present (component or integration test depending on how the fallback is implemented)
- Regression test: re-run the existing US-MFTF-19.2 tracker-page tests (`__tests__/mftf-19-storefront-polish/US-MFTF-19.2-tracker-*.test.*`) and confirm they still pass — this story extends that page's data loading, it does not replace its rendering/navigation behavior
- Integration test: seed the two fixture JSON files (small, hand-written fixtures — not the real 42KB/217KB files) covering active + archive + a story appearing in only one, render the page, assert the rendered per-epic `passed/total` badge text matches the merged counts

---
