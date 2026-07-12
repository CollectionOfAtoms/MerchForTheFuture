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

---

## Things this split deliberately did NOT change

- **Filenames that generic skills expect** (`project-tracker.json`, and a file matching the
  "spec file" description) still exist and still work as an entry point — they just aren't the
  whole story anymore. A session that only reads what the generic skill template tells it to
  read will still function, just without the per-epic scoping benefit this protocol describes.
- **Story ID scheme, epic numbering, and acceptance-criteria format** are all unchanged.
- **`project-description.md`** was not split — at ~47KB it isn't a problem yet. Revisit if it
  grows substantially (e.g. if Revision History or Open Questions balloon).

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
- **Pre-commit hook checking `project-tracker.json`** → this project does not currently have a
  pre-commit hook (verified 2026-07-11: none exists in `.git/hooks/`). If one is added later, it
  should also account for `project-tracker-archive.json` if a story-completion commit is expected
  to touch both files (marking `Passed` in one and removing from the other).
