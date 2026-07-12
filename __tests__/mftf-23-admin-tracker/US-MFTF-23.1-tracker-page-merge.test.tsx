// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { groupStoriesByEpic, type EpicSection, type TrackerStory } from "@/lib/tracker/group";

// US-MFTF-23.1 — the /admin/tracker server page renders the MERGED (active +
// archive) tracker, and shows a visible warning banner (never crashes) when the
// archive file is unavailable. We drive the page via a mocked loader so the test
// stays independent of the real spec JSON files.

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/tracker/load", () => ({ loadTrackerData: vi.fn() }));

const { auth } = await import("@/auth");
const { loadTrackerData } = await import("@/lib/tracker/load");
const TrackerPage = (await import("@/app/(main)/admin/tracker/page")).default;

afterEach(cleanup);

function story(over: Partial<TrackerStory>): TrackerStory {
  return {
    id: "US-X", epic: "Epic A", title: "A story", status: "Not Started",
    testWrittenDate: null, testWrittenCommit: null, testPassedDate: null,
    testPassedCommit: null, notes: "", ...over,
  };
}

function loaded(over: {
  sections?: EpicSection[];
  totalPassed?: number;
  totalWritten?: number;
  totalStories?: number;
  archiveError?: boolean;
}) {
  return {
    sections: over.sections ?? [],
    totalPassed: over.totalPassed ?? 0,
    totalWritten: over.totalWritten ?? 0,
    totalStories: over.totalStories ?? 0,
    commits: [],
    archiveError: over.archiveError ?? false,
  };
}

const adminSession = { user: { id: "u1", roles: ["ADMIN"] } };

describe("TrackerPage merged rendering (US-MFTF-23.1)", () => {
  it("renders merged per-epic passed/total and overall counts", async () => {
    const sections = groupStoriesByEpic([
      story({ id: "US-1.1", epic: "Epic 1: Listings", status: "Passed" }),
      story({ id: "US-1.2", epic: "Epic 1: Listings", status: "Passed" }),
      story({ id: "US-1.3", epic: "Epic 1: Listings", status: "Passed" }),
      story({ id: "US-23.1", epic: "Epic 23", status: "Not Started" }),
    ]);
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(loadTrackerData).mockResolvedValue(
      loaded({ sections, totalPassed: 3, totalWritten: 0, totalStories: 4 }),
    );

    render(await TrackerPage());

    // Overall summary reflects the merged 3/4, not active-only 0-passed.
    expect(screen.getByText(/3 \/ 4 stories passed/)).toBeTruthy();
    // A fully-historical epic shows 3/3 rather than 0/0.
    const nav = screen.getByRole("navigation", { name: /sections/i });
    const link = within(nav).getByRole("link", { name: /Epic 1: Listings/ });
    expect(link.parentElement?.textContent).toContain("3/3");
    // No warning banner when the archive loaded fine.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a visible warning banner and active-only data when the archive is unavailable", async () => {
    const sections = groupStoriesByEpic([story({ id: "US-23.1", epic: "Epic 23", status: "Not Started" })]);
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(loadTrackerData).mockResolvedValue(
      loaded({ sections, totalPassed: 0, totalStories: 1, archiveError: true }),
    );

    render(await TrackerPage());

    const banner = screen.getByRole("alert");
    expect(banner.textContent).toMatch(/archive/i);
    expect(banner.textContent).toMatch(/active/i);
  });

  it("redirects non-admins away", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u2", roles: [] } } as never);
    vi.mocked(loadTrackerData).mockResolvedValue(loaded({}));
    await expect(TrackerPage()).rejects.toThrow(/NEXT_REDIRECT/);
  });
});
