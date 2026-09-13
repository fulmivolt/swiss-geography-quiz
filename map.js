import { t } from "./i18n.js";
import { placeName } from "./names.js";

const COLORS = {
  canton: "#31445b",
  cantonLine: "#8190a3",
  water: "#1688c2",
  waterLine: "#62c5f4",
  correct: "#37d08a",
  wrong: "#ef3340",
  target: "#ffbf47"
};

export class GeographyMap {
  constructor(elementId) {
    if (!window.L) throw new Error("Leaflet non è disponibile.");
    this.map = L.map(elementId, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.25,
      minZoom: 6,
      maxZoom: 13,
      preferCanvas: true
    });

    L.control.zoom({ zoomInTitle: t("zoomIn"), zoomOutTitle: t("zoomOut") }).addTo(this.map);

    this.tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    });

    this.baseGroup = L.layerGroup().addTo(this.map);
    this.quizGroup = L.layerGroup().addTo(this.map);
    this.feedbackGroup = L.layerGroup().addTo(this.map);
    this.featureIndex = new Map();
    this.currentHandler = null;
    this.currentInteraction = null;
    this.feedbackLocked = false;

    this.map.on("click", (event) => {
      if (this.currentInteraction === "point" && this.currentHandler) {
        this.currentHandler({ type: "point", latlng: event.latlng });
      }
    });
    // The map also changes size when the responsive layout or sidebar changes.
    if (globalThis.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.map.getContainer());
    }
  }

  setData(data) {
    this.data = data;
    this.baseGroup.clearLayers();
    this.baseCantonLayer = L.geoJSON(data.cantonGeometry, {
      interactive: false,
      style: {
        color: COLORS.cantonLine,
        weight: 1,
        opacity: 0.78,
        fillColor: COLORS.canton,
        fillOpacity: 0.32
      }
    }).addTo(this.baseGroup);
    this.countryBounds = this.baseCantonLayer.getBounds();
    this.waterBounds = L.geoJSON(data.lakes, { interactive: false }).getBounds();
    this.map.setMaxBounds(this.countryBounds.pad(0.65));
    this.resetView(false);
  }

  resetView(animate = true) {
    if (this.countryBounds) this.map.fitBounds(this.countryBounds, { padding: [18, 18], animate });
  }

  resize() {
    this.map.invalidateSize();
  }

  clearQuestion() {
    this.quizGroup.removeFrom(this.map);
    this.feedbackGroup.removeFrom(this.map);
    this.quizGroup = L.layerGroup().addTo(this.map);
    this.feedbackGroup = L.layerGroup().addTo(this.map);
    this.featureIndex.clear();
    this.currentHandler = null;
    this.currentInteraction = null;
    this.feedbackLocked = false;
    if (!this.map.hasLayer(this.baseGroup)) this.baseGroup.addTo(this.map);
  }

  showQuestion({ quizId, mode, difficulty, item, items, onSelect }) {
    this.clearQuestion();
    const container = this.map.getContainer();
    for (const [selector, key] of [[".leaflet-control-zoom-in", "zoomIn"], [".leaflet-control-zoom-out", "zoomOut"]]) {
      const button = container.querySelector(selector);
      button?.setAttribute("title", t(key));
      button?.setAttribute("aria-label", t(key));
    }
    this.setBasemap(difficulty === "easy");
    this.currentHandler = onSelect;
    this.currentInteraction = mode === "map" && ["capitals", "cities", "mountains", "passes"].includes(quizId) ? "point" : null;

    if (quizId === "cantons") {
      this.map.removeLayer(this.baseGroup);
      this.renderCantons({ interactive: mode === "map", labels: difficulty === "easy" });
      if (mode === "write") this.emphasizeFeature(item.key, COLORS.target);
      return;
    }

    if (!this.map.hasLayer(this.baseGroup)) this.baseGroup.addTo(this.map);

    if (["waters", "rivers", "lakes"].includes(quizId)) {
      this.renderWaters({
        interactive: mode === "map",
        labels: difficulty === "easy",
        includeRivers: quizId !== "lakes",
        includeLakes: quizId !== "rivers"
      });
      if (mode === "write") this.emphasizeFeature(item.key, COLORS.target);
      const bounds = L.latLngBounds(this.countryBounds.getSouthWest(), this.countryBounds.getNorthEast());
      if (quizId !== "rivers") bounds.extend(this.waterBounds);
      this.map.fitBounds(bounds, { padding: [18, 18], animate: false });
      return;
    }

    if (quizId === "capitals" && mode === "write" && difficulty === "easy") {
      this.renderCantonHint(item.cantonId);
    }

    if (mode === "write") {
      this.addPointMarker(item, "target", true);
    } else if (difficulty !== "hard") {
      for (const option of items) this.addPointHint(option, difficulty === "easy");
    }
  }

  setBasemap(visible) {
    if (visible && !this.map.hasLayer(this.tileLayer)) this.tileLayer.addTo(this.map);
    if (!visible && this.map.hasLayer(this.tileLayer)) this.map.removeLayer(this.tileLayer);
  }

  renderCantons({ interactive, labels }) {
    const layer = L.geoJSON(this.data.cantonGeometry, {
      style: {
        color: COLORS.cantonLine,
        weight: 1.25,
        fillColor: COLORS.canton,
        fillOpacity: 0.47
      },
      interactive,
      bubblingMouseEvents: false,
      onEachFeature: (feature, path) => {
        this.storeFeature(feature.properties.name, path);
        if (labels) path.bindTooltip(placeName(feature.properties), { sticky: true, direction: "top" });
        if (!interactive) return;
        path.on({
          mouseover: () => { if (!this.feedbackLocked) path.setStyle({ fillOpacity: 0.72, color: "#dce7f4", weight: 1.8 }); },
          mouseout: () => { if (!this.feedbackLocked) path.setStyle({ fillOpacity: 0.47, color: COLORS.cantonLine, weight: 1.25 }); },
          click: () => this.currentHandler?.({ type: "feature", key: feature.properties.name })
        });
      }
    });
    layer.addTo(this.quizGroup);
  }

  renderCantonHint(cantonId) {
    const match = this.data.cantonGeometry.features.find((feature) => Number(feature.properties.id) === Number(cantonId));
    if (!match) return;
    L.geoJSON(match, {
      interactive: false,
      style: { color: COLORS.target, weight: 2.5, fillColor: COLORS.target, fillOpacity: 0.18 }
    }).addTo(this.quizGroup);
  }

  renderWaters({ interactive, labels, includeRivers = true, includeLakes = true }) {
    for (const feature of includeLakes ? this.data.lakes.features : []) {
      const name = feature.properties.name;
      const layer = L.geoJSON(feature, {
        interactive,
        bubblingMouseEvents: false,
        style: { color: COLORS.waterLine, weight: 1.1, fillColor: COLORS.water, fillOpacity: 0.48 }
      }).addTo(this.quizGroup);
      layer.eachLayer((path) => {
        this.storeFeature(name, path);
        if (labels) path.bindTooltip(this.waterTooltip(feature.properties), { sticky: true });
        if (interactive) {
          path.on({
            mouseover: () => { if (!this.feedbackLocked) path.setStyle({ fillOpacity: 0.72, weight: 2 }); },
            mouseout: () => { if (!this.feedbackLocked) path.setStyle({ fillOpacity: 0.48, weight: 1.1 }); },
            click: () => this.currentHandler?.({ type: "feature", key: name })
          });
        }
      });
    }

    for (const feature of includeRivers ? this.data.rivers.features : []) {
      const name = feature.properties.name;
      const visible = L.geoJSON(feature, {
        interactive: false,
        style: { color: COLORS.waterLine, weight: 2.7, opacity: 0.9, lineCap: "round" }
      }).addTo(this.quizGroup);
      visible.eachLayer((path) => {
        this.storeFeature(name, path);
        if (labels) path.bindTooltip(placeName(name), { sticky: true });
      });

      if (interactive) {
        L.geoJSON(feature, {
          interactive: true,
          bubblingMouseEvents: false,
          style: { color: "#ffffff", weight: 16, opacity: 0.001, lineCap: "round" },
          onEachFeature: (_, path) => path.on({
            mouseover: () => { if (!this.feedbackLocked) this.setFeatureStyle(name, { color: "#b8ebff", weight: 4.3, opacity: 1 }); },
            mouseout: () => { if (!this.feedbackLocked) this.setFeatureStyle(name, { color: COLORS.waterLine, weight: 2.7, opacity: 0.9 }); },
            click: () => this.currentHandler?.({ type: "feature", key: name })
          })
        }).addTo(this.quizGroup);
      }
    }
  }

  waterTooltip(properties) {
    const note = properties.transboundary ? ` · ${t("lago transfrontaliero")}` : properties.outsideSwitzerland ? ` · ${t("fuori dalla Svizzera")}` : "";
    return `${placeName(properties)}${note}`;
  }

  storeFeature(key, layer) {
    const layers = this.featureIndex.get(key) ?? [];
    layers.push(layer);
    this.featureIndex.set(key, layers);
  }

  setFeatureStyle(key, style) {
    for (const layer of this.featureIndex.get(key) ?? []) layer.setStyle?.(style);
  }

  emphasizeFeature(key, color) {
    this.setFeatureStyle(key, { color, fillColor: color, fillOpacity: 0.62, opacity: 1, weight: 4 });
    for (const layer of this.featureIndex.get(key) ?? []) layer.bringToFront?.();
  }

  addPointHint(item, labels) {
    const marker = L.circleMarker([item.latitude, item.longitude], {
      radius: item.markerType ? 6 : 5,
      color: item.markerType === "mountain" ? "#ffcf70" : item.markerType === "pass" ? "#d2a1ff" : "#9ecfff",
      fillColor: "#13243a",
      fillOpacity: 0.76,
      weight: 1.5,
      interactive: labels
    }).addTo(this.quizGroup);
    if (labels) marker.bindTooltip(placeName(item), { permanent: true, direction: "top", offset: [0, -4] });
  }

  addPointMarker(item, state = "target", permanentLabel = false) {
    const type = item.markerType ?? "city";
    const icon = L.divIcon({
      className: `quiz-marker ${type} ${state}`,
      html: "<span></span>",
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    const marker = L.marker([item.latitude, item.longitude], { icon, interactive: false }).addTo(this.feedbackGroup);
    if (permanentLabel) marker.bindTooltip("?", { permanent: true, direction: "top", offset: [0, -9] });
    return marker;
  }

  nearestPoint(items, latlng) {
    let nearest = null;
    for (const item of items) {
      const distanceMeters = this.map.distance(latlng, L.latLng(item.latitude, item.longitude));
      if (!nearest || distanceMeters < nearest.distanceMeters) nearest = { item, distanceMeters };
    }
    return nearest;
  }

  showResult({ correct, correctItem, selectedKey, clickedLatLng, details }) {
    this.currentHandler = null;
    this.currentInteraction = null;
    this.feedbackLocked = true;

    if (selectedKey && !correct) this.emphasizeFeature(selectedKey, COLORS.wrong);
    if (this.featureIndex.has(correctItem.key)) {
      this.emphasizeFeature(correctItem.key, COLORS.correct);
      const layers = this.featureIndex.get(correctItem.key);
      const anchor = layers[0].getBounds?.().getCenter?.();
      if (anchor) L.tooltip({ permanent: true, direction: "top" }).setLatLng(anchor).setContent(placeName(correctItem)).addTo(this.feedbackGroup);
      return;
    }

    this.feedbackGroup.clearLayers();
    if (clickedLatLng && !correct) {
      L.marker(clickedLatLng, {
        interactive: false,
        icon: L.divIcon({ className: "", html: '<span class="click-marker"></span>', iconSize: [20, 20], iconAnchor: [10, 10] })
      }).addTo(this.feedbackGroup);
    }

    const marker = this.addPointMarker(correctItem, "correct", false);
    marker.bindTooltip(`<strong>${placeName(correctItem)}</strong>${details ? `<br>${details}` : ""}`, {
      permanent: true,
      direction: "top",
      offset: [0, -10]
    });
  }
}
