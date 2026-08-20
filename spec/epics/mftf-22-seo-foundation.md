## Epic MFTF-22: SEO Foundation

_Adds the technical SEO layer the site currently lacks: a generated sitemap, robots.txt, complete per-page metadata (title/description/canonical/Open Graph/Twitter Card) across every public page, and Product/Organization structured data (JSON-LD). Scoped 2026-07-11 as the "full technical foundation" pass — the highest-leverage, mostly-code, largely one-time-setup layer of SEO, as distinct from ongoing content strategy (blog/journal), which is explicitly out of scope here and can be revisited later as its own epic if wanted._

_**Why this matters for a site this shape:** with a small, curated catalog run by two founders rather than a high-volume marketplace, the realistic SEO opportunities are (1) ranking for the brand name and the founders' names, (2) ranking in the specific niche (climate-optimist/solarpunk apparel, sustainably-sourced biodegradable clothing) rather than competing on long-tail keyword volume, and (3) making each listing well-formed enough to surface in Google Shopping-style rich results and image search. The real differentiated content this site already has — original art, a genuine sustainability story, identifiable founders (see Epic MFTF-20's About page) — is an SEO asset most templated dropshipping storefronts don't have; structured data is what lets search engines (and increasingly AI answer engines) actually parse and credit that content._

_**Current state (audited 2026-07-11):** the root layout has a static site-wide title/description; the apparel and artwork detail pages (`[listingId]`, `[id]`) already call `generateMetadata()` with a per-item title, truncated description, and a single Open Graph image. Nothing else exists: no sitemap.xml, no robots.txt, no canonical URLs anywhere, no `og:type`/`og:url`/site name/Twitter Card completeness, no metadata at all on `/shop`, `/browse`, `/discover`, `/prints`, or the new `/about`/`/contact` pages (MFTF-20/21), and zero structured data (JSON-LD) anywhere on the site._

_**Dependency:** Builds on the existing `generateMetadata()` calls (extends, does not replace, the two detail pages) and on `ApparelListing`/`Listing` (artwork) schema fields already in place (`retailPrice`, `status`, `images`, `title`, `description`). Sequenced after MFTF-20/MFTF-21 (About/Contact need to exist before they can be included in the sitemap and get metadata) and before the Pre-Launch Checklist (MFTF-10), since Search Console verification and sitemap submission — flagged as a manual task in MFTF-10 — depend on the sitemap existing first._

_**Also sequenced after Epic MFTF-24 (added 2026-08-17)**, which introduces category pages (`/shop/category/[slug]`), collection pages (`/shop/collections/[slug]`), a collections index (`/shop/collections`), and a path-aware product breadcrumb. Three knock-on effects on this epic, to be handled when it is worked: (1) **US-MFTF-22.1** — the new routes must be added to the sitemap (the category/collection slugs are database-driven, so they belong in the dynamic-query section, not the static list, and must respect `isActive`); (2) **US-MFTF-22.2** — each new route needs its own title/description, and the `from` query parameter must be excluded from canonical URLs (US-MFTF-24.6 already requires this from its side; state it here too so neither story assumes the other did it); (3) **US-MFTF-22.3** — the `BreadcrumbList` revision noted inline below._

### US-MFTF-22.1 — Sitemap & Robots.txt

**As a** search engine crawler,
**I want** a machine-readable sitemap and a robots.txt at the site root,
**so that** I can discover every public page and avoid crawling pages that shouldn't be indexed (checkout, cart, admin, auth).

**Acceptance Criteria:**
- [ ] `src/app/sitemap.ts` implements Next.js's `MetadataRoute.Sitemap` convention, served at `/sitemap.xml`
- [ ] Static public routes are always included: `/`, `/shop`, `/browse`, `/discover`, `/prints`, `/about`, `/contact`
- [ ] Dynamic routes are included by querying the database at build/request time: every `ApparelListing` with `status: ACTIVE` at `/shop/[listingId]`, every artwork `Listing` that is publicly viewable at `/artwork/[id]` — archived, draft, and sold-out-and-hidden listings are excluded (mirrors the same visibility rule the pages themselves already enforce; do not duplicate a second, divergent definition of "public")
- [ ] Each sitemap entry includes `lastModified` derived from the underlying record's `updatedAt`
- [ ] `src/app/robots.ts` implements Next.js's `MetadataRoute.Robots` convention, served at `/robots.txt`, allowing all crawlers on public routes and disallowing `/checkout`, `/cart`, `/admin`, `/sign-in`, `/sign-up`, `/verify-email`, `/seller` (any authenticated-only or transactional path)
- [ ] `robots.txt` references the sitemap URL (`Sitemap: https://<production-domain>/sitemap.xml`)
- [ ] The production domain used in absolute URLs is read from an environment variable (not hardcoded), so the sitemap/robots output is correct in preview/staging deployments without code changes

**TDD Notes:**
- Test file: `__tests__/mftf-22-seo/US-MFTF-22.1-sitemap-robots.test.ts`
- Unit tests: sitemap includes all static routes; sitemap includes an ACTIVE apparel listing and excludes an ARCHIVED one; robots.txt disallows `/admin` and `/checkout`, allows `/shop`
- Integration test: seed one ACTIVE and one ARCHIVED apparel listing, request the sitemap route handler output, assert only the ACTIVE listing's URL is present
- Note: Next.js's file-convention `sitemap.ts`/`robots.ts` are tested by importing and invoking the exported function directly (they are not React components), consistent with how other server-only utilities in this codebase are tested

---

### US-MFTF-22.2 — Complete Page Metadata (Title, Description, Canonical, Open Graph, Twitter Card)

**As a** person sharing or discovering a page from this site (via search, social media, or messaging apps),
**I want** every public page to have an accurate title, description, canonical URL, and social preview image,
**so that** search results and shared links show correct, appealing information instead of a generic or blank preview.

**Acceptance Criteria:**
- [ ] A shared metadata helper (`src/lib/seo/metadata.ts`) centralizes the site name, default OG image, and Twitter Card defaults, so every page builds on one source of truth rather than repeating boilerplate — this is a refactor-and-extend of the pattern already used ad hoc in the two existing `generateMetadata()` calls, not a parallel second system
- [ ] Root layout metadata (`src/app/layout.tsx`) gains `metadataBase` (set from the same production-domain env var as US-MFTF-22.1), a `title` template (e.g. `"%s — Merch For The Future"`) so child pages only need to set their own leaf title, `openGraph` (`type: "website"`, site name, default image), and `twitter` (`card: "summary_large_image"`)
- [ ] `/shop`, `/browse`, `/discover`, `/prints`, `/about`, and `/contact` each gain a `generateMetadata`/`metadata` export with a specific, human-written title and description (not a copy-pasted generic line repeated across pages — each description should actually describe that page's content)
- [ ] The two existing detail-page `generateMetadata()` calls (`/shop/[listingId]`, `/artwork/[id]`) are extended, not replaced: add `canonical` (via `alternates.canonical`), `openGraph.type: "product"` (or `"website"` if `"product"` is unsupported by the OG spec context — verify and use the correct type), `openGraph.url`, `openGraph.siteName`, and a `twitter` block reusing the existing OG image; the current title-truncation and single-image behavior is preserved, not rewritten
- [ ] Every public page's canonical URL is absolute and matches its actual served path exactly (no trailing-slash or query-string drift that would create duplicate-content signals)
- [ ] Pages that should not be indexed (checkout, cart, admin, auth — matching US-MFTF-22.1's robots disallow list) explicitly set `robots: { index: false, follow: false }` in their metadata as defense-in-depth alongside the robots.txt disallow rule, since robots.txt is a crawl directive but not a guaranteed de-indexing mechanism on its own

**TDD Notes:**
- Test file: `__tests__/mftf-22-seo/US-MFTF-22.2-page-metadata.test.ts`
- Unit tests: shared metadata helper produces the expected defaults; each of the six static pages' `generateMetadata`/`metadata` export returns a non-generic title and description (assert they differ from each other, not just that they exist — catches the copy-paste-boilerplate failure mode)
- Regression test: re-run the existing detail-page metadata tests (if any) or add coverage confirming `openGraph.images[0]` and the truncated description behavior from the current implementation still holds after the extension
- Unit test: checkout/cart/admin pages' metadata includes `robots: { index: false }`

---

### US-MFTF-22.3 — Structured Data (JSON-LD): Products, Organization, Breadcrumbs

**As a** search engine or AI answer engine,
**I want** machine-readable structured data describing products, the organization, and page hierarchy,
**so that** listings can appear as rich results (price, availability, image) and the brand/founders can be understood as an entity, not just page text.

**Acceptance Criteria:**
- [ ] A `<script type="application/ld+json">` block on `/shop/[listingId]` emits `schema.org/Product` structured data: `name` (title), `description`, `image` (array of listing image URLs), `offers` (`Product` → `Offer`: `price` from `retailPrice`, `priceCurrency: "USD"`, `availability` mapped from `status` — `ACTIVE` → `https://schema.org/InStock`, otherwise `OutOfStock`), `brand` (Organization name)
- [ ] The same pattern is applied to `/artwork/[id]` for print-eligible artwork listings, using the artwork's own price/availability fields
- [ ] `/about` emits `schema.org/Organization` (or `AboutPage` wrapping it) structured data including the site name, logo/default image, and `founder` entries (`Person`) for Elle Sparks and Jesse Caldwell — sourced from the `FounderBio` data already modeled in US-MFTF-20.2, not duplicated as separate hardcoded copy; Elle's `sameAs` array includes `https://ElleSparksCreations.com`
- [ ] `BreadcrumbList` structured data is added to `/shop/[listingId]` and `/artwork/[id]` reflecting the actual navigable path. **Revised 2026-08-17 by US-MFTF-24.6:** for `/shop/[listingId]`, the emitted trail is the **default** trail defined in US-MFTF-24.6 (`Home → Whatevs → [first collection, if any] → [listing title]`) — **not** the visitor-specific path-aware trail that story renders visibly, and not the `Home → Shop → [Product Title]` originally written here. The JSON-LD must describe the canonical URL, which carries no `from` parameter; emitting the visitor's path would make the structured data vary per request for a single canonical URL. `/artwork/[id]` is unaffected by MFTF-24 (apparel-only) and keeps a fixed `Home → Browse → [Artwork Title]`-style trail
- [ ] All structured data is generated server-side from the same data already fetched for page rendering (no duplicate/divergent data fetch just for the JSON-LD block) and is validated to be syntactically correct JSON (a malformed JSON-LD block is worse than none — search engines ignore the whole block on a parse error)
- [ ] Prices and availability in the structured data always match what the page visibly renders to the buyer — no story ships a JSON-LD price that can drift from the displayed price (single source of truth: `retailPrice`/`status`, read once)

**TDD Notes:**
- Test file: `__tests__/mftf-22-seo/US-MFTF-22.3-structured-data.test.ts`
- Unit tests: `Product` JSON-LD for an ACTIVE listing includes correct price/currency/availability; an ARCHIVED listing's availability maps to `OutOfStock`; `Organization` JSON-LD includes both founders sourced from `FounderBio` rows (integration point with US-MFTF-20.2 — if 20.2 has not shipped yet, this story is blocked and should be sequenced after it)
- Parse test: render each page's JSON-LD script tag content through `JSON.parse()` in the test and assert it does not throw — catches malformed output before it ships
- Consistency test: assert the JSON-LD price equals the visibly rendered price on the same page render (prevents drift between the two)
- Note: schema.org validation beyond JSON-parseability (e.g. via Google's Rich Results Test) is a manual pre-launch verification step, not an automated test — flag as a manual check in MFTF-10 alongside Search Console verification
