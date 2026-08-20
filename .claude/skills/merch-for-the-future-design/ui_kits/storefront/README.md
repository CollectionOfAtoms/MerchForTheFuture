# Storefront UI Kit

Click-through recreation of the Merch for the Future storefront (`src/app/(main)`), built from the codebase's actual pages and components — `Nav.tsx`, `Footer.tsx`, `ApparelListingCard.tsx`, `ApparelProductView.tsx`, `ListingCard.tsx`, `coming-soon/page.tsx`.

Screens (nav in `index.html` switches between them, no routing/build step):
- **Home** — the public coming-soon hero + mission section, plus a material-standard blurb.
- **Shop** — the `/shop` apparel grid (`ApparelListingCard` pattern).
- **Product** — the apparel detail page: color swatches, size chips, working add-to-cart state (`ApparelProductView.tsx`).
- **Browse** — the `/browse` fine-art masonry gallery with the cerulean hover-reveal overlay (`ListingCard.tsx`). Also stands in for `/discover` in this kit (the real Discover bento hover-unfold interaction is complex WAAPI choreography — out of scope for a click-through kit; see `DiscoverBento.tsx` in the source if rebuilding it).

Product photography is a solid-color placeholder block (no real product photos were provided) — swap for real imagery when available.
