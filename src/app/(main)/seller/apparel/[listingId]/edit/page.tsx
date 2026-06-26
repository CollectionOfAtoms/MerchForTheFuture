import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import {
  getApparelListingForEdit,
  getReferencedListingForEdit,
} from "@/lib/apparel/listings";
import EditApparelListingForm from "@/components/seller/EditApparelListingForm";
import ApparelImageManager from "@/components/seller/ApparelImageManager";
import EditReferencedListingForm from "@/components/seller/EditReferencedListingForm";
import ListingStatusControls from "@/components/seller/ListingStatusControls";
import { isPubliclyViewable, canManageListing } from "@/lib/seller/listing-status";
import { getPricingConfig } from "@/lib/pricing/config";
// (ApparelImageManager is shared by both the designed and referenced edit views.)

/**
 * Link to the public product page. ACTIVE and UNLISTED apparel listings render
 * at /shop/[listingId]; ARCHIVED/SOLD listings 404 there, so the button is
 * hidden for them to avoid a dead link. (An UNLISTED listing is viewable by
 * direct link, which is exactly what this button provides.)
 */
function ViewListingButton({ listingId, status }: { listingId: string; status: string }) {
  if (!isPubliclyViewable("APPAREL", status)) return null;
  return (
    <Link
      href={`/shop/${listingId}`}
      className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
    >
      View listing →
    </Link>
  );
}

export default async function EditApparelListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;

  const session = await auth();
  const user = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!user?.id) redirect("/sign-in");
  // A SELLER (their own) or any ADMIN may reach the edit page; per-listing
  // authorization is checked with canManageListing below.
  if (!user.roles?.includes("SELLER") && !user.roles?.includes("ADMIN")) redirect("/");

  // Referenced (Teemill) listings use their own read + form; designed listings
  // fall through to the original path below.
  const referenced = await getReferencedListingForEdit(listingId);
  if (referenced) {
    if (!canManageListing(user, referenced.sellerId)) redirect("/seller/listings");
    const costThresholds = await getPricingConfig();
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">Edit referenced listing</h1>
            <p className="mt-1 text-sm text-stone-500">
              Update your price and photos, or re-sync the latest from Teemill.
            </p>
          </div>
          <ViewListingButton listingId={referenced.id} status={referenced.status} />
        </div>

        <div className="mb-8">
          <ListingStatusControls kind="APPAREL" listingId={referenced.id} status={referenced.status} />
        </div>

        <EditReferencedListingForm
          listing={{
            ...referenced,
            snapshotFetchedAt: referenced.snapshotFetchedAt
              ? referenced.snapshotFetchedAt.toISOString()
              : null,
          }}
          costThresholds={costThresholds}
        />

        {/* Lifestyle-photo management — these lead the carousel above, ahead of
            the Teemill mockups. No design file (referenced listings own none). */}
        <div className="mt-8">
          <ApparelImageManager
            listingId={referenced.id}
            initialImages={referenced.images}
            designImageUrl={null}
            showDesignFile={false}
            refreshOnChange
          />
        </div>
      </div>
    );
  }

  const listing = await getApparelListingForEdit(listingId);
  if (!listing) notFound();
  if (!canManageListing(user, listing.sellerId)) redirect("/seller/listings");

  const readOnly = listing.status === "SOLD";

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            {readOnly ? "Apparel listing" : "Edit apparel listing"}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {readOnly
              ? "This listing has sold and is read-only."
              : "Update your product details, colors, design, and photos."}
          </p>
        </div>
        <ViewListingButton listingId={listing.id} status={listing.status} />
      </div>

      <div className="mb-8">
        <ListingStatusControls kind="APPAREL" listingId={listing.id} status={listing.status} />
      </div>

      {readOnly ? (
        <ReadOnlyView listing={listing} />
      ) : (
        <div className="space-y-8">
          <EditApparelListingForm listing={listing} />
          <ApparelImageManager
            listingId={listing.id}
            initialImages={listing.images}
            designImageUrl={listing.designImageUrl}
          />
        </div>
      )}
    </div>
  );
}

function ReadOnlyView({
  listing,
}: {
  listing: NonNullable<Awaited<ReturnType<typeof getApparelListingForEdit>>>;
}) {
  const offered = listing.colors.filter((c) => c.isOffered);
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700">
      <div>
        <p className="text-xs font-medium text-stone-500">Product</p>
        <p>{listing.productType.name}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-stone-500">Title</p>
        <p>{listing.title}</p>
      </div>
      {listing.description && (
        <div>
          <p className="text-xs font-medium text-stone-500">Description</p>
          <p>{listing.description}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-stone-500">Price</p>
        <p>${listing.retailPrice.toFixed(2)}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-stone-500">Colors</p>
        <p>{offered.map((c) => c.colorName).join(", ")}</p>
      </div>
    </div>
  );
}
