# Claude Code Handoff — Epic MFTF-17 (Seller Apparel Design/Placement Tool)

_Generated 2026-08-17 from a `tdd-spec-session`. Paste everything below the line into a fresh Claude Code session._

---

You're picking up an in-progress project: **Merch for the Future**, a Next.js 16 (App Router) + Prisma + Neon storefront selling sustainably-sourced, biodegradable apparel and fine-art prints, built and run by two founders. It is pre-launch but feature-rich — cart, multi-provider checkout, per-provider fulfillment fan-out, webhooks, and lifecycle emails are all live and passing.

## Read these first — and only these

**This project's spec is split. `spec/README.md` overrides the generic `tdd-handoff` skill's instructions.** Do not go looking for a single spec file or a single complete tracker; they don't exist here. Read, in this order:

1. **`spec/README.md`** — the spec/tracker protocol. Read this before touching anything in `spec/`.
2. **`AGENTS.md`** — repo conventions, including the Next.js-version warning below.
3. **`spec/project-description.md`** — vision, users/roles, tech rationale, design principles, open questions, revision history.
4. **`spec/epics/mftf-17-printify-integration.md`** — **your epic.** Read the whole file; the US-MFTF-17.7–17.11 block at the end was scoped 2026-08-17 and is what you're building.
5. **`spec/project-tracker.json`** — the *active* tracker (open stories only). Current state lives here; trust it over any memory or assumption.
6. **`docs/printify-api-notes.md`** — the Printify API reference, including the live-verified order `print_areas` shapes you'll be working with.

**Do not** read `spec/project-tracker-archive.json` (184 passed/dropped stories — historical only) or the other 45 files in `spec/epics/`. Reading them wastes context you'll need for the work.

## Before writing any code

- **Heed the Next.js warning in `AGENTS.md`.** This is Next.js 16 — APIs and conventions differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing routing or data-fetching code.
- **Explore the existing code you'll be extending or mirroring.** Specifically:
  - `src/lib/apparel/sync-printify.ts` — you're extending `syncOneType` (US-MFTF-17.7)
  - `src/components/FramingTool.tsx` + `src/lib/print/crop-geometry.ts` — **the pattern to mirror** for US-MFTF-17.8. `crop-geometry.ts` is a pure, DOM-free geometry module unit-tested in isolation, with a thin client component wiring pointer events to it. Your `placement-geometry.ts` should follow that structure exactly.
  - `src/components/PrintFramingPanel.tsx` — the edit-page panel pattern for US-MFTF-17.8's UI
  - `src/lib/fulfillment/providers/printify.ts` (`createProviderOrder`) and `src/lib/checkout/fanout.ts` (`toQuoteItem`) — both touched by US-MFTF-17.9
  - `__tests__/mftf-17-printify/` — existing test files from US-MFTF-17.2/17.4/17.5/17.6. Match their style, naming, and MSW usage.
- **Match the conventions already in place.** Don't introduce new patterns where an established one exists.

## Your task

Work **US-MFTF-17.7 → US-MFTF-17.8 → US-MFTF-17.9, in that order.** They form a strict dependency chain: 17.8 needs the print-area dimensions 17.7 captures; 17.9 needs the placement 17.8 persists.

For each story, follow the project's strict TDD cycle:

1. **Red** — write failing tests derived from the acceptance criteria, and **confirm they fail** before writing implementation. Each acceptance criterion becomes at least one assertion. The story's TDD Notes name the test files and the specific cases.
2. **Green** — minimum implementation to pass. No more.
3. **Refactor** — clean up with tests green. No new functionality.
4. **Commit** — mark the story `Passed` in `spec/project-tracker.json` with `testPassedDate` and the real `testPassedCommit` hash, **and move the story object into `spec/project-tracker-archive.json`** (this is the tracker-split maintenance step — see `spec/README.md`; don't let Passed stories accumulate in the active file). Recompute `summary.totalActive`, `summary.totalArchived`, and `summary.byStatus`. Include the tracker update in the same commit as the implementation.

Do not start the next story until the current one is fully passing and committed.

### Two stories in this epic are NOT yours

- **US-MFTF-17.10** is a manual founder spike (prototype Printify's mockup call); its output is a doc update, not code.
- **US-MFTF-17.11** is blocked on 17.10's finding and is deliberately scoped only at the outcome level.

Leave both alone. If you finish 17.9 with context to spare, stop and summarize rather than starting 17.11.

## Context that isn't in the spec

**No Printify sandbox exists.** All tests use MSW (`__tests__/mocks/handlers.ts`, `printifyHandlers`). Never make a live Printify call from a test. For manual verification, the env switch `DROPSHIPPING_SIMULATE_ORDERS=1` short-circuits order *submission* to sandbox-less providers (Printify, Teemill) so you can exercise the flow without creating a real, billable order — shipping quotes are not simulated.

**US-MFTF-17.9 cannot reach `Passed` in this session.** Its acceptance criteria are provable against MSW, but confirming the positioned `print_areas` form actually reaches production requires a real founder-placed order. Mark it **`Tests Passing — pending live confirmation`** (an established status in this project's `statusLegend`), not `Passed`. 17.7 and 17.8 have no such constraint and should reach `Passed` normally.

**The Printify order `print_areas` shape has two forms, and the wrong one 400s.** Live-verified 2026-08-15:
- Current/simple (auto-centre): `print_areas: { front: "<designURL>" }`
- Positioned (what 17.9 emits when a placement exists): `print_areas: { front: [{ src, x, y, scale, angle }] }`
- The *product-creation* shape (`[{ variant_ids, placeholders: [...] }]`) is **wrong for orders** and returns `code 8150 "The src/x/y/scale/angle field is required"`. Don't reintroduce it.

US-MFTF-17.9's whole safety property is that listings without a saved placement keep sending the simple form unchanged. Pin that with a regression test — it protects every listing already live.

**Printify's accepted ranges for `x`/`y`/`scale`/`angle` are unverified.** The clamp in US-MFTF-17.8 is a deliberate client-side safety net, not a confirmed provider limit. Mark it `// UNVERIFIED` in the code, consistent with how this epic already flags unconfirmed Printify behavior.

**`prisma db push`, not `prisma migrate dev`** — there's existing schema drift on `Order.stripeSessionId`. Push to both the dev and test databases.

**Buyer-facing opacity is a hard project rule.** No provider name, blueprint id, or variant id may appear in any buyer-facing payload. Placement is a seller-side production detail.

## When you're done

Summarize: which stories passed, which commits, anything you discovered that contradicts `docs/printify-api-notes.md` or `spec/project-description.md`. **Flag contradictions rather than silently working around them** — they should be reconciled in a `tdd-spec-session` before the next handoff, not patched in place.
