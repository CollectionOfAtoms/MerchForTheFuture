## Epic 19: Artwork Image Lightbox & Magnifier

### US-19.1 — Open Image Lightbox from Artwork Detail Page

**As a** buyer,
**I want to** click on the artwork image on the detail page to open it in a full-screen lightbox,
**so that** I can view the artwork as large as possible on my screen.

**Acceptance Criteria:**
- Clicking any image on the artwork detail page opens a lightbox overlay.
- The lightbox displays the **display variant** (watermarked, high-resolution) image centred on screen.
- The image is scaled to fill as much of the viewport as possible while maintaining aspect ratio.
- The page behind the lightbox is darkened with a semi-transparent backdrop.
- Clicking the backdrop (outside the image) closes the lightbox.
- The cursor on the artwork thumbnail changes to indicate it is clickable (e.g., `cursor-zoom-in`).

---

### US-19.2 — Carousel Navigation Inside Lightbox

**As a** buyer viewing an artwork's lightbox,
**I want to** cycle through all images for that artwork using arrow keys or swipe gestures,
**so that** I can inspect every photo without closing the lightbox.

**Acceptance Criteria:**
- When multiple images exist, left/right arrow buttons are shown inside the lightbox.
- Pressing the left/right arrow keys on the keyboard navigates to the previous/next image.
- Swiping left or right on touch devices navigates to the previous/next image.
- Navigation wraps around (last image → first, first image → last).
- The current image index is indicated (e.g., "2 / 5").
- When only one image exists, navigation controls are hidden.

---

### US-19.3 — Close Lightbox

**As a** buyer viewing the lightbox,
**I want to** close it easily,
**so that** I can return to the artwork detail page.

**Acceptance Criteria:**
- A close button (× icon) is displayed in the top-right corner of the lightbox.
- Pressing the Escape key closes the lightbox.
- Clicking the backdrop closes the lightbox.
- When the lightbox is open, body scroll is locked to prevent the page scrolling behind it.
- Closing the lightbox restores the page to its previous scroll position.

---

### US-19.4 — Magnifier Lens on Hover in Lightbox

**As a** buyer viewing an artwork in the lightbox,
**I want to** hover my mouse over the image and see a magnified view of the area under my cursor,
**so that** I can inspect fine detail and brushwork in the artwork.

**Acceptance Criteria:**
- When the user moves their mouse over the lightbox image, a circular magnifier lens appears following the cursor.
- The lens displays the portion of the image underneath the cursor at approximately 2–3× zoom.
- The magnifier uses the full-resolution **display variant** as its source to ensure detail is sharp.
- The magnifier does not appear on touch devices (where pinch-to-zoom is the native equivalent).
- The magnifier disappears when the cursor leaves the image.
- The lens has a clearly defined border so it is visually distinct from the image behind it.
