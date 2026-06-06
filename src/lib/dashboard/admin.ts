import { prisma } from "@/lib/db";

// ─── Tracker summary types ────────────────────────────────────────────────────

interface TrackerStory {
  id: string;
  epic: string;
  title: string;
  status: string;
  notes: string | null;
}

interface TrackerData {
  stories: TrackerStory[];
  commits: unknown[];
}

export interface EpicProgress {
  epic: string;
  total: number;
  passed: number;
  testWritten: number;
}

export interface TrackerSummary {
  totalStories: number;
  byStatus: Record<string, number>;
  passedPercent: number;
  byEpic: EpicProgress[];
  pendingStories: TrackerStory[];
}

export function computeTrackerSummary(data: TrackerData): TrackerSummary {
  const { stories } = data;
  const totalStories = stories.length;

  const byStatus: Record<string, number> = {};
  for (const story of stories) {
    byStatus[story.status] = (byStatus[story.status] ?? 0) + 1;
  }

  const passedCount = byStatus["Passed"] ?? 0;
  const passedPercent = totalStories === 0 ? 0 : (passedCount / totalStories) * 100;

  const epicMap = new Map<string, EpicProgress>();
  for (const story of stories) {
    if (!epicMap.has(story.epic)) {
      epicMap.set(story.epic, { epic: story.epic, total: 0, passed: 0, testWritten: 0 });
    }
    const entry = epicMap.get(story.epic)!;
    entry.total++;
    if (story.status === "Passed") entry.passed++;
    if (story.status === "Test Written") entry.testWritten++;
  }
  const byEpic = Array.from(epicMap.values());

  const pendingStories = stories.filter(
    (s) => s.status === "Not Started" || s.status === "In Progress"
  );

  return { totalStories, byStatus, passedPercent, byEpic, pendingStories };
}

// ─── Site metrics ─────────────────────────────────────────────────────────────

export interface ListingCounts {
  active: number;
  sold: number;
  archived: number;
  total: number;
}

export interface UserCounts {
  admins: number;
  sellers: number;
  buyers: number;
  total: number;
}

export interface AdminSiteMetrics {
  listings: ListingCounts;
  users: UserCounts;
}

export async function getAdminSiteMetrics(): Promise<AdminSiteMetrics> {
  const [listingGroups, allUsers] = await Promise.all([
    prisma.originalListing.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.user.findMany({ select: { roles: true } }),
  ]);

  const listings: ListingCounts = { active: 0, sold: 0, archived: 0, total: 0 };
  for (const group of listingGroups) {
    const count = group._count.id;
    listings.total += count;
    if (group.status === "ACTIVE") listings.active = count;
    else if (group.status === "SOLD") listings.sold = count;
    else if (group.status === "ARCHIVED") listings.archived = count;
  }

  const users: UserCounts = { admins: 0, sellers: 0, buyers: 0, total: allUsers.length };
  for (const user of allUsers) {
    const roles = user.roles as string[];
    if (roles.includes("ADMIN")) users.admins++;
    if (roles.includes("SELLER")) users.sellers++;
    if (roles.includes("BUYER")) users.buyers++;
  }

  return { listings, users };
}

// ─── Recent activity ──────────────────────────────────────────────────────────

export interface ActivityEvent {
  type: "new_listing" | "bid_placed" | "purchase_completed";
  description: string;
  date: Date;
}

export async function getAdminRecentActivity(): Promise<ActivityEvent[]> {
  const [recentListings, recentBids, recentOrders] = await Promise.all([
    prisma.originalListing.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { artwork: { select: { title: true } } },
    }),
    prisma.bid.findMany({
      take: 10,
      orderBy: { placedAt: "desc" },
      include: {
        auction: {
          include: { originalListing: { include: { artwork: { select: { title: true } } } } },
        },
        bidder: { select: { name: true, email: true } },
      },
    }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        originalListing: { include: { artwork: { select: { title: true } } } },
        buyer: { select: { name: true, email: true } },
      },
    }),
  ]);

  const events: ActivityEvent[] = [
    ...recentListings.map((l) => ({
      type: "new_listing" as const,
      description: `New listing: ${l.artwork.title}`,
      date: l.createdAt,
    })),
    ...recentBids.map((b) => ({
      type: "bid_placed" as const,
      description: `Bid of $${b.amount} on ${b.auction.originalListing.artwork.title}`,
      date: b.placedAt,
    })),
    ...recentOrders.map((o) => ({
      type: "purchase_completed" as const,
      description: `Purchase: ${o.originalListing?.artwork.title ?? "Print order"} by ${o.buyer.name ?? o.buyer.email}`,
      date: o.createdAt,
    })),
  ];

  return events.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);
}
