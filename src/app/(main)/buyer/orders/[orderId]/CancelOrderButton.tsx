"use client";

import { useState, useTransition } from "react";
import { cancelOrderAction } from "@/app/actions/order";
import { useRouter } from "next/navigation";

export default function CancelOrderButton({ orderId }: { orderId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAction(orderId);
      if ("error" in result) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.refresh();
      }
    });
  }

  if (confirming) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-center space-y-3">
        <p className="text-sm text-red-700 font-medium">Are you sure? This cannot be undone.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3 justify-center">
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {isPending ? "Cancelling…" : "Yes, cancel order"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full rounded-full border border-stone-200 px-6 py-3 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
    >
      Cancel order
    </button>
  );
}
