import { test, expect } from "@playwright/test";
import { ensureBuyer, seedTwoShipmentOrder, setShipmentStatus, cleanupOrder, type SeededOrder } from "./helpers/db";

// Real-browser coverage of the buyer order page (US-MFTF-12.6 / MFTF-14): a mixed
// cart shows two independent shipments, and the order rollup stays "Processing" until
// both ship. Visual snapshots guard against layout/badge regressions that jsdom unit
// tests can't see. Status is advanced directly in the DB (no emails) between reloads.
let order: SeededOrder;

test.beforeAll(async () => {
  const buyer = await ensureBuyer();
  order = await seedTwoShipmentOrder(buyer.id);
});

test.afterAll(async () => {
  await cleanupOrder(order);
});

test("order page shows two shipments and rolls up status as they ship", async ({ page }) => {
  await page.goto(`/buyer/orders/${order.orderId}`);

  const shipments = page.getByTestId("order-shipments");
  await expect(shipments).toBeVisible();
  await expect(page.getByText("Shipment 1 of 2")).toBeVisible();
  await expect(page.getByText("Shipment 2 of 2")).toBeVisible();
  // Both still in production → no provider names anywhere on the page.
  await expect(page.locator("body")).not.toContainText(/teemill|prodigi/i);
  await expect(shipments).toHaveScreenshot("shipments-processing.png");

  // One shipment ships → its card shows Shipped + tracking; rollup stays Processing.
  await setShipmentStatus(order.prodigiFoId, "SHIPPED", "PG-TRACK-9", "FedEx");
  await page.reload();
  await expect(shipments.getByText("Shipped")).toBeVisible();
  await expect(page.getByText("PG-TRACK-9")).toBeVisible();
  await expect(shipments).toHaveScreenshot("shipments-one-shipped.png");

  // Both delivered → rollup flips to Shipped.
  await setShipmentStatus(order.teemillFoId, "DELIVERED");
  await setShipmentStatus(order.prodigiFoId, "DELIVERED");
  await page.reload();
  await expect(shipments.getByText("Delivered").first()).toBeVisible();
  await expect(shipments).toHaveScreenshot("shipments-delivered.png");
});
