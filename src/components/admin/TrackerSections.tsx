"use client";

import { useState } from "react";
import type { EpicSection, TrackerStory } from "@/lib/tracker/group";

// US-MFTF-19.2 — navigable, collapsible per-epic sections for the admin tracker.
// Presentation only: receives already-grouped sections as props (the server page
// reads the tracker JSON), so this client component never imports server code.

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  "Not Started": { label: "Not Started", bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
  "Test Written": { label: "Test Written", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
  "In Progress": { label: "In Progress", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-400" },
  "Passed": { label: "Passed", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "Complete": { label: "Complete", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "Deferred": { label: "Deferred", bg: "bg-sky-50", text: "text-sky-600", dot: "bg-sky-300" },
  "Dropped": { label: "Dropped", bg: "bg-red-50", text: "text-red-400", dot: "bg-red-300" },
  "Blocked": { label: "Blocked", bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400" },
  "Tests Passing — pending live confirmation": { label: "Tests passing · live-confirm pending", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StoryRow({ story }: { story: TrackerStory }) {
  return (
    <div data-story-row className="flex items-start gap-4 px-6 py-3">
      <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-gray-400">{story.id}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800">{story.title}</p>
        {/* Passed-date is shown whenever present — even where the commit is the
            "pending" placeholder (Epic 5). Null shows a clear empty state. */}
        <p className="mt-0.5 text-xs text-gray-400">
          {story.testPassedDate ? (
            <span>Passed {story.testPassedDate}</span>
          ) : (
            <span className="italic text-gray-300">not passed —</span>
          )}
        </p>
      </div>
      <StatusBadge status={story.status} />
    </div>
  );
}

function Section({ section }: { section: EpicSection }) {
  const [open, setOpen] = useState(true);
  const { counts } = section;
  return (
    <div id={section.anchor} className="scroll-mt-4 rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span aria-hidden className="text-gray-400">{open ? "▾" : "▸"}</span>
          {section.epic}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
          <span>{counts.passed} passed</span>
          <span>{counts.notStarted} not started</span>
          {counts.deferred > 0 && <span>{counts.deferred} deferred</span>}
          <span className="text-gray-400">{counts.passed}/{counts.total}</span>
        </span>
      </button>
      {open && <div className="divide-y divide-gray-50 border-t border-gray-100">{section.stories.map((s) => <StoryRow key={s.id} story={s} />)}</div>}
    </div>
  );
}

export default function TrackerSections({ sections }: { sections: EpicSection[] }) {
  return (
    <div className="space-y-4">
      {/* Jump nav — keyboard-operable in-page links, derived from the data. */}
      <nav aria-label="Sections" className="rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Jump to epic</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {sections.map((s) => (
            <li key={s.anchor}>
              <a href={`#${s.anchor}`} className="text-gray-600 hover:text-gray-900 hover:underline">
                {s.epic} <span className="text-gray-400">({s.counts.passed}/{s.counts.total})</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map((s) => <Section key={s.anchor} section={s} />)}
    </div>
  );
}
