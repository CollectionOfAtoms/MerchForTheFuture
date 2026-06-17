import Link from "next/link";

/**
 * Nav cart icon with a live item-count badge (US-MFTF-11.2). The `count` is
 * resolved server-side (`getCartCountForRequest`) and passed down; after an
 * add-to-cart the triggering client component calls `router.refresh()`, which
 * re-renders the server nav and flows a new count here — updating the badge
 * without a full page reload. Visible on both desktop and mobile.
 */
export default function CartBadge({ count }: { count: number }) {
  return (
    <Link
      href="/cart"
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
      className="relative inline-flex items-center text-blue-slate transition-colors hover:text-cerulean"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      {count > 0 && (
        <span
          data-testid="cart-badge-count"
          className="absolute -right-2 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-cerulean px-1 text-[0.625rem] font-semibold leading-none text-white"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
