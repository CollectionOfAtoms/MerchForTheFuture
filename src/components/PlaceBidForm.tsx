"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeBidAction } from "@/app/actions/auctions";

interface Props {
  auctionId: string;
  startBid: number;
  currentBid: number | null;
  currency: string;
}

export default function PlaceBidForm({ auctionId, startBid, currentBid, currency }: Props) {
  const minBid = currentBid ?? startBid;
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || isNaN(parsed)) {
      setStatus({ type: "error", message: "Please enter a valid bid amount." });
      return;
    }
    setStatus(null);
    startTransition(async () => {
      const result = await placeBidAction(auctionId, parsed);
      if ("error" in result) {
        setStatus({ type: "error", message: result.error });
      } else {
        setStatus({ type: "success", message: "Bid placed! You are now the highest bidder." });
        setAmount("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-stone-500 mb-1">
          Minimum bid:{" "}
          {minBid.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 })}
        </label>
        <input
          type="number"
          min={minBid}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`${Math.ceil(minBid)}`}
          disabled={isPending}
          className="w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-50"
        />
      </div>

      {status && (
        <p className={`text-sm ${status.type === "error" ? "text-rose-600" : "text-emerald-700"}`}>
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Placing bid…" : "Place Bid"}
      </button>
    </form>
  );
}
