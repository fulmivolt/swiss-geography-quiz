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
  { id: "passes", number: "08", icon: "◇", title: "Passi alpini", description: "Impara 16 valichi lungo l’arco alpino svizzero.", count: 16, category: "PASSI", geometry: "point" },
  { id: "all", number: "09", icon: "✦", title: "Tutto", description: "Affronta ogni luogo, ogni forma, lo Steckbrief e le Landschaften in un’unica sessione.", count: 155, category: "TUTTO", geometry: "mixed" },
  { id: "profile", number: "10", icon: "▤", title: "Steckbrief della Svizzera", description: "Studia i 17 dati fondamentali della Svizzera con schede da scoprire.", count: 17, category: "STECKBRIEF", geometry: "study" },
  { id: "landscapes", number: "11", icon: "◩", title: "Landschaften", description: "Impara Jura, Mittelland e Alpen: percentuali, posizione e contorni.", count: 3, category: "LANDSCHAFTEN", geometry: "area" }
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
  if (quizId === "profile") {
    return data.profile.map((item) => ({ ...item, key: item.id, answerType: "profile" }));
  }
  if (quizId === "landscapes") {
    return ["Jura", "Mittelland", "Alpen"].map((name) => {
      const features = data.landscapes.features.filter((feature) => feature.properties.name === name);
      const properties = features[0].properties;
      return { ...properties, key: name, features, answerType: "landscape" };
    });
  }
  if (quizId === "all") {
    const sourceIds = ["cantons", "capitals", "cities", "rivers", "lakes", "mountains", "passes", "profile", "landscapes"];
    return sourceIds.flatMap((sourceQuizId) => buildItems(sourceQuizId, data).map((item) => ({
      ...item,
      sourceQuizId,
      mapKey: item.key,
      key: `${sourceQuizId}:${item.key}`
    })));
  }
  throw new Error(`Quiz sconosciuto: ${quizId}`);
}

export function questionText(quizId, mode, item) {
  if (quizId === "profile") return getLanguage() === "de" ? item.questionDe : item.questionEn;
  if (quizId === "landscapes") return t("Inserisci la percentuale e individua l’area di {name}.", { name: placeName(item) });
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
  if (item.answers?.length) return [...new Set(item.answers.map(normalizeAnswer))];
  if (item.answerType === "landscape") return [normalizeAnswer(String(item.percent)), normalizeAnswer(`${item.percent}%`)];
  return [...new Set(nameVariants(item).flatMap((name) => [
    normalizeAnswer(name),
    normalizeAnswer(name.replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue"))
  ]))];
}

export function formatDetails(item) {
  if (item.answerType === "profile") return getLanguage() === "de" ? item.answerDe : item.answerEn;
  if (item.answerType === "landscape") return `${placeName(item)} · ${item.percent}% · ${getLanguage() === "de" ? item.descriptionDe : item.descriptionEn}`;
  const parts = [];
  if (item.elevation) parts.push(`${item.elevation.toLocaleString(getLanguage() === "de" ? "de-CH" : "en-GB")} m`);
  if (item.canton) parts.push(item.canton.split(" / ").map(placeName).join(" / "));
  if (Number.isFinite(item.latitude)) parts.push(`${item.latitude.toFixed(4)}°, ${item.longitude.toFixed(4)}°`);
  if (item.transboundary) parts.push(t("lago transfrontaliero"));
  if (item.outsideSwitzerland) parts.push(t("fuori dalla Svizzera"));
  return parts.join(" · ");
}

export function answerLabel(item) {
  if (item.answerType === "profile") return getLanguage() === "de" ? item.answerDe : item.answerEn;
  if (item.answerType === "landscape") return `${placeName(item)} · ${item.percent}%`;
  return placeName(item);
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  return polygons.some((polygon) => pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole)));
}

export function landscapeDrawingScore(points, item, allFeatures) {
  if (points.length < 3) return { correct: false, precision: 0, recall: 0 };
  const drawing = points.map((point) => Array.isArray(point) ? point : [point.lng, point.lat]);
  if (drawing[0][0] !== drawing.at(-1)[0] || drawing[0][1] !== drawing.at(-1)[1]) drawing.push(drawing[0]);
  let target = 0;
  let drawn = 0;
  let intersection = 0;
  for (let row = 0; row < 38; row += 1) {
    const latitude = 45.8 + (row + 0.5) * (2.03 / 38);
    for (let column = 0; column < 64; column += 1) {
      const longitude = 5.94 + (column + 0.5) * (4.58 / 64);
      const point = [longitude, latitude];
      const countryFeature = allFeatures.find((feature) => pointInGeometry(point, feature.geometry));
      if (!countryFeature) continue;
      const inTarget = countryFeature.properties.name === item.mapKey || countryFeature.properties.name === item.key;
      const inDrawing = pointInRing(point, drawing);
      if (inTarget) target += 1;
      if (inDrawing) drawn += 1;
      if (inTarget && inDrawing) intersection += 1;
    }
  }
  const precision = drawn ? intersection / drawn : 0;
  const recall = target ? intersection / target : 0;
  return { correct: precision >= 0.55 && recall >= 0.45, precision, recall };
}
