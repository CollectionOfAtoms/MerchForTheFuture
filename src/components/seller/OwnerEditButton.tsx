import Link from "next/link";

/**
 * "Edit this listing →" button shown on a public detail page when the current
 * viewer owns the listing (any status). Presentational — the caller decides
 * ownership (isListingOwner) so this stays trivially testable. Self-contained with
 * its own page-width container so it sits cleanly at the top of the detail page.
 */
export default function OwnerEditButton({ editHref }: { editHref: string }) {
  return (
    <div className="mx-auto flex max-w-5xl justify-end px-6 pt-6">
      <Link
        href={editHref}
        className="inline-flex items-center gap-1 rounded-full bg-cerulean px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dark-cyan"
      >
        Edit this listing →
      </Link>
    </div>
  );
}
