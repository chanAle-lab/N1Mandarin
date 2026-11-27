/* Saves "known" word ticks, spaced-repetition (SRS) schedules, and Learn section review progress in the browser.
   Optional: the site works without this file (ticks then last for one visit). */
window.N1Store = {
  srs: {},
  learn: null,
  load() {
    try { JSON.parse(localStorage.getItem("n1m-known") || "[]").forEach((n) => this.known.add(typeof n === "number" ? "1-" + n : n)); } catch (e) {}
    try { const raw = JSON.parse(localStorage.getItem("n1m-srs") || "{}"); if (raw && typeof raw === "object") this.srs = raw; } catch (e) {}
    try { const lr = JSON.parse(localStorage.getItem("n1m-learn") || "null"); if (lr && typeof lr === "object") this.learn = lr; } catch (e) {}
  },
  save() {
    try { localStorage.setItem("n1m-known", JSON.stringify([...this.known])); } catch (e) {}
    try { localStorage.setItem("n1m-srs", JSON.stringify(this.srs)); } catch (e) {}
    try { if (this.learn) localStorage.setItem("n1m-learn", JSON.stringify(this.learn)); } catch (e) {}
  }
};
