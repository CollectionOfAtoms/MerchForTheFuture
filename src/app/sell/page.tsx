import Link from "next/link";

const options = [
  {
    title: "Fixed Price",
    description: "Set your price and sell directly to buyers. Funds hit your account once the sale clears.",
    status: "Coming soon",
  },
  {
    title: "Auction",
    description: "Set a start bid and optional reserve. Buyers compete — you get the best price the market will bear.",
    status: "Coming soon",
  },
  {
    title: "Prints",
    description: "Upload high-res files and offer museum-quality prints on demand. No inventory, no shipping hassle.",
    status: "Coming soon",
  },
];

export default function SellPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-xl mb-12">
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">Sell on Art & Sol</h1>
        <p className="text-stone-500">
          List originals, run auctions, or offer prints. You control how your work reaches collectors.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        {options.map((opt) => (
          <div key={opt.title} className="rounded-2xl border border-stone-200 bg-white p-6">
            <p className="font-semibold text-stone-900 mb-1">{opt.title}</p>
            <p className="text-sm text-stone-500 leading-relaxed mb-4">{opt.description}</p>
            <span className="text-xs font-medium text-stone-400 bg-stone-100 rounded-full px-2.5 py-1">
              {opt.status}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-stone-900">Ready to get started?</p>
          <p className="text-sm text-stone-500 mt-0.5">Create an account to set up your seller profile.</p>
        </div>
        <Link
          href="/sign-up"
          className="shrink-0 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}
