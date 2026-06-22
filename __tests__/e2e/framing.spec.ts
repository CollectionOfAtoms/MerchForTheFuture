import { test, expect } from "@playwright/test";
import { ensureSeller, seedFramingListing, getFraming, cleanupArtwork, type SeededFramingListing } from "./helpers/db";

/**
 * US-MFTF-PF.3 — the drag/resize crop interaction (the only part of the framing tool
 * not unit-coverable; the geometry + server crop are covered by vitest). Drives the
 * real crop box in a seller session and asserts the confirmed crop persists.
 */
test.describe("Interactive framing tool", () => {
  let seeded: SeededFramingListing | undefined;

  test.beforeAll(() => {
    const seller = ensureSeller();
    seeded = seedFramingListing(seller.id);
  });

  test.afterAll(() => {
    cleanupArtwork(seeded?.artworkId);
  });

  test("drag + resize the crop box, confirm, and persist the crop", async ({ page }) => {
    test.skip(!seeded, "seed failed");
    await page.goto(`/seller/listings/${seeded!.listingId}/edit`);

    // The offered canvas aspect (8×10 → 4:5) renders in the framing panel.
    await page.getByRole("button", { name: /frame this aspect/i }).click();

    // The crop box only mounts after the source <img> fires `load` (which sets the
    // initial rect). Wait on that precondition rather than racing the default timeout.
    const sourceImg = page.getByAltText("Print source");
    await expect(sourceImg).toBeVisible();
    await expect
      .poll(() => sourceImg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);

    const cropBox = page.getByTestId("crop-box");
    await expect(cropBox).toBeVisible();

    // Drag the crop box, then resize via its handle.
    const box = await cropBox.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2 + 10, { steps: 5 });
    await page.mouse.up();

    const handle = page.getByTestId("crop-resize-handle");
    const hb = await handle.boundingBox();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb!.x - 40, hb!.y - 40, { steps: 5 });
    await page.mouse.up();

    await page.getByTestId("confirm-framing").click();
    await expect(page.getByText(/framing saved/i)).toBeVisible({ timeout: 30_000 });

    // Server is the source of truth — the 4:5 aspect is now framed.
    const framing = getFraming(seeded!.artworkId);
    expect(framing.framed).toContain("4:5");
  });
});
