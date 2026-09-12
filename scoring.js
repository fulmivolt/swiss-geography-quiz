import { t } from "./i18n.js";

export class ScoreTracker {
  constructor(total, difficulty) {
    this.total = total;
    this.difficulty = difficulty;
    this.points = 0;
    this.correct = 0;
    this.wrong = 0;
    this.answered = 0;
  }

  record(correct, { timeRemaining = 0, timeLimit = 0 } = {}) {
    this.answered += 1;
    if (!correct) {
      this.wrong += 1;
      return 0;
    }

    this.correct += 1;
    let earned = 1;
    if (this.difficulty !== "easy") earned += 1;
    if (this.difficulty === "hard" && timeLimit > 0 && timeRemaining / timeLimit >= 0.5) earned += 1;
    this.points += earned;
    return earned;
  }

  get percent() {
    return this.answered ? Math.round((this.correct / this.answered) * 100) : 0;
  }

  get finalPercent() {
    return this.total ? Math.round((this.correct / this.total) * 100) : 0;
  }

  get rating() {
    const value = this.finalPercent;
    if (value >= 90) return t("⭐ Eccellente");
    if (value >= 75) return t("👍 Molto bene");
    if (value >= 60) return t("🙂 Buono");
    return t("📚 Devi ancora esercitarti");
  }
}
