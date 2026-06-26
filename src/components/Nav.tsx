import Link from "next/link";
import { auth } from "@/auth";
import MobileMenu from "@/components/MobileMenu";
import NavDropdown from "@/components/NavDropdown";
import CartBadge from "@/components/CartBadge";
import ThemeToggle from "@/components/ThemeToggle";
import { getCartCountForRequest } from "@/lib/cart/request";
import { countSellerOriginalsToShip } from "@/lib/fulfillment/originals";
import { countDropshipExceptions } from "@/lib/fulfillment/admin";

const sharedLinks = [
  { href: "/shop", label: "Shop" },
  { href: "/browse", label: "Browse" },
  { href: "/browse?type=auction", label: "Auctions" },
  { href: "/browse?type=print", label: "Prints" },
];

export default async function Nav() {
  const session = await auth();
  const user = session?.user;
  const roles = (user as { roles?: string[] } | undefined)?.roles ?? [];
  const cartCount = await getCartCountForRequest();
  // Seller "Fulfillment" badge: originals awaiting shipment (US-MFTF-15.1).
  // Admin "Dropship exceptions" badge: FAILED dropship shipments (US-MFTF-15.2).
  const [fulfillmentCount, exceptionCount] = await Promise.all([
    user && roles.includes("SELLER") ? countSellerOriginalsToShip(user.id!) : Promise.resolve(0),
    user && roles.includes("ADMIN") ? countDropshipExceptions() : Promise.resolve(0),
  ]);
  return (
    <header className="border-b border-tuscan-sun/40 bg-tuscan-sun">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl tracking-tight text-cerulean">
          Merch for the Future
        </Link>

        {/* Desktop nav — Browse / Auctions / Prints always visible */}
        <nav className="hidden items-center gap-8 text-sm text-blue-slate sm:flex">
          {sharedLinks.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-cerulean transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          <CartBadge count={cartCount} />
          {user ? (
            <NavDropdown
              user={{ name: user.name, email: user.email }}
              roles={roles}
              fulfillmentCount={fulfillmentCount}
              exceptionCount={exceptionCount}
            />
          ) : (
            <>
              <Link
                href="/sign-in"
                className="hidden sm:block text-blue-slate hover:text-cerulean transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="hidden sm:block rounded-full bg-cerulean px-4 py-2 text-white hover:bg-dark-cyan transition-colors"
              >
                Sign up
              </Link>
            </>
          )}

          <MobileMenu
            user={user ? { name: user.name, email: user.email } : null}
            roles={roles}
            fulfillmentCount={fulfillmentCount}
            exceptionCount={exceptionCount}
          />
        </div>
      </div>
    </header>
  );
}
