## Epic MFTF-4: Platform Product Catalog

_Admin-only tooling. Founders define the approved product types (e.g. "Unisex Tee", "Tote Bag") that sellers see when creating listings. Each product type is backed by a specific dropshipper and SKU. Sellers never see dropshipper names or raw SKUs — they see only the curated product name._

_**Why this exists:** The catalog is tiny (3–5 items initially) but needs to be database-backed rather than config-file-based, because color availability changes over time and should not require a deploy to update._

### US-MFTF-4.1 — Product Type Schema

**As a** platform,
**I want** a `ProductType` model in the database,
**so that** the founder-curated catalog of printable products is persisted and queryable.

**Acceptance Criteria:**
- [ ] `ProductType` model added to Prisma schema with fields: `id`, `name` (e.g. "Unisex Tee"), `description`, `fulfillmentProvider` (enum: `TEEMILL | PRODIGI`), `providerSkuBase` (the base SKU or product ID on the dropshipper's side), `isActive` (boolean, defaults true), `createdAt`, `updatedAt`
- [ ] `ProductTypeColor` join model: `id`, `productTypeId`, `colorName`, `colorHex`, `providerColorCode` (dropshipper's internal color identifier), `isActive`
- [ ] `ProductTypeSizeOption` model: `id`, `productTypeId`, `sizeLabel` (e.g. "S", "M", "L", "XL"), `providerSizeCode`, `sortOrder`, `isActive`
- [ ] Schema applied via `prisma db push` (consistent with existing project convention)
- [ ] Seed file `prisma/seed-product-catalog.ts` creates at least one `ProductType` with associated colors and sizes for development and test use

**TDD Notes:**
- Test file: `__tests__/mftf-4-product-catalog/US-MFTF-4.1-product-type-schema.test.ts`
- Integration tests: seed a `ProductType` with colors and sizes, query it back, assert all fields round-trip correctly
- Test the seed file runs without error in the test database

---

### US-MFTF-4.2 — Admin Product Catalog Page

**As an** admin,
**I want** to view all product types in the platform catalog,
**so that** I can see what products are available for sellers to list.

**Acceptance Criteria:**
- [ ] A page at `/admin/products` is accessible only to admins; non-admins are redirected
- [ ] Lists all `ProductType` records with: name, fulfillment provider, number of active colors, number of active sizes, active/inactive status badge
- [ ] Each row links to a detail/edit page at `/admin/products/[productTypeId]`
- [ ] An "Add product type" button links to `/admin/products/new`
- [ ] Inactive product types are shown with a visual distinction (greyed out) but not hidden

**TDD Notes:**
- Test file: `__tests__/mftf-4-product-catalog/US-MFTF-4.2-admin-catalog-page.test.ts`
- Auth guard: non-admin receives redirect
- Data: seed two product types (one active, one inactive), assert both appear with correct status badge

---

### US-MFTF-4.3 — Create and Edit Product Type

**As an** admin,
**I want** to create and edit product types including their color and size options,
**so that** I can add new products to the catalog and update existing ones without a database migration.

**Acceptance Criteria:**
- [ ] Form at `/admin/products/new` and `/admin/products/[id]/edit` collects: name, description, fulfillment provider (dropdown: T-Mill / Prodigi), provider SKU base, active status
- [ ] Color management section: list of existing colors with name, hex preview swatch, provider color code, active toggle, and a delete button; an "Add color" inline form (name, hex, provider code)
- [ ] Size management section: list of sizes with label, provider size code, sort order, active toggle; an "Add size" inline form
- [ ] `createProductTypeAction` and `updateProductTypeAction` server actions validate required fields and persist changes
- [ ] `addProductTypeColorAction`, `toggleProductTypeColorAction`, `addProductTypeSizeAction`, `toggleProductTypeSizeAction` server actions handle the join model mutations
- [ ] Validation: name is required and unique; provider SKU base is required; at least one active color and one active size required before a product type can be set active
- [ ] On save, redirects to `/admin/products/[id]` with a success toast

**TDD Notes:**
- Test file: `__tests__/mftf-4-product-catalog/US-MFTF-4.3-create-edit-product-type.test.ts`
- Server action unit tests: validation rejections (missing name, duplicate name, activating with zero colors)
- Integration tests: create a product type, add a color, add a size, assert they persist
- Auth guard on all actions: non-admin returns `{ error: 'Unauthorized' }`
