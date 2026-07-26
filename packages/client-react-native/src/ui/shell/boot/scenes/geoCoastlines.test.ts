import { expect, test } from "vitest";

import { GEO_CITIES, GEO_LANDMASSES } from "./geoCoastlines";

// This data was extracted mechanically from bootGeo.ts rather than retyped, so
// these guards are not checking my typing — they pin the shape and extent, so a
// future hand-edit or a re-run of the extractor against a changed source cannot
// quietly introduce a coastline with a spike in it.

test("the seven landmasses are present, in the source's polygon order", () => {
  expect(
    GEO_LANDMASSES.map((landmass) => {
      return landmass.name;
    }),
  ).toStrictEqual([
    "continent",
    "great-britain",
    "ireland",
    "sicily",
    "sardinia",
    "corsica",
    "zealand",
  ]);
});

test("every landmass is a polyline of at least three lon/lat points", () => {
  for (const landmass of GEO_LANDMASSES) {
    expect(landmass.points.length).toBeGreaterThan(2);
  }
});

test("the coastlines carry exactly the source's 270 points", () => {
  const total = GEO_LANDMASSES.reduce((sum, landmass) => {
    return sum + landmass.points.length;
  }, 0);

  expect(total).toBe(270);
});

// A transposed digit shows up as a point far outside the frame the map draws.
// These bounds are the measured extent of the extracted data, pinned — NOT a
// guess. If a point ever falls outside, the point is wrong; do not widen the
// bound to make it pass.
test("every coastline point sits inside the western-Europe frame", () => {
  for (const landmass of GEO_LANDMASSES) {
    for (const [lon, lat] of landmass.points) {
      expect(lon).toBeGreaterThanOrEqual(-10.4);
      expect(lon).toBeLessThanOrEqual(18.5);
      expect(lat).toBeGreaterThanOrEqual(36);
      expect(lat).toBeLessThanOrEqual(58.6);
    }
  }
});

test("the twelve capitals carry a name, a weight and a mapped position", () => {
  expect(GEO_CITIES).toHaveLength(12);

  for (const city of GEO_CITIES) {
    expect(city.name.length).toBeGreaterThan(0);
    expect(city.importance).toBeGreaterThan(0);
    expect(city.importance).toBeLessThanOrEqual(1);
    expect(city.lon).toBeGreaterThanOrEqual(-10.4);
    expect(city.lon).toBeLessThanOrEqual(18.5);
    expect(city.lat).toBeGreaterThanOrEqual(36);
    expect(city.lat).toBeLessThanOrEqual(58.6);
  }
});

test("the capitals are listed most-important first, as the web orders them", () => {
  expect(GEO_CITIES[0].name).toBe("LONDON");
  expect(GEO_CITIES[0].importance).toBe(1);
  expect(GEO_CITIES[1].name).toBe("PARIS");
});
