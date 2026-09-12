import { registerNames } from "./names.js";

const FILES = {
  names: "./names.json",
  cantonGeometry: "./cantons.geojson",
  cantons: "./cantons.json",
  rivers: "./rivers.geojson",
  lakes: "./lakes.geojson",
  cities: "./cities.json",
  mountains: "./mountains.json",
  passes: "./passes.json"
};

const EXPECTED_COUNTS = {
  cantons: 26,
  cantonGeometry: 26,
  rivers: 16,
  lakes: 15,
  cities: 22,
  mountains: 14,
  passes: 16
};

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Impossibile caricare ${path} (HTTP ${response.status})`);
  return response.json();
}

function countEntries(value) {
  return Array.isArray(value) ? value.length : value?.features?.length ?? 0;
}

function validateData(data) {
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = countEntries(data[key]);
    if (actual !== expected) throw new Error(`Dataset ${key}: attesi ${expected} elementi, trovati ${actual}.`);
  }

  for (const group of [data.cities, data.mountains, data.passes]) {
    for (const item of group) {
      if (!item.name || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) {
        throw new Error("Un elemento geografico puntuale è incompleto.");
      }
    }
  }
}

export async function loadGeographyData() {
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, path]) => [key, await loadJson(path)]));
  const data = Object.fromEntries(entries);
  validateData(data);
  registerNames(data.names);
  return data;
}
