import { getLanguage } from "./i18n.js";

let names = {};
export function registerNames(catalogue) { names = catalogue; }
export function placeName(item) {
  const key = typeof item === "string" ? item : item.name;
  return names[key]?.[getLanguage()] ?? key;
}
export function nameVariants(item) {
  const entry = names[item.name] ?? {};
  return [item.name, ...(item.aliases ?? []), entry.de, entry.en, ...(entry.aliases ?? [])].filter(Boolean);
}

