"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Ended";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function AuctionCountdown({ endAt }: { endAt: Date }) {
  const [remaining, setRemaining] = useState(() => new Date(endAt).getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(new Date(endAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [endAt]);

  const ended = remaining <= 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-stone-500">Time remaining:</span>
      <span
        className={`text-sm font-semibold ${ended ? "text-rose-600" : remaining < 3600000 ? "text-amber-600" : "text-stone-900"}`}
      >
        {formatRemaining(remaining)}
      </span>
    </div>
  );
}
