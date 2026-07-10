import { readFile } from "fs/promises";
import path from "path";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { groupStoriesByEpic, type TrackerStory } from "@/lib/tracker/group";
import TrackerSections from "@/components/admin/TrackerSections";

interface Commit {
  hash: string;
  date: string;
  author: string;
  storiesAffected: string[];
  message: string;
  trackerUpdated: boolean;
}

interface TrackerData {
  stories: TrackerStory[];
  commits: Commit[];
}

function ProgressBar({ passed, written, total }: { passed: number; written: number; total: number }) {
  const passedPct = (passed / total) * 100;
  const writtenPct = (written / total) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="flex h-full">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${passedPct}%` }} />
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${writtenPct}%` }} />
      </div>
    </div>
  );
}

export default async function TrackerPage() {
  // Admin-gated to match the sibling admin pages (US-MFTF-19.2 — the page was
  // previously ungated).
  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  if (!user.roles?.includes("ADMIN")) redirect("/");

  const filePath = path.join(process.cwd(), "spec", "project-tracker.json");
  const raw = await readFile(filePath, "utf-8");
  const data: TrackerData = JSON.parse(raw);

  const sections = groupStoriesByEpic(data.stories);
  const totalPassed = data.stories.filter((s) => s.status === "Passed" || s.status === "Complete").length;
  const totalWritten = data.stories.filter((s) => s.status === "Test Written").length;
  const totalStories = data.stories.length;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Project Tracker</h1>
            <p className="mt-1 text-sm text-gray-500">Merch for the Future — development progress</p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <a href="/admin/users" className="text-gray-500 transition-colors hover:text-gray-900">Users</a>
            <a href="/admin/fulfillment" className="text-gray-500 transition-colors hover:text-gray-900">Fulfillment</a>
          </nav>
        </div>

        {/* Overall summary */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Overall completion</span>
            <span className="text-sm text-gray-500">{totalPassed} / {totalStories} stories passed</span>
          </div>
          <ProgressBar passed={totalPassed} written={totalWritten} total={totalStories} />
          <div className="mt-3 flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Passed ({totalPassed})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Test Written ({totalWritten})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-300" /> Not Started ({totalStories - totalPassed - totalWritten})</span>
          </div>
        </div>

        {/* Navigable, collapsible per-epic sections (US-MFTF-19.2) */}
        <TrackerSections sections={sections} />

        {/* Commit log */}
        {data.commits.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-800">Commit Log</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {[...data.commits].reverse().map((commit, i) => {
                const hash = commit.hash ?? (commit as { sha?: string }).sha ?? "—";
                const message = commit.message ?? (commit as { description?: string }).description ?? "";
                const affected: string[] = commit.storiesAffected ?? [];
                return (
                  <div key={hash + i} className="flex items-start gap-4 px-6 py-3">
                    <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-gray-400">{hash}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800">{message}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {commit.date}
                        {commit.author && <> · {commit.author}</>}
                        {affected.length > 0 && <> · {affected.join(", ")}</>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
