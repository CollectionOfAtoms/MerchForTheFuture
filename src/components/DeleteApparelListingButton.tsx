"use client";

import { useTransition, useState } from "react";
import { deleteApparelListingAction } from "@/app/actions/apparel";

interface Props {
  listingId: string;
  isSold: boolean;
}

export function DeleteApparelListingButton({ listingId, isSold }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const disabled = isSold || isPending;

  function handleClick() {
    if (!window.confirm("This will permanently remove this listing, its photos, and its design file. This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteApparelListingAction(listingId);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <span>
      <button
        onClick={handleClick}
        disabled={disabled}
        className="text-rose-600 hover:text-rose-800 disabled:text-stone-400 disabled:cursor-not-allowed text-sm"
        title={isSold ? "Cannot delete a sold listing" : "Delete listing"}
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="ml-2 text-rose-600 text-xs">{error}</span>}
    </span>
  );
}
