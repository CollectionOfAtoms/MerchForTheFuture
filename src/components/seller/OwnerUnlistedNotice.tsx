import Link from "next/link";
import { auth } from "@/auth";
import { shouldShowOwnerUnlistedNotice } from "@/lib/seller/listing-status";

/**
 * Banner shown on a public detail page when the current viewer is the seller who
 * owns the listing and it is UNLISTED — a reminder that they're previewing a
 * listing that the public can't find. Renders nothing for buyers, non-owners, or
 * listings that aren't unlisted. Self-contained (includes its own page-width
 * container) so it can sit at the top of either detail page without leaving an
 * empty wrapper when it renders null.
 */
export default async function OwnerUnlistedNotice({
  sellerId,
  status,
  editHref,
}: {
  sellerId: string;
  status: string;
  editHref?: string;
}) {
  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  if (!shouldShowOwnerUnlistedNotice(viewerId, sellerId, status)) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
        <span>
          This listing is <strong>unlisted</strong> — only you can reach it with this link. It won&apos;t
          appear in the store or any browse feeds until you publish it.
        </span>
        {editHref && (
          <Link
            href={editHref}
            className="shrink-0 rounded-full border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 transition-colors"
          >
            Manage status →
          </Link>
        )}
      </div>
    </div>
  );
}
