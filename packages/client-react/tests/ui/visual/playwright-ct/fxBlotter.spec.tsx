import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("fx-blotter/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="fx-blotter/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("fx-blotter/highlighted-row", async ({ mount }) => {
  const c = await mount(<VisualScenario name="fx-blotter/highlighted-row" />);
  await expect(c).toHaveScreenshot("highlighted-row.png", {
    animations: "disabled",
  });
});

test("fx-blotter/non-highlighted-row", async ({ mount }) => {
  const c = await mount(
    <VisualScenario name="fx-blotter/non-highlighted-row" />,
  );
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
  await expect(
    page.getByText("No trades match the current filters"),
  ).toBeVisible();
  await expect(c).toHaveScreenshot("no-match.png", { animations: "disabled" });
});

test("fx-blotter/filter-date", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/filter-date" />);
  await page.getByTestId("blotter-filter-toggle-tradeDate").click();
  await expect(c).toHaveScreenshot("filter-date.png", {
    animations: "disabled",
  });
});

test("fx-blotter/filter-number", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/filter-number" />);
  await page.getByTestId("blotter-filter-toggle-notional").click();
  await expect(c).toHaveScreenshot("filter-number.png", {
    animations: "disabled",
  });
});

test("fx-blotter/filter-set", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/filter-set" />);
  await page.getByTestId("blotter-filter-toggle-status").click();
  await expect(c).toHaveScreenshot("filter-set.png", {
    animations: "disabled",
  });
});

test("fx-blotter/sorted-asc", async ({ mount, page }) => {
  // A text column (CCYCCY) sorts ascending on the first click → the ▲ arm.
  const c = await mount(<VisualScenario name="fx-blotter/sorted-asc" />);
  await page.getByTestId("blotter-sort-currencyPair").click();
  await expect(c).toHaveScreenshot("sorted-asc.png", {
    animations: "disabled",
  });
});

test("fx-blotter/filter-date-range", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="fx-blotter/filter-date-range" />);
  await page.getByTestId("blotter-filter-toggle-tradeDate").click();
  await page.getByTestId("date-filter-comparator").selectOption("inRange");
  await page.getByTestId("date-filter-value").fill("2026-06-01");
  await page.getByTestId("date-filter-value-to").fill("2026-06-30");
  await page.getByTestId("date-filter-apply").click();
  await expect(page.getByText("Filtered: Trade Date")).toBeVisible();
  await expect(c).toHaveScreenshot("filter-date-range.png", {
    animations: "disabled",
  });
});

test("fx-blotter/filter-number-range", async ({ mount, page }) => {
  const c = await mount(
    <VisualScenario name="fx-blotter/filter-number-range" />,
  );
  await page.getByTestId("blotter-filter-toggle-notional").click();
  await page.getByTestId("number-filter-comparator").selectOption("inRange");
  await page.getByTestId("number-filter-value").fill("1000000");
  await page.getByTestId("number-filter-value-to").fill("6000000");
  await page.getByTestId("number-filter-apply").click();
  await expect(page.getByText("Filtered: Notional")).toBeVisible();
  await expect(c).toHaveScreenshot("filter-number-range.png", {
    animations: "disabled",
  });
});
