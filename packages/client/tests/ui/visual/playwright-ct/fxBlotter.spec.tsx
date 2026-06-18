import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("fx-blotter/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="fx-blotter/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("fx-blotter/highlighted-row", async ({ mount }) => {
  const c = await mount(<VisualScenario name="fx-blotter/highlighted-row" />);
  await expect(c).toHaveScreenshot("highlighted-row.png", { animations: "disabled" });
});

test("fx-blotter/non-highlighted-row", async ({ mount }) => {
  const c = await mount(<VisualScenario name="fx-blotter/non-highlighted-row" />);
  await expect(c).toHaveScreenshot("non-highlighted-row.png", {
    animations: "disabled",
  });
});

test("fx-blotter/sorted", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/sorted" />);
  await page.getByTestId("blotter-sort-notional").click();
  await expect(c).toHaveScreenshot("sorted.png", { animations: "disabled" });
});

test("fx-blotter/filtered", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/filtered" />);
  await page.getByTestId("blotter-filter-toggle-notional").click();
  await page.getByTestId("number-filter-value").fill("1000000");
  await page.getByTestId("number-filter-apply").click();
  await expect(page.getByText("Filtered: Notional")).toBeVisible();
  await expect(c).toHaveScreenshot("filtered.png", { animations: "disabled" });
});

test("fx-blotter/no-match", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/no-match" />);
  await page.getByTestId("blotter-filter-toggle-notional").click();
  await page.getByTestId("number-filter-value").fill("1");
  await page.getByTestId("number-filter-apply").click();
  await expect(page.getByText("No trades match the current filters")).toBeVisible();
  await expect(c).toHaveScreenshot("no-match.png", { animations: "disabled" });
});

test("fx-blotter/filter-date", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/filter-date" />);
  await page.getByTestId("blotter-filter-toggle-tradeDate").click();
  await expect(c).toHaveScreenshot("filter-date.png", { animations: "disabled" });
});

test("fx-blotter/filter-number", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/filter-number" />);
  await page.getByTestId("blotter-filter-toggle-notional").click();
  await expect(c).toHaveScreenshot("filter-number.png", { animations: "disabled" });
});

test("fx-blotter/filter-set", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/filter-set" />);
  await page.getByTestId("blotter-filter-toggle-status").click();
  await expect(c).toHaveScreenshot("filter-set.png", { animations: "disabled" });
});
