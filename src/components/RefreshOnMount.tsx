"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server tree once on mount via router.refresh(). Used on the cart
 * confirmation page: the cart is cleared during that page's server render, but the
 * layout's Nav (and its cart badge) already rendered with the pre-clear count.
 * A single refresh re-fetches the Nav so the badge reflects the now-empty cart.
 * Safe: router.refresh() doesn't remount client components, so the effect runs once.
 */
export default function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
