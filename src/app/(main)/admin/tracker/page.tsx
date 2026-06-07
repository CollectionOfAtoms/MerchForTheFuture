import { readFile } from "fs/promises";
import path from "path";

interface Story {
  id: string;
  epic: string;
  title: string;
  status: "Not Started" | "Test Written" | "In Progress" | "Passed" | "Complete" | "Deferred" | "Dropped";
  testWrittenDate: string | null;
  testWrittenCommit: string | null;
  testPassedDate: string | null;
  testPassedCommit: string | null;
  notes: string | null;
}

interface Commit {
  hash: string;
  date: string;
  author: string;
  storiesAffected: string[];
  message: string;
  trackerUpdated: boolean;
}

interface TrackerData {
  stories: Story[];
  commits: Commit[];
}

const STATUS_CONFIG = {
  "Not Started": { label: "Not Started", bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" },
  "Test Written": { label: "Test Written", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
  "In Progress": { label: "In Progress", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-400" },
  "Passed": { label: "Passed", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "Complete": { label: "Complete", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "Deferred": { label: "Deferred", bg: "bg-sky-50", text: "text-sky-600", dot: "bg-sky-300" },
  "Dropped": { label: "Dropped", bg: "bg-red-50", text: "text-red-400", dot: "bg-red-300" },
} as const;

function groupByEpic(stories: Story[]): Record<string, Story[]> {
  return stories.reduce<Record<string, Story[]>>((acc, story) => {
    acc[story.epic] = acc[story.epic] ?? [];
    acc[story.epic].push(story);
    return acc;
  }, {});
}

function epicProgress(stories: Story[]) {
  const passed = stories.filter((s) => s.status === "Passed").length;
  const written = stories.filter((s) => s.status === "Test Written").length;
  const total = stories.length;
  return { passed, written, total };
}

function StatusBadge({ status }: { status: Story["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
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
  const filePath = path.join(process.cwd(), "spec", "project-tracker.json");
  const raw = await readFile(filePath, "utf-8");
  const data: TrackerData = JSON.parse(raw);

  const byEpic = groupByEpic(data.stories);
  const totalPassed = data.stories.filter((s) => s.status === "Passed").length;
  const totalWritten = data.stories.filter((s) => s.status === "Test Written").length;
  const totalStories = data.stories.length;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Project Tracker</h1>
            <p className="mt-1 text-sm text-gray-500">Art Auction Marketplace — development progress</p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <a href="/admin/users" className="text-gray-500 hover:text-gray-900 transition-colors">Users</a>
            <a href="/admin/fulfillment" className="text-gray-500 hover:text-gray-900 transition-colors">Fulfillment</a>
          </nav>
        </div>

        {/* Overall summary */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Overall completion</span>
            <span className="text-sm text-gray-500">
              {totalPassed} / {totalStories} stories passed
            </span>
          </div>
          <ProgressBar passed={totalPassed} written={totalWritten} total={totalStories} />
          <div className="mt-3 flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Passed ({totalPassed})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Test Written ({totalWritten})</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-300" /> Not Started ({totalStories - totalPassed - totalWritten})</span>
          </div>
        </div>

        {/* Epics */}
        <div className="space-y-4">
          {Object.entries(byEpic).map(([epicName, stories]) => {
            const { passed, written, total } = epicProgress(stories);
            return (
              <div key={epicName} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                {/* Epic header */}
                <div className="border-b border-gray-100 px-6 py-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-800">{epicName}</h2>
                    <span className="text-xs text-gray-400">{passed}/{total}</span>
                  </div>
                  <ProgressBar passed={passed} written={written} total={total} />
                </div>

                {/* Stories table */}
                <div className="divide-y divide-gray-50">
                  {stories.map((story) => (
                    <div key={story.id} className="flex items-start gap-4 px-6 py-3">
                      <span className="w-14 shrink-0 text-xs font-mono text-gray-400 pt-0.5">{story.id}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{story.title}</p>
                        {story.notes && (
                          <p className="mt-0.5 text-xs text-gray-400">{story.notes}</p>
                        )}
                      </div>
                      <StatusBadge status={story.status} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

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
                    <span className="w-14 shrink-0 font-mono text-xs text-gray-400 pt-0.5">{hash}</span>
                    <div className="flex-1 min-w-0">
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
