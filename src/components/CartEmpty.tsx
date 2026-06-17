import Link from "next/link";

/** Empty-cart state (US-MFTF-11.4): a message plus links to keep shopping. */
export default function CartEmpty() {
  return (
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-10 text-center">
      <p className="text-stone-600">Your cart is empty.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href="/shop"
          className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700"
        >
          Shop apparel
        </Link>
        <Link
          href="/browse"
          className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-stone-500"
        >
          Browse art
        </Link>
      </div>
    </div>
  );
}
