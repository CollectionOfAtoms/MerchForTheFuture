"use client";

import { useActionState } from "react";
import { updateListingAction } from "@/app/actions/listings";
import ImageUploader from "@/components/ImageUploader";

interface Artwork {
  id: string;
  title: string;
  artist: string | null;
  description: string;
  medium: string | null;
  dimensions: string | null;
  year: number | null;
  images: { id: string; url: string; displayUrl?: string | null; isPrimary: boolean }[];
}

interface Auction {
  id: string;
  startBid: string | number | { toString(): string };
  reservePrice: string | number | { toString(): string } | null;
  endAt: Date;
  bidCount: number;
  status: string;
}

interface Listing {
  id: string;
  saleType: string;
  price: string | number | { toString(): string } | null;
  status: string;
  artwork: Artwork;
  auction: Auction | null;
}

const FIELD = "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none w-full";
const LABEL = "block text-xs font-medium text-stone-600 mb-1.5";

function parseDims(str: string | null): { w: number | ""; h: number | ""; unit: "in" | "cm" } {
  const def = { w: "" as const, h: "" as const, unit: "in" as const };
  if (!str) return def;
  const m = str.match(/(\d+(?:\.\d+)?)\s*["″']?\s*[×xX]\s*(\d+(?:\.\d+)?)\s*(in|cm|["″'])?/i);
  if (!m) return def;
  return { w: parseFloat(m[1]), h: parseFloat(m[2]), unit: ((m[3] ?? "in").toLowerCase() as "in" | "cm") };
}

export default function EditListingForm({ listing }: { listing: Listing }) {
  const boundAction = updateListingAction.bind(null, listing.id);
  type UpdateState = { error: string; success?: undefined } | { success: true; error?: undefined } | undefined;
  const [state, action, pending] = useActionState(boundAction, undefined as UpdateState);

  const { artwork, auction } = listing;
  const dims = parseDims(artwork.dimensions);
  const isAuction = listing.saleType === "AUCTION";
  const auctionClosed = auction?.status === "CLOSED" || (auction?.bidCount ?? 0) > 0;

  return (
    <form action={action} className="space-y-8">
      {state && "error" in state && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state && "success" in state && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Listing updated successfully.
        </div>
      )}

      {/* Artwork details */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-stone-800">Artwork details</h2>

        <div>
          <label htmlFor="title" className={LABEL}>Title <span className="text-red-400">*</span></label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={artwork.title}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="artist" className={LABEL}>Artist</label>
          <input
            id="artist"
            name="artist"
            type="text"
            defaultValue={artwork.artist ?? ""}
            placeholder="e.g. Georgia O'Keeffe"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="description" className={LABEL}>Description <span className="text-red-400">*</span></label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            defaultValue={artwork.description}
            className={`${FIELD} resize-none`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="medium" className={LABEL}>Medium</label>
            <input
              id="medium"
              name="medium"
              type="text"
              defaultValue={artwork.medium ?? ""}
              placeholder="e.g. Oil on canvas"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL}>Dimensions</label>
            <div className="flex items-center gap-2">
              <input
                id="dimensionW"
                name="dimensionW"
                type="number"
                min="0.1"
                step="0.1"
                defaultValue={dims.w}
                placeholder="W"
                className={`${FIELD} min-w-0`}
              />
              <span className="shrink-0 text-sm text-stone-400">×</span>
              <input
                id="dimensionH"
                name="dimensionH"
                type="number"
                min="0.1"
                step="0.1"
                defaultValue={dims.h}
                placeholder="H"
                className={`${FIELD} min-w-0`}
              />
              <select name="dimensionUnit" defaultValue={dims.unit} className="shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-stone-400 focus:outline-none">
                <option value="in">in</option>
                <option value="cm">cm</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="year" className={LABEL}>Year created</label>
            <input
              id="year"
              name="year"
              type="number"
              min="1900"
              max={new Date().getFullYear()}
              defaultValue={artwork.year ?? ""}
              className={FIELD}
            />
          </div>
        </div>
      </section>

      {/* Images */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-stone-800 mb-4">Photos</h2>
        <ImageUploader listingId={listing.id} initialImages={artwork.images} />
      </section>

      {/* Pricing */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-stone-800">
          {isAuction ? "Auction settings" : "Pricing"}
        </h2>

        {!isAuction && (
          <div>
            <label htmlFor="price" className={LABEL}>Price (USD) <span className="text-red-400">*</span></label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
              <input
                id="price"
                name="price"
                type="number"
                min="1"
                step="0.01"
                required
                defaultValue={listing.price ? Number(listing.price) : ""}
                className={`${FIELD} pl-7`}
              />
            </div>
          </div>
        )}

        {isAuction && auction && (
          <>
            <div className="rounded-xl bg-stone-50 border border-stone-200 px-4 py-3 text-sm text-stone-600">
              <div className="flex justify-between">
                <span>Starting bid</span>
                <span className="font-medium">${Number(auction.startBid).toLocaleString()}</span>
              </div>
              {auction.bidCount > 0 && (
                <div className="flex justify-between mt-1">
                  <span>Current bids</span>
                  <span className="font-medium">{auction.bidCount}</span>
                </div>
              )}
              <div className="flex justify-between mt-1">
                <span>End date</span>
                <span className="font-medium">{(() => {
                  const d = new Date(auction.endAt);
                  const date = d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
                  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                  return `${date} @ ${time}`;
                })()}</span>
              </div>
              {auction.bidCount > 0 && (
                <p className="mt-2 text-xs text-stone-400">Start bid and end date cannot be changed once bidding begins.</p>
              )}
            </div>

            <div>
              <label htmlFor="reservePrice" className={LABEL}>
                Reserve price (USD)
                <span className="ml-1 font-normal text-stone-400">— optional, hidden from buyers</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">$</span>
                <input
                  id="reservePrice"
                  name="reservePrice"
                  type="number"
                  min="1"
                  step="0.01"
                  defaultValue={auction.reservePrice ? Number(auction.reservePrice) : ""}
                  disabled={auctionClosed}
                  placeholder="0.00"
                  className={`${FIELD} pl-7 disabled:opacity-50`}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {/* Status info */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-stone-400">
          Status: <span className="font-medium text-stone-600">{listing.status}</span>
          {listing.status === "SOLD" && " — this listing cannot be edited"}
        </div>
        <div className="flex items-center gap-3">
          <a href="/seller/listings" className="text-sm text-stone-500 hover:text-stone-700 transition-colors">
            Cancel
          </a>
          <button
            type="submit"
            disabled={pending || listing.status === "SOLD"}
            className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
