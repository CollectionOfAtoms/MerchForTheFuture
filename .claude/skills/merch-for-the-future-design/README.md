# Merch for the Future — Design System

**Merch for the Future** is a direct-to-consumer apparel storefront selling sustainability-focused,
optimism-forward merchandise: exclusively human-made art, printed on GOTS-certified organic
cotton (and eventually hemp/linen), sold with the express intent of building hopeful visions of
the future instead of feeding climate fatalism. It also runs a fine-art marketplace (originals +
prints) alongside the apparel shop. It is built and operated by two founders as a custom Next.js
storefront — a deliberate alternative to Shopify, to avoid per-transaction platform fees and
dropshipper lock-in.

**"The material standard" (non-negotiable):** every product must be sustainably sourced *and*
biodegradable — natural fibers only, no synthetics, no synthetic blends. This is a brand
commitment as much as a supply-chain rule, and it shows up in the brand voice (see below).

**Source material for this design system:** a local, read-only mount of the product codebase
(`MerchForTheFuture/`, a Next.js 16 / React 19 / Tailwind v4 app; no public GitHub link was
given). Key files read: `spec/project-description.md` (vision, principles, full product model),
root `README.md`, `src/app/globals.css` (the live token source), `src/app/layout.tsx` (fonts),
`src/app/coming-soon/page.tsx` (public hero copy), `src/components/Nav.tsx`, `Footer.tsx`,
`NavDropdown.tsx`, `MobileMenu.tsx`, `ListingCard.tsx`, `ApparelListingCard.tsx`,
`ApparelProductView.tsx`, `discover/DiscoverBento.tsx`, `Carousel.tsx`, and the three sunburst
background illustrations in `assets/backgrounds/`. No Figma file or link was provided. The
codebase itself has no logo file (only Next.js's default placeholder SVGs in `public/`); the
real logo mark (`assets/logo-mark.jpg`) was supplied separately by the user.

---

## Index

- `styles.css` — root stylesheet; `@import`s everything below. Link this one file.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`
- `guidelines/` — 16 foundation specimen cards (Colors, Type, Spacing, Brand groups)
- `assets/backgrounds/` — the three sunburst illustrations, recolored per brand hue
- `components/` — 8 reusable primitives, grouped `forms/`, `feedback/`, `navigation/`, `cards/`
- `ui_kits/storefront/` — interactive click-through recreation of the storefront
- `SKILL.md` — portable skill file for use in Claude Code / other agent contexts

### Components

- **forms/** — `Button` (primary/secondary/dark pill), `Input` (labeled text field), `ColorSwatch`
  (circular color-variant picker), `SizeChip` (rectangular size picker)
- **feedback/** — `Badge` (status pill: auction/for-sale/sold/count)
- **navigation/** — `IconButton` (round chevron control for carousels)
- **cards/** — `ApparelCard` (shop grid tile), `ArtworkCard` (masonry gallery tile with hover
  reveal)

**Intentional additions:** none of these are literally componentized in the source (the app uses
inline Tailwind utility classes, not a shared component library) — the inventory above was
extracted from the *repeated patterns* across `Nav.tsx`, `ListingCard.tsx`,
`ApparelListingCard.tsx`, `ApparelProductView.tsx`, and `Carousel.tsx`, then generalized into
standard reusable primitives. Nothing here was invented independent of an observed pattern.

---

## Content Fundamentals

**Voice: hopeful provocation.** The brand wants to "reach the climate-anxious mainstream — people
who wish we were doing better," without requiring the reader to already be a radicalized
activist. Some copy is confrontational by design, meant to disrupt fatalism rather than alienate.

**Real examples, verbatim from the product:**
- Hero: *"We are living up to our name."*
- Tagline (page `<meta description>`): *"Feel better about the future and look good doing it."*
- Mission statement: *"To create apparel that communicate our values toward our planet and its
  inhabitants with humor, exclusively human-made art, helpful information, and design choices
  that minimize harm for the planet in the creation of our products, with the express intent of
  building hopeful visions of our future."*
- Shop description: *"Browse optimism-forward, 100% organic cotton apparel made with human-made
  art."*

**Patterns observed:**
- **First-person plural ("we/our"), not corporate third-person.** The mission statement and hero
  speak as the founders, not as "the company."
- **No emoji anywhere** in the UI copy, marketing copy, or transactional email templates.
- **Exclamation points are rare and deliberate**, not a default — most copy (button labels, empty
  states, form hints) is calm and declarative ("Nothing here yet — check back soon.", "Select a
  size to continue.").
- **Plain, warm, slightly wry** rather than "startup breezy." No forced puns, no growth-hacker
  urgency language ("Only 2 left!", "Limited time!").
- **Values-forward without preachiness** — sustainability claims are specific and matter-of-fact
  ("100% organic cotton", "exclusively human-made art") rather than vague green-washing
  adjectives.
- **Humor is named as a brand value** ("with humor...") even though most UI copy is fairly
  restrained — this is a direction for product/design copy (t-shirt slogans, product titles like
  a hypothetical "Solar Punk Bee") more than for transactional UI strings.

---

## Visual Foundations

**Color.** A single fixed 10-hue palette runs warm-to-cool like a sunrise settling into the sea:
strawberry-red → atomic-tangerine → carrot-orange → coral-glow → tuscan-sun → willow-green →
seagrass → dark-cyan → blue-slate → cerulean. These are used directly as brand/UI colors (nav bar
is tuscan-sun; primary links and CTAs are cerulean; secondary text is blue-slate/dark-cyan) — they
are *not* remapped by dark mode. Page chrome (background/surface/text/border) sits on top of a
separate semantic layer that *does* flip between a warm cream light theme and a three-tier dark
grey theme. There is no cool-purple or magenta anywhere in the system — avoid introducing one.

**Type.** Two families: **Zen Dots** (display — wordmark, hero headline, section headers; a
geometric dot-matrix face that reads as approachable, optimistic tech rather than
corporate/enterprise tech) and **Geist** (everything else — UI copy, body text, all button/label
text), with **Geist Mono** reserved for tabular/code-like content (order refs, SKUs). Body copy
runs small (14px is the dominant UI size) and calm; only the coming-soon hero goes large
(72–96px) and light-weight.

**Backgrounds.** Mostly flat semantic-token fills (cream page background, white cards) — no
gradients anywhere in the UI chrome. The one exception is a hand-drawn illustrated motif: a
radiating **sunburst / wave line-art pattern** (see `assets/backgrounds/`), recolored per section
(tangerine-on-gold, teal-on-seagrass, slate-on-cerulean) and used as a full-bleed section
backdrop (hero sections, apparel mockup backdrops) — organic, floral-adjacent, hand-illustrated,
never geometric or corporate. No photography grain, no stock-photo treatment; product photos
where they exist are natural daylight lifestyle shots, warm-neutral, uncorrected (not
color-graded cool or B&W).

**Corner radii.** Pills (`rounded-full`) for every actionable control — buttons, badges, tags,
color swatches. `rounded-2xl` for image/product cards and the masonry gallery. `rounded-xl` for
dropdown menus/popovers. `rounded-lg` for compact controls (size chips, text inputs) — the one
place radii are *not* fully pill-shaped.

**Shadows.** Minimal and functional, not decorative. Resting cards and buttons carry **no
shadow** — just a hairline border or a tinted flat fill (`bg-tuscan-sun/10`). A soft shadow
appears only as a **hover affordance** on interactive cards, and a heavier elevation shadow is
reserved for popovers/dropdown menus and the Discover bento hover pop-out card. There is no
persistent card-shadow-by-default anywhere.

**Animation.** Deliberate and purposeful, never decorative-only. Hover states use `transition-colors`
/ `transition-transform` at 200–500ms with standard easing (nothing bouncy or springy). The one
elaborate animation in the system is the Discover homepage's bento "unfold" — a hand-choreographed
750ms Web Animations API timeline where a grid tile grows into a full detail card on hover and
reverses on mouse-out (see `DiscoverBento.tsx`) — reserved for that one signature interaction, not
a pattern to reuse casually elsewhere.

**Hover states.** Image cards scale slightly (`scale-105`) on hover; text links shift to cerulean;
filled buttons darken one step (cerulean → dark-cyan, near-black → a lighter grey in dark mode).
Overlay-reveal cards (masonry gallery, bento tiles) slide a colored detail panel up from
`translate-y-full` to `translate-y-0`.

**Press / disabled states.** No visible "press" shrink effect observed — disabled controls simply
desaturate to a flat grey fill with muted text (never fully hidden), and sold-out color swatches
additionally grayscale + reduce opacity to ~40%.

**Borders.** Hairline (`1px`), always a tint of tuscan-sun in light mode (`border-tuscan-sun/30`
or `/40`) rather than a neutral grey — even structural chrome borders carry brand color. Dark
mode borders are a neutral mid-grey instead.

**Transparency / blur.** Used sparingly and functionally: dark semi-transparent scrims
(`bg-black/45`–`/75`) behind carousel controls and image captions for legibility over photos;
colored semi-transparent overlays (`bg-cerulean/90`) for the gallery hover-reveal panel. No
backdrop-blur/glassmorphism anywhere in the system.

**Layout rules.** Content is capped at `max-w-6xl` (spacing token `--content-max`) with `px-6`
page gutters; the coming-soon mission copy narrows further to `max-w-3xl`. The nav bar is a
static (non-sticky) top bar. Grids are responsive (2 → 3 → 4 columns) rather than fixed-width.

---

## Iconography

**No icon font, no icon library (Lucide/Heroicons/etc.), no PNG icon set.** Every icon in the
product is a small hand-written inline `<svg>` using a consistent stroke style: `fill="none"`,
`stroke="currentColor"`, `strokeWidth={2–2.5}`, `strokeLinecap="round"`, `strokeLinejoin="round"`
— chevrons (`<polyline>`), a hamburger (three `<line>`s), a shopping-cart glyph, a settings
chevron-down. This project's `components/navigation/IconButton.jsx` and the icon specimens in
`guidelines/iconography.card.html` follow that exact stroke recipe — **use it for any new icon
rather than pulling in an icon font or library.** Emoji are never used anywhere in the UI. No
Unicode symbol characters are used as icons either (the "×"/chevron-style glyphs are always real
SVG, not text glyphs).

---

## Fonts — substitution note

Both **Zen Dots** and **Geist** (plus **Geist Mono**) are genuine, currently-published Google
Fonts families — the exact ones the product uses via `next/font/google` — so `tokens/fonts.css`
loads them straight from Google Fonts' CDN (`@import url("https://fonts.googleapis.com/css2?...")`)
rather than substituting a look-alike. No font files needed vendoring. If you'd rather self-host
the actual `.woff2` binaries (e.g. for an offline build), let me know and I can pull them in.

---

## Caveats & how to help me improve this

- **Logo mark.** `assets/logo-mark.jpg` — the sunburst-over-solar-panel-grid mark supplied for
  the favicon — is now wired into the thumbnail, the nav bar, and `guidelines/brand-wordmark.card.html`
  alongside the Zen Dots wordmark. It was not in the original codebase (only Next.js's placeholder
  SVGs were), so if a vector/transparent version exists, send it over and I'll swap it in for
  crisper rendering at small sizes.
- **No real product photography.** The only real visual assets in the codebase are the three
  sunburst background illustrations; there are no actual apparel/artwork photos to pull from, so
  the UI kit's product tiles use flat color placeholders. Real product photos would meaningfully
  upgrade the Shop/Browse/Product screens.
- **The Discover bento "unfold" animation was not rebuilt pixel-for-pixel** in the UI kit (it's a
  genuinely complex hand-tuned WAAPI choreography) — the kit uses the simpler Browse masonry
  hover-reveal in its place. Say the word if you want the full bento interaction built out.
- **Components were inferred from repeated utility patterns, not a formal component library** —
  the codebase has no shared `Button`/`Card`/`Badge` components, just consistent Tailwind classes
  reused across files. I generalized 8 primitives from those patterns; flag any that don't match
  your intent and I'll adjust.
- **Dark mode exists in the source** (a full three-tier grey system) and is captured in the color
  tokens/specimen cards, but the UI kit itself is built light-mode-only for now — say if you want
  a dark-mode toggle wired into the kit.

Tell me what to fix first — logo, photography, the Discover interaction, or something else
entirely — and I'll iterate.
