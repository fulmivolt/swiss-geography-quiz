import { t, getLanguage } from "./i18n.js";
import { placeName, nameVariants } from "./names.js";

export const QUIZ_CATALOG = [
  { id: "cantons", number: "01", icon: "⬡", title: "Cantoni", description: "Riconosci tutti i 26 cantoni dai loro confini reali.", count: 26, category: "CANTONI", geometry: "area" },
  { id: "capitals", number: "02", icon: "◎", title: "Capitali cantonali", description: "Associa ogni cantone alla sua capitale e localizzala.", count: 26, category: "CAPITALI", geometry: "point" },
  { id: "cities", number: "03", icon: "●", title: "Città", description: "Trova 22 città e scegli se aggiungere anche i 26 capoluoghi cantonali.", count: 22, category: "CITTÀ", geometry: "point" },
  { id: "waters", number: "04", icon: "≈", title: "Fiumi e laghi", description: "Segui corsi d’acqua e riconosci i profili dei laghi.", count: 31, category: "ACQUE", geometry: "water" },
  { id: "rivers", number: "05", icon: "∿", title: "Fiumi", description: "Segui separatamente i 16 fiumi del quiz.", count: 16, category: "FIUMI", geometry: "water" },
  { id: "lakes", number: "06", icon: "◒", title: "Laghi", description: "Riconosci separatamente i profili dei 15 laghi.", count: 15, category: "LAGHI", geometry: "water" },
  { id: "mountains", number: "07", icon: "▲", title: "Montagne", description: "Localizza 14 vette con coordinate e altitudini reali.", count: 14, category: "MONTAGNE", geometry: "point" },
  { id: "passes", number: "08", icon: "◇", title: "Passi alpini", description: "Impara 16 valichi lungo l’arco alpino svizzero.", count: 16, category: "PASSI", geometry: "point" }
];

export const shuffle = (items) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
};

export function buildItems(quizId, data, { includeCapitals = false } = {}) {
  if (quizId === "cantons") return data.cantons.map((item) => ({ ...item, key: item.name }));
  if (quizId === "capitals") {
    return data.cantons.map((canton) => ({
      ...canton.capital,
      key: canton.capital.name,
      cantonName: canton.name,
      cantonId: canton.id
    }));
  }
  if (quizId === "cities") {
    const cities = data.cities.map((item) => ({ ...item, key: item.name }));
    if (!includeCapitals) return cities;
    const capitals = data.cantons.map((canton) => ({
      ...canton.capital,
      key: canton.capital.name,
      cantonName: canton.name,
      cantonId: canton.id,
      isCantonalCapital: true
    }));
    return [...cities, ...capitals];
  }
  if (quizId === "mountains") return data.mountains.map((item) => ({ ...item, key: item.name, markerType: "mountain" }));
  if (quizId === "passes") return data.passes.map((item) => ({ ...item, key: item.name, markerType: "pass" }));
  if (["waters", "rivers", "lakes"].includes(quizId)) {
    const features = quizId === "rivers"
      ? data.rivers.features
      : quizId === "lakes"
        ? data.lakes.features
        : [...data.rivers.features, ...data.lakes.features];
    return features.map((feature) => ({
      ...feature.properties,
      key: feature.properties.name,
      feature
    }));
  }
  throw new Error(`Quiz sconosciuto: ${quizId}`);
}

export function questionText(quizId, mode, item) {
  const name = placeName(quizId === "capitals" ? item.cantonName : item);
  const type = ["waters", "rivers", "lakes"].includes(quizId) ? item.category : quizId;
  return t(mode === "write" ? `write.${type}` : ["cantons", "capitals"].includes(quizId) ? `map.${quizId}` : "map.place", { name });
}

export function normalizeAnswer(value) {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function acceptedAnswers(item) {
  return [...new Set(nameVariants(item).flatMap((name) => [
    normalizeAnswer(name),
    normalizeAnswer(name.replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue"))
  ]))];
}

export function formatDetails(item) {
  const parts = [];
  if (item.elevation) parts.push(`${item.elevation.toLocaleString(getLanguage() === "de" ? "de-CH" : "en-GB")} m`);
  if (item.canton) parts.push(item.canton.split(" / ").map(placeName).join(" / "));
  if (Number.isFinite(item.latitude)) parts.push(`${item.latitude.toFixed(4)}°, ${item.longitude.toFixed(4)}°`);
  if (item.transboundary) parts.push(t("lago transfrontaliero"));
  if (item.outsideSwitzerland) parts.push(t("fuori dalla Svizzera"));
  return parts.join(" · ");
}
