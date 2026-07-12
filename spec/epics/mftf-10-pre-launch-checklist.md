## Epic MFTF-10: Pre-Launch Checklist

_Operational and legal tasks required before the storefront goes live to the public. Most stories in this epic are human tasks — no automated tests. They are tracked here for visibility and dependency ordering, not for TDD. The storefront is considered live when US-MFTF-10.8 (remove under-construction page) is done; US-MFTF-10.9 (Search Console verification) is a post-go-live-adjacent step that can follow shortly after and does not block 10.8._

_**Dependency ordering:** 10.3 → 10.4 → 10.5 → 10.6 → 10.7 → 10.8. Steps 10.1 and 10.2 (database and API key swap) can happen in parallel once billing is in place and implementation epics are complete. 10.9 requires Epic MFTF-22 (SEO Foundation) to be complete and can happen any time after 10.8 (production domain must be live to verify)._

---

### US-MFTF-10.1 — Provision Separate Production Database

**As an** admin,
**I want** production to use its own dedicated database,
**so that** development activity does not risk corrupting live data.

**Acceptance Criteria:**
- [ ] A separate Neon database (or branch) is created for production
- [ ] `DATABASE_URL` in Vercel's production environment points to the production database
- [ ] Dev and preview environments continue to use separate databases
- [ ] Schema is applied to the production database via `prisma db push` before go-live

**TDD Notes:**
- Human task — no automated test. Verify manually by checking Vercel env vars and confirming a DB write in production does not appear in dev.

---

### US-MFTF-10.2 — Swap Sandbox API Keys for Live Keys

**As an** admin,
**I want** all three dropshipper and payment service integrations to use live credentials in production,
**so that** real orders are processed correctly.

**Acceptance Criteria:**
- [ ] Stripe live publishable key and secret key set in Vercel production env vars (replaces test keys)
- [ ] T-Mill live API key set in production env (Authorization header value + project param)
- [ ] Prodigi live API key set in production env
- [ ] Test/sandbox keys remain in `.env.local` and Vercel preview environments only
- [ ] Each service is smoke-tested after key rotation (Stripe: create a test checkout; T-Mill: hit `/product/options`; Prodigi: list catalog)

**TDD Notes:**
- Human task — no automated test. Supersedes/completes CHORE-4 ("Swap sandbox credentials for live before go-live").

---

### US-MFTF-10.3 — Register Merch for the Future as a Business

**As a** founder,
**I want** the business to be formally registered,
**so that** we can open a business bank account and complete tax setup with our payment and fulfillment partners.

**Acceptance Criteria:**
- [ ] Business entity registered (LLC or appropriate structure for the founders' situation)
- [ ] EIN obtained
- [ ] Business is in good standing and able to open a bank account

**TDD Notes:**
- Human task — no automated test. This is a prerequisite for US-MFTF-10.4 and US-MFTF-10.5.

---

### US-MFTF-10.4 — Open Merch for the Future Bank Account and Business Card

**As a** founder,
**I want** a dedicated business bank account and payment card,
**so that** business expenses and dropshipper charges are separated from personal finances.

**Acceptance Criteria:**
- [ ] Business checking account opened under the MFTF entity
- [ ] Business debit or credit card available for use with T-Mill, Prodigi, and other vendors
- [ ] Account and card details securely stored by both founders

**TDD Notes:**
- Human task — no automated test. Requires US-MFTF-10.3.

---

### US-MFTF-10.5 — Add Billing and Payout Information to Stripe, T-Mill, and Prodigi

**As a** founder,
**I want** all three platforms to have valid billing and payout information,
**so that** we can receive payments from buyers and be charged correctly by dropshippers.

**Acceptance Criteria:**
- [ ] Stripe account activation complete: business info, bank account for payouts, tax details (W-9 or equivalent) submitted
- [ ] T-Mill account has a valid payment method on file (MFTF business card)
- [ ] Prodigi account has a valid payment method on file (MFTF business card)
- [ ] All three accounts verified and in good standing before go-live

**TDD Notes:**
- Human task — no automated test. Requires US-MFTF-10.3 and US-MFTF-10.4.

---

### US-MFTF-10.6 — Order Samples and Finalize Product Selection

**As a** founder,
**I want** to evaluate physical samples of candidate products,
**so that** we can confirm print quality and fabric feel before listing them for sale.

**Acceptance Criteria:**
- [ ] Samples ordered from T-Mill (and Prodigi if apparel is being evaluated there) for each candidate product type
- [ ] Print quality, fabric feel, sizing, and color accuracy assessed against brand standard
- [ ] Product types to carry in the initial store selected and documented
- [ ] Selected product types entered into the admin product catalog (MFTF-4 epic) once implemented

**TDD Notes:**
- Human task — no automated test. Requires billing setup (US-MFTF-10.5). Informs and unblocks MFTF-4 admin catalog work.

---

### US-MFTF-10.7 — Create 10 Designs and Publish Listings on Production

**As a** founder/seller,
**I want** at least 10 original designs live on the production storefront,
**so that** the store has enough product to feel like a real shop at launch.

**Acceptance Criteria:**
- [ ] At least 10 original (human-made) apparel designs created
- [ ] Lifestyle photos taken from QA samples for each design
- [ ] Each design published as an active listing on production with correct colors, price, and photos
- [ ] All listings visually reviewed on production before the under-construction page is removed

**TDD Notes:**
- Human task — no automated test. Requires MFTF-5 (apparel listing creation flow) and MFTF-4 (product catalog) to be implemented. Requires live samples from US-MFTF-10.6.

---

### US-MFTF-10.8 — Remove Under-Construction Page and Go Live

**As a** founder,
**I want** to remove the under-construction gate and open the storefront to the public,
**so that** buyers can discover and purchase products.

**Acceptance Criteria:**
- [ ] The under-construction route guard (added in CHORE-15) is removed or disabled
- [ ] `/` (homepage) and `/shop` (apparel browse) are publicly accessible without any gate
- [ ] All other US-MFTF-10.x items confirmed complete
- [ ] A final smoke test on production covers: browse → product detail → checkout → order confirmation
- [ ] Both founders sign off before this step is executed

**TDD Notes:**
- Small code change to remove CHORE-15's gate, plus manual smoke test. All other pre-launch items are prerequisites.

---

### US-MFTF-10.9 — Verify Domain in Search Console / Webmaster Tools & Submit Sitemap

_Added 2026-07-11, alongside Epic MFTF-22 (SEO Foundation)._

**As a** founder,
**I want** the production domain verified in Google Search Console (and optionally Bing Webmaster Tools) with the sitemap submitted,
**so that** the site is actually discovered and indexed by search engines rather than relying on organic crawling alone.

**Acceptance Criteria:**
- [ ] Production domain is verified in Google Search Console (DNS TXT record, HTML file, or meta-tag method — founder's choice)
- [ ] The sitemap generated by US-MFTF-22.1 (`/sitemap.xml`) is submitted in Search Console
- [ ] Optionally, the same is repeated for Bing Webmaster Tools (lower priority; Google is the primary target)
- [ ] Structured data from US-MFTF-22.3 is spot-checked with Google's Rich Results Test on at least one product page and the About page, and any reported errors are logged as follow-up stories rather than silently ignored
- [ ] Both founders have access to the Search Console property (not a single-founder-only login)

**TDD Notes:**
- Human task — no automated test. Requires US-MFTF-22.1 (sitemap must exist) and benefits from US-MFTF-22.2/22.3 being complete so there's real metadata/structured data to verify. Sequenced late in MFTF-10 since it depends on the production domain being live.
