## Epic 18: Image Upload & Processing Pipeline

### US-18.1 — Accept High-Resolution Artwork Uploads

**As a** seller,
**I want to** upload artwork images up to 70 MB in size,
**so that** I can provide the highest quality source file for display and print production.

**Acceptance Criteria:**
- The listing creation and edit forms accept image files up to 70 MB.
- Supported formats: JPEG, PNG, TIFF, WebP.
- Files are uploaded directly from the browser to cloud storage via a signed URL (no routing through the Next.js API server).
- A progress indicator is shown during upload.
- Files exceeding 70 MB are rejected with a clear error message before upload begins.
- Unsupported file formats are rejected client-side with a clear error message.

---

### US-18.2 — Automatic Image Variant Generation

**As a** platform,
**I want to** automatically generate three derivative image variants whenever a seller uploads artwork,
**so that** the correct resolution is served for each context without manual intervention.

**Acceptance Criteria:**
- On upload completion, a background job processes the source file and produces three variants:
  - **Display variant** (watermarked): resized to a maximum of 2400 px on the longest edge, JPEG quality 85, with a semi-transparent watermark applied (platform logo or "© [artist name]" text overlaid in the bottom-right corner).
  - **Grid variant** (un-watermarked): resized to a maximum of 800 px on the longest edge, JPEG quality 75. Used for masonry browse tiles.
  - **Thumbnail variant**: resized to exactly 400 × 400 px (cover crop), JPEG quality 70. Used for seller dashboard cards, order confirmations, and email thumbnails.
- All three variants are stored in cloud storage alongside the source file.
- The `ArtworkImage` database record is updated with URLs for each variant (`displayUrl`, `gridUrl`, `thumbnailUrl`).
- If variant generation fails, the original upload URL is used as a fallback so the listing is not blocked.
- Variant generation does not block the seller's save action — it runs asynchronously after the upload is confirmed.

### US-18.3 — Seller Can Regenerate Image Variants

**As a** seller,
**I want to** trigger variant regeneration for an existing listing image,
**so that** I can fix incorrectly processed variants (e.g. rotated images) without deleting and re-uploading the original.

**Acceptance Criteria:**
- A "Regenerate" button (↺) is visible on each image card in the listing edit page image section when the image is in the `done` state.
- Clicking "Regenerate" transitions the image to `processing` state (spinner shown, other controls disabled).
- On success, the image transitions back to `done` and its `displayUrl` is updated in local state.
- On failure, the image transitions to `error` state and an error message is displayed.
- The action verifies the requesting user is the listing's seller; unauthenticated or unauthorised calls return an error.
- The button is disabled while any other image in the set is uploading or processing.
