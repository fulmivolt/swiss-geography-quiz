import { t, getLanguage, setLanguage, initializeStaticTranslations, translateStatic } from "./i18n.js";
import { placeName } from "./names.js";
import { loadGeographyData } from "./data-loader.js";
import { GeographyMap } from "./map.js";
import { ScoreTracker } from "./scoring.js";
import { QUIZ_CATALOG, acceptedAnswers, buildItems, formatDetails, normalizeAnswer, questionText, shuffle } from "./quiz.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  menu: $("#menu-view"),
  quiz: $("#quiz-view"),
  grid: $("#quiz-grid"),
  difficulty: $("#difficulty-control"),
  answerMode: $("#answer-mode-control"),
  category: $("#category-label"),
  question: $("#question-text"),
  hint: $("#question-hint"),
  form: $("#answer-form"),
  input: $("#answer-input"),
  inputError: $("#input-error"),
  feedback: $("#feedback-card"),
  feedbackIcon: $("#feedback-icon"),
  feedbackTitle: $("#feedback-title"),
  feedbackCopy: $("#feedback-copy"),
  details: $("#answer-details"),
  points: $("#score-points"),
  correct: $("#score-correct"),
  wrong: $("#score-wrong"),
  percent: $("#score-percent"),
  scoreGrid: $(".score-grid"),
  continue: $("#continue-button"),
  tip: $("#interaction-tip"),
  progressLabel: $("#progress-label"),
  progressBar: $("#progress-bar"),
  elapsed: $("#elapsed-time"),
  timerTrack: $("#timer-track"),
  timerBar: $("#timer-bar"),
  modeBadge: $("#mode-badge"),
  mapTitle: $("#map-title"),
  mapSubtitle: $("#map-subtitle"),
  legendFeedback: $("#legend-feedback"),
  legendWater: $("#legend-water-item"),
  questionCard: $(".question-card"),
  exitDialog: $("#exit-dialog"),
  infoDialog: $("#info-dialog"),
  mapStage: $(".map-stage")
};

const settings = { difficulty: "normal", mode: "map" };
let data;
let loadFailed = false;
let geographyMap;
let session;

function renderCatalog() {
  if (loadFailed) {
    elements.grid.innerHTML = `<div class="feedback-card wrong" role="alert" style="grid-column:1/-1"><div class="feedback-icon">!</div><div><h3>${t("Dati non disponibili")}</h3><p>${t("loadError")}</p></div></div>`;
    return;
  }
  elements.grid.setAttribute("aria-busy", String(!data));
  elements.grid.innerHTML = QUIZ_CATALOG.map((quiz) => `
    <article class="quiz-card" data-number="${quiz.number}">
      <div class="card-top">
        <span class="card-icon" aria-hidden="true">${quiz.icon}</span>
        <span class="card-count">${quiz.count} ${t("elementi")}</span>
      </div>
      <h2>${t(quiz.title)}</h2>
      <p>${t(quiz.description)}</p>
      <button class="start-button" type="button" data-quiz="${quiz.id}" ${data ? "" : "disabled"} aria-label="${t("Avvia quiz {name}", { name: t(quiz.title) })}">${t(data ? "Inizia" : "loading")} <span aria-hidden="true">→</span></button>
    </article>
  `).join("");

  elements.grid.onclick = (event) => {
    const button = event.target.closest("[data-quiz]");
    if (button) startQuiz(button.dataset.quiz);
  };
}

function bindSegmented(control, settingKey) {
  const update = () => control.querySelectorAll("button").forEach((button) => {
    const selected = button.dataset.value === settings[settingKey];
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  update();
  control.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    settings[settingKey] = button.dataset.value;
    update();
  });
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function difficultyLabel(value) {
  return t({ easy: "Facile · guida", normal: "Normale", hard: "Difficile · 20 s" }[value]);
}

function startQuiz(quizId) {
  if (!data) return;
  const config = QUIZ_CATALOG.find((quiz) => quiz.id === quizId);
  const allItems = buildItems(quizId, data);
  const questions = shuffle(allItems);

  clearSessionTimers();
  session = {
    quizId,
    config,
    items: allItems,
    questions,
    index: 0,
    answered: false,
    startedAt: Date.now(),
    score: new ScoreTracker(questions.length, settings.difficulty),
    difficulty: settings.difficulty,
    mode: settings.mode,
    questionTimeLimit: 20,
    timeRemaining: 20
  };

  elements.menu.classList.add("hidden");
  elements.quiz.classList.remove("hidden");
  elements.questionCard.classList.remove("hidden");
  elements.scoreGrid.classList.remove("hidden");
  elements.tip.classList.remove("hidden");
  document.querySelector(".result-panel")?.remove();
  elements.modeBadge.textContent = `${t(session.mode === "map" ? "Mappa" : "Scrittura")} · ${difficultyLabel(session.difficulty)}`;
  elements.mapTitle.textContent = t(config.title);
  elements.mapSubtitle.textContent = t(quizId === "waters" ? "Geometrie ufficiali swissTLMRegio" : "Confini cantonali ufficiali");
  elements.legendWater.classList.toggle("hidden", quizId !== "waters");
  updateScore();
  window.scrollTo({ top: 0, behavior: "auto" });

  requestAnimationFrame(() => {
    if (!geographyMap) {
      geographyMap = new GeographyMap("map");
      geographyMap.setData(data);
    } else {
      geographyMap.resize();
      geographyMap.resetView(false);
    }
    session.elapsedTimer = window.setInterval(updateElapsedTime, 1000);
    updateElapsedTime();
    showQuestion();
  });
}

function currentItem() {
  return session.questions[session.index];
}

function showQuestion() {
  if (!session) return;
  const item = currentItem();
  session.answered = false;
  session.timeRemaining = session.questionTimeLimit;

  elements.category.textContent = t(session.config.category);
  elements.question.textContent = questionText(session.quizId, session.mode, item);
  elements.progressLabel.textContent = t("Domanda {current} / {total}", { current: session.index + 1, total: session.questions.length });
  elements.progressBar.style.width = `${(session.index / session.questions.length) * 100}%`;
  elements.feedback.className = "feedback-card hidden";
  elements.continue.classList.add("hidden");
  elements.legendFeedback.classList.add("hidden");
  elements.inputError.textContent = "";
  elements.input.value = "";
  elements.input.disabled = false;
  elements.form.classList.toggle("hidden", session.mode !== "write");
  elements.tip.textContent = t(session.mode === "write" ? "Accenti, maiuscole e varianti linguistiche sono accettati." : "Clicca direttamente sulla mappa. Puoi usare zoom e pan.");
  elements.hint.textContent = hintText();

  geographyMap.showQuestion({
    quizId: session.quizId,
    mode: session.mode,
    difficulty: session.difficulty,
    item,
    items: session.items,
    onSelect: handleMapSelection
  });

  if (session.difficulty === "hard") startQuestionTimer();
  else elements.timerTrack.classList.add("hidden");

  if (session.mode === "write") window.setTimeout(() => elements.input.focus(), 120);
  else elements.question.focus({ preventScroll: true });
}

function hintText() {
  if (session.difficulty === "hard") return t("Nessun aiuto visivo. Il tempo scorre.");
  if (session.mode === "write") {
    if (session.quizId === "capitals") return t(session.difficulty === "easy" ? "Il cantone è evidenziato sulla mappa." : "Puoi rispondere in italiano, tedesco o francese.");
    return t("Osserva attentamente l’elemento evidenziato.");
  }
  if (session.difficulty === "easy") return t("Passa il cursore sugli elementi per vedere i nomi.");
  return t("La mappa non mostra etichette: usa forma, posizione e contesto.");
}

function startQuestionTimer() {
  window.clearInterval(session.questionTimer);
  elements.timerTrack.classList.remove("hidden");
  const started = performance.now();
  session.questionTimer = window.setInterval(() => {
    const elapsed = (performance.now() - started) / 1000;
    session.timeRemaining = Math.max(0, session.questionTimeLimit - elapsed);
    elements.timerBar.style.width = `${(session.timeRemaining / session.questionTimeLimit) * 100}%`;
    if (session.timeRemaining <= 0) {
      window.clearInterval(session.questionTimer);
      submitResult({ correct: false, selectedKey: null, clickedLatLng: null, lead: { key: "Tempo scaduto." } });
    }
  }, 100);
}

function updateElapsedTime() {
  if (!session) return;
  session.elapsedSeconds = Math.floor((Date.now() - session.startedAt) / 1000);
  elements.elapsed.textContent = formatTime(session.elapsedSeconds);
}

function handleMapSelection(selection) {
  if (!session || session.answered || session.mode !== "map") return;
  const item = currentItem();

  if (selection.type === "feature") {
    submitResult({ correct: selection.key === item.key, selectedKey: selection.key, clickedLatLng: null });
    return;
  }

  const nearest = geographyMap.nearestPoint(session.items, selection.latlng);
  const toleranceKm = { easy: 30, normal: 18, hard: 10 }[session.difficulty];
  const withinTolerance = nearest.distanceMeters <= toleranceKm * 1000;
  const selectedKey = withinTolerance ? nearest.item.key : null;
  const distanceToAnswer = geographyMap.map.distance(selection.latlng, L.latLng(item.latitude, item.longitude)) / 1000;
  const lead = distanceToAnswer < 1 ? { key: "Precisione inferiore a 1 km." } : { key: "Distanza dalla risposta: {distance} km.", values: { distance: distanceToAnswer.toFixed(1) } };
  submitResult({ correct: selectedKey === item.key, selectedKey, clickedLatLng: selection.latlng, lead });
}

function submitWrittenAnswer(event) {
  event.preventDefault();
  if (!session || session.answered) return;
  const value = elements.input.value.trim();
  if (!value) {
    elements.inputError.textContent = t("Scrivi una risposta prima di controllare.");
    elements.input.focus();
    return;
  }
  elements.inputError.textContent = "";
  const correct = acceptedAnswers(currentItem()).includes(normalizeAnswer(value));
  submitResult({ correct, selectedKey: null, clickedLatLng: null });
}

function submitResult({ correct, selectedKey, clickedLatLng, lead = "" }) {
  if (!session || session.answered) return;
  session.answered = true;
  window.clearInterval(session.questionTimer);
  const item = currentItem();
  const earned = session.score.record(correct, {
    timeRemaining: session.timeRemaining,
    timeLimit: session.difficulty === "hard" ? session.questionTimeLimit : 0
  });

  session.lastResult = { correct, selectedKey, clickedLatLng, lead, earned };
  renderFeedback();
  elements.continue.focus({ preventScroll: true });
}

function renderFeedback() {
  const item = currentItem();
  const { correct, selectedKey, clickedLatLng, earned, lead: leadData } = session.lastResult;
  const lead = leadData ? t(leadData.key, leadData.values) : "";
  elements.feedback.className = `feedback-card ${correct ? "correct" : "wrong"}`;
  elements.feedbackIcon.textContent = correct ? "✓" : "×";
  elements.feedbackTitle.textContent = t(correct ? "Corretto!" : "Sbagliato");
  elements.feedbackCopy.textContent = correct
    ? `${lead ? `${lead} ` : ""}+${earned} ${t(earned === 1 ? "punto" : "punti")}.`
    : `${lead ? `${lead} ` : ""}${t("La risposta corretta era: {name}.", { name: placeName(item) })}`;
  elements.details.textContent = formatDetails(item);
  elements.input.disabled = true;
  elements.continue.classList.remove("hidden");
  elements.legendFeedback.classList.remove("hidden");

  geographyMap.showResult({
    correct,
    correctItem: item,
    selectedKey,
    clickedLatLng,
    details: formatDetails(item)
  });
  updateScore();
  elements.progressBar.style.width = `${((session.index + 1) / session.questions.length) * 100}%`;
}

function updateScore() {
  elements.points.textContent = session.score.points;
  elements.correct.textContent = session.score.correct;
  elements.wrong.textContent = session.score.wrong;
  elements.percent.textContent = session.score.answered ? `${session.score.percent}%` : "—";
}

function nextQuestion() {
  if (!session?.answered) return;
  if (session.index >= session.questions.length - 1) {
    finishQuiz();
    return;
  }
  session.index += 1;
  showQuestion();
}

function finishQuiz() {
  window.clearInterval(session.questionTimer);
  window.clearInterval(session.elapsedTimer);
  if (!session.finished) updateElapsedTime();
  session.finished = true;
  elements.questionCard.classList.add("hidden");
  elements.feedback.classList.add("hidden");
  elements.scoreGrid.classList.add("hidden");
  elements.continue.classList.add("hidden");
  elements.timerTrack.classList.add("hidden");
  elements.tip.classList.add("hidden");
  elements.progressBar.style.width = "100%";

  document.querySelector(".result-panel")?.remove();
  const result = document.createElement("section");
  result.className = "result-panel";
  result.innerHTML = `
    <p class="eyebrow">${t("RISULTATO FINALE")}</p>
    <div class="result-score">${session.score.correct}<small> / ${session.questions.length}</small></div>
    <p class="result-rating">${session.score.rating}</p>
    <div class="result-stats">
      <div><strong>${session.score.finalPercent}%</strong><span>${t("Precisione")}</span></div>
      <div><strong>${session.score.points}</strong><span>${t("Punti")}</span></div>
      <div><strong>${formatTime(session.elapsedSeconds ?? 0)}</strong><span>${t("Tempo")}</span></div>
    </div>
    <div class="result-actions">
      <button class="primary-button" id="result-restart" type="button">${t("Ricomincia")}</button>
      <button id="result-menu" type="button">${t("Torna al menu")}</button>
    </div>
  `;
  elements.questionCard.insertAdjacentElement("afterend", result);
  result.querySelector("#result-restart").addEventListener("click", () => startQuiz(session.quizId));
  result.querySelector("#result-menu").addEventListener("click", showMenu);
  result.querySelector("#result-restart").focus({ preventScroll: true });
}

function clearSessionTimers() {
  if (!session) return;
  window.clearInterval(session.questionTimer);
  window.clearInterval(session.elapsedTimer);
}

function requestMenu() {
  if (!session) return showMenu();
  const finished = Boolean(document.querySelector(".result-panel"));
  if (finished || session.score.answered === 0) showMenu();
  else elements.exitDialog.showModal();
}

function showMenu() {
  const previousQuiz = session?.quizId;
  clearSessionTimers();
  elements.exitDialog.close();
  elements.quiz.classList.add("hidden");
  elements.menu.classList.remove("hidden");
  session = null;
  elements.grid.querySelector(`[data-quiz="${previousQuiz}"]`)?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setExpandedMap(expanded) {
  elements.mapStage.classList.toggle("map-expanded", expanded);
  document.body.classList.toggle("no-scroll", expanded);
  window.setTimeout(() => geographyMap?.resize(), 120);
}

function bindUi() {
  bindSegmented(elements.difficulty, "difficulty");
  bindSegmented(elements.answerMode, "mode");
  elements.form.addEventListener("submit", submitWrittenAnswer);
  elements.continue.addEventListener("click", nextQuestion);
  $("#back-button").addEventListener("click", requestMenu);
  $("#brand-home").addEventListener("click", () => { if (!elements.quiz.classList.contains("hidden")) requestMenu(); });
  $("#exit-cancel").addEventListener("click", () => elements.exitDialog.close());
  $("#exit-confirm").addEventListener("click", showMenu);
  $("#info-button").addEventListener("click", () => elements.infoDialog.showModal());
  $("#info-close").addEventListener("click", () => elements.infoDialog.close());
  $("#info-ok").addEventListener("click", () => elements.infoDialog.close());
  $("#reset-map").addEventListener("click", () => geographyMap?.resetView());
  $("#fullscreen-map").addEventListener("click", async () => {
    if (elements.mapStage.classList.contains("map-expanded")) return setExpandedMap(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (elements.mapStage.requestFullscreen) await elements.mapStage.requestFullscreen();
      else setExpandedMap(true);
    } catch {
      // Embedded browsers can expose the API while disallowing fullscreen.
      setExpandedMap(true);
    }
    window.setTimeout(() => geographyMap?.resize(), 120);
  });
  document.addEventListener("fullscreenchange", () => window.setTimeout(() => geographyMap?.resize(), 120));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.mapStage.classList.contains("map-expanded")) {
      setExpandedMap(false);
      $("#fullscreen-map").focus();
    }
  });
}

function refreshLanguage() {
  translateStatic();
  renderCatalog();
  updateConnectionStatus();
  if (!session || !geographyMap) return;
  elements.modeBadge.textContent = `${t(session.mode === "map" ? "Mappa" : "Scrittura")} · ${difficultyLabel(session.difficulty)}`;
  elements.mapTitle.textContent = t(session.config.title);
  elements.mapSubtitle.textContent = t(session.quizId === "waters" ? "Geometrie ufficiali swissTLMRegio" : "Confini cantonali ufficiali");
  elements.category.textContent = t(session.config.category);
  elements.question.textContent = questionText(session.quizId, session.mode, currentItem());
  elements.progressLabel.textContent = t("Domanda {current} / {total}", { current: session.index + 1, total: session.questions.length });
  elements.hint.textContent = hintText();
  elements.tip.textContent = t(session.mode === "write" ? "Accenti, maiuscole e varianti linguistiche sono accettati." : "Clicca direttamente sulla mappa. Puoi usare zoom e pan.");
  if (elements.inputError.textContent) elements.inputError.textContent = t("Scrivi una risposta prima di controllare.");
  const finished = Boolean(document.querySelector(".result-panel"));
  geographyMap.showQuestion({ quizId: session.quizId, mode: session.mode, difficulty: session.difficulty, item: currentItem(), items: session.items, onSelect: handleMapSelection });
  if (session.answered) renderFeedback();
  if (finished) finishQuiz();
}

function updateConnectionStatus() {
  $("#connection-status").textContent = t(navigator.onLine ? "online" : "offline");
}

async function initialize() {
  initializeStaticTranslations();
  $("#language-select").value = getLanguage();
  $("#language-select").addEventListener("change", (event) => {
    setLanguage(event.target.value);
    refreshLanguage();
  });
  renderCatalog();
  bindUi();
  updateConnectionStatus();
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);
  try {
    data = await loadGeographyData();
  } catch (error) {
    console.error(error);
    loadFailed = true;
  } finally {
    elements.grid.setAttribute("aria-busy", "false");
    renderCatalog();
  }

  // Capacitor injects the native bridge; web preview needs no native dependency.
  const nativeApp = globalThis.Capacitor?.Plugins?.App;
  if (nativeApp) {
    await nativeApp.addListener("backButton", () => {
      if (elements.infoDialog.open) return elements.infoDialog.close();
      if (elements.exitDialog.open) return elements.exitDialog.close();
      if (document.fullscreenElement) return document.exitFullscreen();
      if (elements.mapStage.classList.contains("map-expanded")) {
        elements.mapStage.classList.remove("map-expanded");
        document.body.classList.remove("no-scroll");
        return geographyMap?.resize();
      }
      if (session) return requestMenu();
      nativeApp.exitApp();
    });
  }
}

initialize();
