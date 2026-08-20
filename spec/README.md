# spec/ — Protocol

This file exists because the spec and tracker were restructured on **2026-07-11** and no longer
match the layout the generic `tdd-handoff`/`tdd-spec-session` skills assume by default. Read this
before touching anything in `spec/` — especially if you're a fresh Claude Code or Cowork session
picking up this project for the first time.

If any instruction here conflicts with what a skill's own documentation says to do, **this file
wins** for this project. The skills are written for a generic single-file spec + single-file
tracker project; this project outgrew that shape.

**If you are running as the `tdd-spec-session` or `tdd-handoff` skill on this repo:** stop before
following your own kickoff instructions (e.g. "upload your three source-of-truth files," "read
the spec file," "read all three completely"). Those instructions assume a single spec file and a
single complete tracker file, which is no longer true here. Read this file's
["If this protocol conflicts with a skill's built-in instructions"](#if-this-protocol-conflicts-with-a-skills-built-in-instructions)
section and substitute its file list for whatever your own kickoff step asks the user to provide
or asks you to read. This applies whether you were invoked directly (`/tdd-spec-session`,
`/tdd-handoff`) or via a general request that triggered the skill.

---

## The files in this directory

| File | What it is | When to read it |
|---|---|---|
| `project-description.md` | Living doc: vision, users/roles, tech rationale, design principles, open questions, revision history | Read in full at the start of any spec session. Coding sessions should skim the Design Principles and any section relevant to the epic being worked. |
| `user-stories-art-marketplace.md` | **Index only** — project summary + a table of every epic with its status and a link into `epics/` | Read in full — it's short (~8KB) — to see what epics exist and find the one you need. **Do not expect story detail here; it was moved out.** |
| `epics/*.md` | One file per epic, full acceptance criteria and TDD notes | **Read only the epic file(s) relevant to current work.** This is the protocol change — see below. |
| `project-tracker.json` | Active tracker: `Not Started`, `Deferred`, and `Tests Passing — pending live confirmation` stories only, plus `epicOrder`, `commits`, `statusLegend` | Read for current project state. This is the file coding/handoff sessions should treat as the tracker. |
| `project-tracker-archive.json` | Archive: `Passed` and `Dropped` stories | Read only when auditing history, investigating a regression in a previously-Passed story, or backfilling a commit hash. **Not needed for day-to-day implementation work.** |

---

## Why this split happened

Before 2026-07-11, `user-stories-art-marketplace.md` was 254KB / 3359 lines containing all 45
epics inline, and `project-tracker.json` was 257KB / 2932 lines containing all 210 stories
(174 of them already `Passed`). Together the three spec files were ~140K tokens — a large
fraction of a coding session's context budget before any actual work happened, and the tracker
in particular had no natural ceiling: every implementation session adds `Passed` rows and
nothing ever shrinks it.

The fix was two independent splits:

1. **Tracker: active vs. archive.** `Passed`/`Dropped` stories (177 of 210 as of the split) moved
   to `project-tracker-archive.json`. `project-tracker.json` kept its name so tooling and skills
   that expect that filename still find *a* tracker — it's just scoped to the stories that are
   actually still open (33 at the time of the split; new stories get added here going forward,
   see `summary.totalActive` in the file itself for the current count), plus the small
   always-relevant `epicOrder`/`commits`/`statusLegend` blocks. This cut the active tracker from
   257KB to ~42KB.

2. **Spec: one file per epic.** `user-stories-art-marketplace.md` was split into `epics/*.md`,
   one file per epic, named by epic ID (e.g. `epics/mftf-17-printify-integration.md`). The
   original file became a thin index (epic list + status + link). No content was lost or edited
   in the split — every story ID and every acceptance-criteria checkbox from the original file
   exists in exactly one epic file. Per-epic files now range from ~1KB to ~18KB instead of one
   254KB file.

Both splits were **mechanical** (verified programmatically: story-ID sets and checkbox counts
compared before/after, zero diffs) — no content was rewritten, only relocated.

---

## Protocol: what to read, when

### Starting a `tdd-spec-session` (design/story-authoring)

1. Read `project-description.md` in full.
2. Read `user-stories-art-marketplace.md` (the index) in full — it's short.
3. Read `project-tracker.json` (active tracker) in full.
4. **Do not** read `epics/*.md` for every epic, and **do not** read
   `project-tracker-archive.json`, unless the specific work requires historical detail (e.g.
   auditing whether a Passed story's acceptance criteria need revising, which does happen —
   see the many "Revises Passed US-X.Y" notes throughout the epic files).
5. If drafting a new epic or stories for an existing one, read that specific epic's file in
   `epics/` for its current content and conventions before writing.

### Starting a `tdd-handoff` / Claude Code implementation session

The handoff prompt should tell the new session:

1. Read `project-description.md` in full.
2. Read `user-stories-art-marketplace.md` (the index) to find the target epic's file.
3. Read **only** `epics/<target-epic-file>.md` for the epic(s) being implemented this session —
   not the whole `epics/` directory.
4. Read `project-tracker.json` (active tracker) to confirm current story statuses — this file is
   already scoped to non-Passed work, so no further filtering is needed.
5. Do **not** read `project-tracker-archive.json` unless investigating a regression in
   already-Passed work.

A handoff prompt for this project should name the specific epic file path, e.g.:

> Read `spec/project-description.md`, `spec/user-stories-art-marketplace.md` (the index), and
> `spec/epics/mftf-17-printify-integration.md`. Also read `spec/project-tracker.json` for current
> story status. Work through Epic MFTF-17 in order.

not the generic "read the spec file" instruction the `tdd-handoff` skill template defaults to.

### Updating tracker state after a story passes

- Mark the story `Passed` in `project-tracker.json` as normal.
- **Move that story's object from `project-tracker.json` into `project-tracker-archive.json`**
  as part of the same update — don't let `Passed` stories accumulate back into the active file.
  This is the maintenance cost of the split: it requires a small extra step instead of a single
  in-place status edit. `data:analyze` or a short Python/Node snippet is sufficient; there's no
  tooling for this yet (a future epic could script it if the manual step becomes annoying).
- Keep `epicOrder`, `commits`, and `statusLegend` in the active file regardless of story status —
  they're small and load-bearing for every session.

### Adding a new epic (via `tdd-spec-session`)

1. Create `epics/<slug>.md` following the naming convention: lowercase, epic ID first (e.g.
   `mftf-23-foo-bar.md` or `24-foo-bar.md` for a non-MFTF-prefixed epic), hyphen-separated.
2. Add a row to the index table in `user-stories-art-marketplace.md`, in `epicOrder.sequence`
   position if it's active work, or the deferred section if not.
3. Add the new stories to `project-tracker.json`'s `stories` array (they start `Not Started`,
   so they belong in the active file, not the archive).
4. Insert the epic into `epicOrder.sequence` or `epicOrder.deferred` in the same file.
5. Log the change in `project-description.md`'s Revision History.

This is unchanged from the pre-split workflow except that step 1 creates a new file instead of
appending a new `## Epic` section to the monolith.

### Adding new stories to an existing epic (via `tdd-spec-session`)

The more common case day-to-day: scoping new work — or resolving an `EMERGING`/placeholder story
stub into real acceptance criteria — inside an epic that already has a file. First exercised
2026-08-16 scoping US-MFTF-17.7's placeholder into US-MFTF-17.7–17.11 within the existing
`epics/mftf-17-printify-integration.md`.

1. Edit the existing `epics/<slug>.md` file directly — append new `### US-<EPIC>.<N>` story
   blocks (or replace a placeholder stub's section entirely; don't leave superseded placeholder
   language sitting alongside the real stories) following that file's established heading/
   Acceptance-Criteria/TDD-Notes/`---`-separator conventions. Do **not** create a new epic file
   or a new row in `user-stories-art-marketplace.md` — the epic already exists and its index row
   is unchanged (unless the epic's overall status genuinely changed, e.g. its first story left
   `Deferred`).
2. Add the new stories to `project-tracker.json`'s `stories` array, `Not Started` (or carry over
   an existing status if you're rescoping rather than adding, e.g. flipping a `Deferred`
   placeholder to `Not Started` once it's actually scoped — see US-MFTF-17.7's own entry for an
   example).
3. **Exception — chores/spikes get no tracker row.** A story whose output is a decision document
   rather than shipped code (API discovery spikes like US-MFTF-2/US-MFTF-17.1, or a preview-spike
   in the same shape) is tracked only in the epic file, never added to `project-tracker.json`.
   Keep this consistent when a new spike-shaped story is added to an existing epic.
4. Recompute `project-tracker.json`'s `summary.totalActive`, `summary.byStatus`, and
   `summary.totalAllTime` to match the new story count — verify programmatically (parse the JSON,
   confirm the story-id set has no duplicates, confirm the status counts sum to `totalActive`)
   before treating the file as done, the same check a `CHORE-16`-style commit-hash backfill or the
   original split verified mechanically.
5. Log the change in `project-description.md`'s Revision History, including the rationale for any
   design decisions made in the scoping session (control-level/scope tradeoffs, what was
   deliberately deferred and why) — not just the mechanical file diff.
6. `epicOrder` is untouched — it sequences epics, not individual stories within one.

---

## Things this split deliberately did NOT change

- **Filenames that generic skills expect** (`project-tracker.json`, and a file matching the
  "spec file" description) still exist and still work as an entry point — they just aren't the
  whole story anymore. A session that only reads what the generic skill template tells it to
  read will still function, just without the per-epic scoping benefit this protocol describes.
- **Story ID scheme, epic numbering, and acceptance-criteria format** are all unchanged.
- **`project-description.md`** was not split — ~47KB at the 2026-07-11 split, ~54KB as of
  2026-08-16 (Revision History and Open Questions keep growing, as expected). Still not a
  problem; revisit if it keeps growing substantially — no fixed threshold, but if a fresh
  `tdd-spec-session` start (project-description.md + the index + the active tracker, per the
  protocol above) is ever a meaningful fraction of a session's context budget on its own, that's
  the signal to split it (e.g. Revision History into its own file, oldest-first, à la the tracker
  archive).
- **Per-epic file size is likewise unbounded.** A single epic file can grow well past its
  post-split size as scoping sessions add stories to it (see "Adding new stories to an existing
  epic" above) — `epics/mftf-17-printify-integration.md` was ~18KB at the 2026-07-11 split and is
  ~40KB as of 2026-08-16 after five stories (US-MFTF-17.7–17.11) were scoped into it in one
  session. No fixed threshold here either; the failure mode to watch for is the same one that
  motivated the original split — a single epic file becoming a meaningful fraction of a coding
  session's context budget when that epic is the one being implemented.

---

## If this protocol conflicts with a skill's built-in instructions

Some Anthropic-provided skills (`tdd-handoff`, `tdd-spec-session`) have their own built-in
assumptions about file layout — e.g. "the spec is one file," or a pre-commit hook example that
checks whether `project-tracker.json` was touched. Those skills are generic templates; this file
is the project-specific override. When they conflict, follow this file. Specifically:

- **"Read the spec file"** → read the index (`user-stories-art-marketplace.md`) plus the
  relevant epic file(s) in `epics/`, not one big file.
- **"Read the tracker"** → read `project-tracker.json` (active); only pull in
  `project-tracker-archive.json` for historical work.
- **Pre-commit hook checking `project-tracker.json`** → a hook now exists at `.husky/pre-commit`
  (added since the 2026-07-11 "no hook" note; corrected 2026-08-17). It requires
  `spec/project-tracker.json` to be **staged** in any commit that touches `src/`, `__tests__/`,
  or `prisma/schema` (pure infra/config commits are exempt). Consequence: even a follow-up fix to
  an already-`Passed` story must stage the active tracker — record the change there (e.g. a
  post-merge note on the relevant story, or on a related open story, plus `lastUpdated`).
  **Caveat the hook does NOT catch:** it only checks the active file, not
  `project-tracker-archive.json`. A story-completion commit still moves the story object from the
  active file into the archive (see "Updating tracker state after a story passes"), so remember to
  stage `project-tracker-archive.json` too — the hook will happily pass a commit that marked a
  story `Passed`/removed it from the active file but forgot the archive.
