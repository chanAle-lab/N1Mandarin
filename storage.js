/* Saves "known" word ticks and spaced-repetition (SRS) schedules in the browser.
   Optional: the site works without this file (ticks then last for one visit). */
window.N1Store = {
  srs: {},
  load() {
    try { JSON.parse(localStorage.getItem("n1m-known") || "[]").forEach((n) => this.known.add(typeof n === "number" ? "1-" + n : n)); } catch (e) {}
    try { const raw = JSON.parse(localStorage.getItem("n1m-srs") || "{}"); if (raw && typeof raw === "object") this.srs = raw; } catch (e) {}
  },
  save() {
    try { localStorage.setItem("n1m-known", JSON.stringify([...this.known])); } catch (e) {}
    try { localStorage.setItem("n1m-srs", JSON.stringify(this.srs)); } catch (e) {}
  }
};
