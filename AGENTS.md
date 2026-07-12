<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Spec and Tracker Protocol

Before reading or editing anything in `spec/`, read `spec/README.md` first. As of 2026-07-11 the
spec and tracker are **split**, not single files:

- `spec/user-stories-art-marketplace.md` is an **index only** — full acceptance criteria live in
  `spec/epics/*.md`, one file per epic. Read only the epic file(s) relevant to current work.
- `spec/project-tracker.json` is the **active** tracker (Not Started / Deferred / pending-live-
  confirmation stories only). `spec/project-tracker-archive.json` holds Passed/Dropped stories —
  read it only for historical audits, not day-to-day implementation work.

`spec/README.md` has the full protocol, including how this differs from what the generic
`tdd-handoff`/`tdd-spec-session` skill instructions assume by default. If a skill's own
instructions conflict with `spec/README.md` on this project, follow `spec/README.md`.

**If you are about to run the `tdd-handoff` or `tdd-spec-session` skill on this repo** — including
if you're about to say something like "upload your three source-of-truth files," "read the spec
file," or "read all three completely" — stop and read `spec/README.md` first instead. Those
skill instructions assume one spec file and one complete tracker file; substitute the file list
`spec/README.md` gives you.
