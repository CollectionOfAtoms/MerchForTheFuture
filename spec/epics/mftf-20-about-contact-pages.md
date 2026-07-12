## Epic MFTF-20: About & Contact Pages

_Adds two public marketing pages: `/about` (vision, founder bios, material-standard commitment) and `/contact` (a feedback form emailing the founders). Independent of the fulfillment/checkout critical path; sequenced after MFTF-19 (storefront polish) and before the Pre-Launch Checklist (MFTF-10) since a public-facing site should have both before go-live._

_**Scope decision (spec session 2026-07-11):** The About page's "Who We Are" section is **admin-editable**, not hardcoded copy — bios (rich text) and photos (oval-framed) for both founders are managed through an admin surface, reusing the existing Vercel Blob image pipeline. The vision/goals and material-standard sections are **also admin-editable**, making this effectively a small CMS for the About page rather than three static JSX blocks. This is a heavier scope than a typical "about page" ask — flagged here so the tracker reflects the real size of US-MFTF-20.2._

_**Dependency:** Reuses the existing image variant pipeline (`src/lib/artworks/variants.ts`, US-18.2/US-1.3-style corner-crop handling) for bio photos, and the MailerSend transactional-email path (Epic 6/22 pattern, `src/lib/email/`) for the contact form. No schema dependency on any fulfillment epic — can be built in parallel with anything else in the sequence._

### US-MFTF-20.1 — About Page: Static Public Layout & Content Rendering

**As a** visitor,
**I want** an `/about` page with three scrollable sections — vision & goals, Who We Are (founder bios), and the material-standard commitment,
**so that** I understand what Merch for the Future stands for and who's behind it before I decide to buy.

**Acceptance Criteria:**
- [ ] `/about` renders three sections in fixed vertical order: (1) Vision & Goals, (2) Who We Are, (3) Material Standard & Sustainability Commitment
- [ ] Section 1 (Vision & Goals) renders admin-managed rich-text content (see US-MFTF-20.2) — page must render sensible fallback copy if no admin content has been saved yet (empty state is not a broken page)
- [ ] Section 2 (Who We Are) renders two founder bio cards in order: **Elle Sparks** first, **Jesse Caldwell** second. Order is fixed in this story; reordering is not in scope
- [ ] Elle Sparks's bio card includes an outbound link to `https://ElleSparksCreations.com` that opens in a new tab
- [ ] Each bio card displays the founder's photo inside an **oval-shaped frame** (CSS `border-radius` clip, not a cropped source image) and their admin-managed rich-text bio beside or below it
- [ ] If a founder's photo has not been uploaded yet, the oval frame renders a placeholder (initials or generic avatar) rather than a broken image
- [ ] Section 3 (Material Standard) renders admin-managed rich-text content explaining the sustainably-sourced + biodegradable standard (see project_description.md → Design Principles for the source commitment being communicated to buyers)
- [ ] Page is responsive: sections stack cleanly on mobile, oval frames scale down without distorting to non-oval
- [ ] `/about` is linked from the site's primary navigation and/or footer

**TDD Notes:**
- Test file: `__tests__/mftf-20-about-contact/US-MFTF-20.1-about-page-layout.test.tsx`
- Component tests: three sections render in order; Elle's outbound link has `target="_blank"` and the correct href; oval frame renders via CSS class/style assertion, not a snapshot of pixels; missing-photo fallback renders instead of a broken `<img>`
- Empty-state test: page renders without erroring when no admin content exists for any section (asserts fallback copy shown, not a crash)
- This story ships against whatever `AboutPageContent`/`FounderBio` shape US-MFTF-20.2 defines — sequence 20.2 before 20.1 if implementing literally, or stub the read model here and wire it in 20.2; TDD Notes assume 20.2 lands first per the schema-then-UI convention used elsewhere in this tracker (e.g. MFTF-13.1 before MFTF-13.3)

---

### US-MFTF-20.2 — About Page: Admin-Editable Content (Bios, Photos, Section Copy)

**As an** admin (founder),
**I want** to edit the About page's vision/goals copy, material-standard copy, and both founder bios (text + photo) through an admin UI,
**so that** the page can be kept current without a code change and a redeploy every time a founder's bio or a photo changes.

**Acceptance Criteria:**
- [ ] A new `AboutPageContent` model (or equivalent) persists the three section bodies: `visionContent` (rich text), `materialStandardContent` (rich text) — singleton rows, not per-founder
- [ ] A new `FounderBio` model persists: `id`, `name`, `bioContent` (rich text), `photoUrl` (nullable, Blob-hosted), `displayOrder` (Int, seeded so Elle Sparks = 0, Jesse Caldwell = 1), `personalWebsiteUrl` (nullable String — populated for Elle with `https://ElleSparksCreations.com`; nullable because not every founder need have one)
- [ ] Admin page at `/admin/about` provides: a rich-text editor for Vision & Goals, a rich-text editor for Material Standard, and one edit form per `FounderBio` row (rich-text bio + photo upload + personal website URL field)
- [ ] Rich-text editor supports at minimum bold, italic, and links — consistent with the "rich text bios" scope decision; stored as sanitized HTML or a structured format, not raw unescaped user input rendered directly (XSS-safe rendering on the public page is required)
- [ ] Photo upload reuses the existing Vercel Blob pipeline (`src/lib/artworks/variants.ts` pattern): image is processed into a variant sized/cropped appropriately for the oval frame (e.g. a square or circle-safe crop) before the public page renders it inside the CSS oval clip
- [ ] Saving any section updates immediately reflects on the public `/about` page (no cache requiring a redeploy; standard Next.js revalidation is acceptable)
- [ ] Only admin-role users can access `/admin/about` or call the underlying server actions; non-admin/unauthenticated callers receive `{ error: 'Unauthorized' }`
- [ ] Seed/migration ships with placeholder starter content for both bios and both static sections so `/about` is never empty in a fresh environment (satisfies US-MFTF-20.1's empty-state requirement without depending on founders having entered real content yet)

**TDD Notes:**
- Test file: `__tests__/mftf-20-about-contact/US-MFTF-20.2-about-admin-content.test.ts`
- Integration tests: create/update `AboutPageContent` and `FounderBio` rows, assert round-trip; photo upload produces a Blob URL and a stored `photoUrl`
- Unit tests: non-admin caller rejected; rich-text sanitization strips a `<script>` injection test payload
- Component test: admin form renders both founder bios in `displayOrder`, saves and reflects updated bio text/photo without a full page reload assumption baked into the test (assert the server action call and resulting data, not implementation-specific revalidation mechanics)
- Seed test: fresh `resetDatabase()` + seed produces non-empty `AboutPageContent` and two `FounderBio` rows
