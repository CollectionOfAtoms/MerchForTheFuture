"use client";

import { useTransition, useState } from "react";
import { deleteListingAction } from "@/app/actions/listings";

interface Props {
  listingId: string;
  isSold: boolean;
  hasBids: boolean;
}

export function DeleteListingButton({ listingId, isSold, hasBids }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const disabled = isSold || hasBids || isPending;

  function handleClick() {
    if (!window.confirm("This will permanently remove this listing and its images. This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteListingAction(listingId);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <span>
      <button
        onClick={handleClick}
        disabled={disabled}
        className="text-rose-600 hover:text-rose-800 disabled:text-stone-400 disabled:cursor-not-allowed text-sm"
        title={isSold ? "Cannot delete a sold listing" : hasBids ? "Cannot delete an auction with active bids" : "Delete listing"}
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="ml-2 text-rose-600 text-xs">{error}</span>}
    </span>
  );
}
