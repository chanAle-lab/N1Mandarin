(function () {
  const main = document.getElementById("main");
  const papers = window.PAPERS || [];
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const state = { level: "All", skill: "All", q: "", answers: false, pinyin: true };

  /* ---------- HSK 1 data ---------- */
  const GROUPS = ["All", "Nouns", "Verbs", "Adjectives", "Pronouns", "Numbers & measures", "Phrases", "Other"];
  function groupOf(pos) {
    const first = (pos.split(",")[0] || "").replace(/[()]/g, "").trim();
    if (!first) return "Phrases";
    if (first === "noun") return "Nouns";
    if (first === "verb") return "Verbs";
    if (first === "adjective") return "Adjectives";
    if (first === "pronoun") return "Pronouns";
    if (/number|classifier/.test(first)) return "Numbers & measures";
    return "Other";
  }
  const LISTS = { 1: window.HSK1 || [], 2: window.HSK2 || [], 3: window.HSK3 || [], 4: window.HSK4 || [] };
  const WORDS = [];
  Object.entries(LISTS).forEach(([lv, list]) => list.forEach(([n, zh, py, pos, en]) =>
    WORDS.push({ id: `${lv}-${n}`, lv: +lv, n, zh, py, pos: pos || "phrase", en, group: groupOf(pos) })));
  // Level picker shared by the word list, flashcards and generator
  const LEVELS = [["1", "HSK 1"], ["2", "HSK 2"], ["3", "HSK 3"], ["4", "HSK 4"], ["all", "HSK 1–4"]];
  // "12" (HSK 1 + 2) is kept so generator links made before HSK 3 was added still rebuild the same paper
  const levelName = (l) => l === "12" ? "HSK 1 + 2" : (LEVELS.find((x) => x[0] === l) || LEVELS[0])[1];
  let level = "1";
  const levelWords = (l = level) => WORDS.filter((w) => l === "all" || (l === "12" ? w.lv <= 2 : String(w.lv) === l));
  const levelRow = (attr) => `<div class="chip-row level-row" role="group" aria-label="HSK level">
      <span class="chip-label">Level</span>
      ${LEVELS.map(([v, label]) => `<button class="chip" ${attr}="${v}" aria-pressed="${level === v}">${label}</button>`).join("")}
    </div>`;
  const shortEn = (en) => en.split(";")[0].replace(/\s*\(.*?\)\s*/g, " ").trim();

  // Known words: saved where the browser allows it, otherwise kept for this visit
  const known = new Set();
  const store = window.N1Store || { load() {}, save() {} }; // storage.js adds saving on the live site
  store.known = known;
  store.load();

  /* ---------- Helpers ---------- */
  const escRaw = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const decorateSparkles = (str) => String(str).replace(
    /(?:✨|💖|☕|\s)*Credit:\s*Sienna Lysiak(?:✨|💖|☕|\s)*/gi,
    '<span class="sparkle-credit" role="note" aria-label="Credit to Sienna Lysiak"><span class="sparkle-star">✨</span><span class="sparkle-heart">💖</span><span class="sparkle-cup">☕</span><b class="sparkle-name">Credit: Sienna Lysiak</b><span class="sparkle-cup">☕</span><span class="sparkle-heart">💖</span><span class="sparkle-star">✨</span></span>'
  );
  // Latin runs (pinyin, punctuation-free letters) inside Chinese lines use the body font so tone marks sit correctly
  const latin = (html) => decorateSparkles(html.replace(/(?<![&#A-Za-z\u00C0-\u024F])[A-Za-z\u00C0-\u024F\u0300-\u036F\u01CD-\u01DC'’]+(?:[ .,?!\-/]+[A-Za-z\u00C0-\u024F\u0300-\u036F\u01CD-\u01DC'’]+)*/g, (m) => `<span class="lat">${m}</span>`));
  const esc = (s) => decorateSparkles(escRaw(s));
  const zh = (s) => `<span class="zh" lang="zh-Hans">${latin(escRaw(s))}</span>`;
  const gap = (s) => esc(s).replace(/___/g, '<span class="gap" aria-label="blank"></span>');
  const gapZh = (s) => latin(escRaw(s)).replace(/___/g, '<span class="gap" aria-label="blank"></span>');
  const hasZh = (s) => /[\u4e00-\u9fff]/.test(s);

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffleWith(arr, rand) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function seedOf(str) { let s = 7; for (const ch of str) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return s; }
  const shuffled = (arr, key) => shuffleWith(arr, rng(seedOf(key)));

  const canSpeak = "speechSynthesis" in window;
  let speechRate = 0.85; // Slow / Normal switch on the learning page
  function speak(text, triggerEl) {
    if (!canSpeak || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN"; u.rate = speechRate;
    const v = speechSynthesis.getVoices().find((x) => /^zh(-|_)CN/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^zh/i.test(x.lang));
    if (v) u.voice = v;
    if (triggerEl) {
      triggerEl.classList.add("is-speaking");
      const done = () => triggerEl.classList.remove("is-speaking");
      u.onend = done;
      u.onerror = done;
    }
    speechSynthesis.speak(u);
  }
  const speakBtn = (w) => canSpeak ? `<button class="icon-btn" data-say="${esc(w)}" aria-label="Play ${esc(w)}" title="Listen">${ICON_SOUND}</button>` : "";
  const ICON_SOUND = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
  function wireSpeak(root) {
    root.querySelectorAll("[data-say]").forEach((b) => {
      if (b._wiredSpeak) return;
      b._wiredSpeak = true;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        speak(b.dataset.say, b);
      });
      if (b.getAttribute("role") === "button" && b.tagName.toLowerCase() !== "button") {
        b.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            speak(b.dataset.say, b);
          }
        });
      }
    });
  }

  function setActiveNav(key) {
    document.querySelectorAll(".site-header nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === key));
  }

  function chipRow(label, values, current, attr) {
    return `<div class="chip-row" role="group" aria-label="${label}">
      <span class="chip-label">${label}</span>
      ${values.map((v) => `<button class="chip" ${attr}="${esc(v)}" aria-pressed="${current === v}">${esc(v)}</button>`).join("")}
    </div>`;
  }

  /* ---------- Learn (home): a path for English speakers ---------- */
  const L = window.LEARN || { sounds: [], phrases: {}, characters: { types: [], rules: [] }, grammar: [], mistakes: [], idioms: [], quiz: [] };
  const IDIOM_CATS = ["All", "Wisdom & Perspective", "Learning & Perseverance", "Daily Life & Culture", "Strategy & Action"];
  const learnState = { topic: Object.keys(L.phrases)[0], answers: {}, grammarPy: true, mistakesPy: true, idiomCat: "All", idiomPy: true, quizPy: false, sbIdx: 0, sbPicked: [], sbChecked: null, sbShuffled: null };
  const paperLink = (id) => { const p = papers.find((x) => x.id === id); return p ? `<a href="#/paper/${p.id}">${p.no} ${esc(p.title)}</a>` : ""; };
  const sayItem = (zhs, py, en) => `<button class="say" data-say="${esc(zhs)}" title="Listen"><span class="zh" lang="zh-Hans">${esc(zhs)}</span><span class="py lat">${esc(py)}</span>${en ? `<span class="en">${esc(en)}</span>` : ""}</button>`;
  const speedRow = () => canSpeak ? `<div class="chip-row speed-row" role="group" aria-label="Speaking speed"><span class="chip-label">Speed</span>
      ${[["0.55", "Slow"], ["0.85", "Normal"]].map(([v, t]) => `<button class="chip" data-rate="${v}" aria-pressed="${String(speechRate) === v}">${t}</button>`).join("")}</div>` : "";
  const secHead = (no, id, en, zhs, intro) => `<summary class="sec-head">
      <span class="sec-no mono">${no}</span>
      <div class="sec-head-text">
        <h2>${en} <span class="zh" lang="zh-Hans">${zhs}</span></h2>
        <p>${intro}</p>
      </div>
      <span class="sec-toggle-indicator" aria-hidden="true">
        <span class="toggle-hint-open">Expand 展开</span>
        <span class="toggle-hint-close">Collapse 收起</span>
        <svg class="chevron-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-9"/>
        </svg>
      </span>
    </summary>`;
  const further = (items) => `<p class="further"><span>Go further</span>${items.filter(Boolean).join("")}</p>`;

  function wordOfDay() {
    const pool = shuffled(WORDS.filter((w) => w.lv <= 2 && w.group !== "Phrases" && w.syl.length), "wotd");
    const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    return pool[day % pool.length];
  }

  function phraseCards() {
    return (L.phrases[learnState.topic] || []).map(([en, zhs, py, note], i) => `
      <button class="flip" data-flip aria-expanded="false" aria-label="${esc(en)}. Tap to see the Chinese.">
        <span class="flip-front"><span class="flip-en">${esc(en)}</span><span class="flip-hint">Say it in Chinese, then tap to check</span></span>
        <span class="flip-back"><span class="zh" lang="zh-Hans">${esc(zhs)}</span><span class="py lat">${esc(py)}</span>${note ? `<span class="flip-note">${esc(note)}</span>` : ""}</span>
      </button>`).join("");
  }

  function idiomCards() {
    const pool = (L.idioms || []).filter((item) => learnState.idiomCat === "All" || item.cat === learnState.idiomCat);
    return pool.map((item) => `
      <article class="idiom-card">
        <div class="idiom-head">
          <div class="idiom-title-wrap">
            <h3 class="idiom-zh zh" lang="zh-Hans">
              <button class="say-line idiom-btn" data-say="${esc(item.zh)}" title="Listen to ${esc(item.zh)}">${esc(item.zh)}</button>
            </h3>
            <span class="py lat idiom-py">${esc(item.py)}</span>
          </div>
          <span class="idiom-cat-tag">${esc(item.cat)}</span>
        </div>
        <p class="idiom-literal"><span class="lbl-inline">Literal:</span> ${esc(item.literal)}</p>
        <p class="idiom-meaning"><span class="lbl-inline">Meaning:</span> <b>${esc(item.meaning)}</b></p>
        <div class="idiom-story">
          <span class="story-tag">Origin & Fable · 典故</span>
          <p>${esc(item.story)}</p>
        </div>
        <div class="idiom-ex">
          <span class="ex-lbl">Example · 例句</span>
          <div class="ex-speech">
            <button class="say-line" data-say="${esc(item.exZh)}" title="Listen">
              <span class="zh" lang="zh-Hans">${esc(item.exZh)}</span>
            </button>
            <span class="py lat ex-py">${esc(item.exPy)}</span>
          </div>
          <p class="ex-en">${esc(item.exEn)}</p>
        </div>
      </article>
    `).join("");
  }

  function quizHtml() {
    const done = Object.keys(learnState.answers).length;
    const right = L.quiz.filter((q, i) => learnState.answers[i] === q[2]).length;
    return `<ol class="quiz${learnState.quizPy ? "" : " hide-py"}">${L.quiz.map(([q, opts, ok, why, optsPy, qPy], i) => {
      const a = learnState.answers[i];
      const answered = a !== undefined;
      return `<li class="q${answered ? (a === ok ? " is-right" : " is-wrong") : ""}">
        <p class="q-text">${latin(esc(q))}${qPy ? ` <span class="py lat q-py">${esc(qPy)}</span>` : ""}</p>
        <div class="q-opts">${opts.map((o, j) => `<button class="q-opt${answered && j === ok ? " ok" : ""}${answered && j === a && a !== ok ? " no" : ""}" data-q="${i}" data-a="${j}" ${answered ? "disabled" : ""}><span class="q-letter">${LETTERS[j]}</span><span class="q-opt-body">${hasZh(o) ? zh(o) : `<span class="lat">${esc(o)}</span>`}${optsPy && optsPy[j] ? `<span class="py lat q-py">${esc(optsPy[j])}</span>` : ""}</span></button>`).join("")}</div>
        ${answered ? `<p class="q-why"><b>${a === ok ? "Correct." : "Not quite."}</b> ${latin(esc(why))}</p>` : ""}
      </li>`; }).join("")}</ol>
      <div class="quiz-score" aria-live="polite">
        <p><b class="mono">${right} / ${L.quiz.length}</b> ${done < L.quiz.length ? `· ${L.quiz.length - done} left to answer` : right === L.quiz.length ? "· Perfect score. 太棒了！" : right >= 7 ? "· Great work. Review the ones you missed above." : "· Read sections 03 and 04 again, then try once more."}</p>
        ${done ? `<button class="btn ghost small" data-quiz-reset>Try again</button>` : ""}
      </div>`;
  }

  function renderHome() {
    document.title = "N1Mandarin — Learn Mandarin from English, one clear step at a time";
    setActiveNav("learn");
    const w = wordOfDay();
    main.innerHTML = `
      <section class="hero home-hero">
        <div class="hero-text">
          <p class="eyebrow">For English speakers · 给说英语的中文学习者</p>
          <h1>From English to Mandarin, one clear step at a time.</h1>
          <p class="hero-zh zh" lang="zh-Hans">从英语到中文，一步一步。</p>
          <p class="lede">Mandarin explained from an English speaker's point of view: the sounds English doesn't have, where the grammar works the other way round, and the mistakes English speakers make most. Tap any Chinese example to hear it.</p>
          <div class="hero-ctas"><button class="btn" data-jump="phrases">Start learning</button><button class="btn ghost" data-jump="quiz">Take the quiz</button></div>
        </div>
        ${w ? `<aside class="wotd" aria-label="Word of the day">
          <p class="eyebrow">Word of the day · 每日一词</p>
          <button class="wotd-word" data-say="${esc(w.zh)}" title="Listen"><span class="zh" lang="zh-Hans">${esc(w.zh)}</span>${canSpeak ? ICON_SOUND : ""}</button>
          <p class="wotd-py lat">${esc(w.py)}</p>
          <p class="wotd-en">${esc(shortEn(w.en))}</p>
          <ul class="wotd-split">${w.syl.map((x) => `<li><span class="lat">${esc(x.text)}</span><small>${x.ini ? `<b>${esc(x.ini)}</b> + ` : ""}${esc(finLabel(x.fin))} · tone ${x.tone === 5 ? "neutral" : x.tone}</small></li>`).join("")}</ul>
          <p class="wotd-meta"><span>HSK ${w.lv}</span><span>${esc(w.pos.split(",")[0])}</span><button class="link" data-split="${esc(w.py)}">Hear each sound</button></p>
        </aside>` : ""}
      </section>

      <div class="path-wrap">
        <nav class="path" aria-label="Learning path">
          ${[
            ["phrases", "Phrases"],
            ["characters", "Characters"],
            ["grammar", "Grammar"],
            ["sounds", "Sounds"],
            ["mistakes", "Mistakes"],
            ["idioms", "Idioms"],
            ["quiz", "Quiz"],
            ["tools", "Study tools"]
          ].map(([id, t], i) => `<button data-jump="${id}"><span class="mono">${i < 7 ? "0" + (i + 1) : "→"}</span>${t}</button>`).join("")}
        </nav>
        <button class="path-toggle-btn" id="toggle-all-secs" type="button" aria-expanded="false" title="Expand or collapse all sections">
          <span class="mono">↕</span> <span class="toggle-all-lbl">Expand all 全部展开</span>
        </button>
      </div>

      <!-- 01 Phrases -->
      <details class="learn-sec" id="phrases">
        ${secHead("01", "phrases", "Everyday phrase cards", "常用语卡片", "Read the English, try to say it in Mandarin, then tap the card to check and hear it. Start with greetings and the classroom phrases. You'll use them every lesson.")}
        <div class="sec-body">
          ${chipRow("Topic", Object.keys(L.phrases), learnState.topic, "data-topic")}
          ${speedRow()}
          <div class="flip-grid" data-flips>${phraseCards()}</div>
          ${further([`<a href="#/flashcards">Flashcards: all 2,000 HSK 1–4 words</a>`, paperLink("greetings"), paperLink("food-drink"), paperLink("directions")])}
        </div>
      </details>

      <!-- 02 Characters -->
      <details class="learn-sec" id="characters">
        ${secHead("02", "characters", "How written Chinese works", "汉字造字法 · 六书", (L.characters && L.characters.intro) || "Understand the Six Writings (六书): pictograms, ideograms, and the phono-semantic formula behind 80%+ of characters.")}
        <div class="sec-body">
          ${L.characters ? `
            <div class="liushu-grid">
              ${L.characters.types.map((t) => `
                <article class="liushu-card ${t.no === "04" ? "featured" : ""}">
                  <div class="liushu-card-head">
                    <span class="sec-no mono">${t.no}</span>
                    <div>
                      <h3>${esc(t.name)} <span class="zh" lang="zh-Hans">${esc(t.zh)}</span> <span class="py lat">${esc(t.py)}</span></h3>
                      <p class="liushu-summary">${esc(t.summary)}</p>
                    </div>
                  </div>
                  <p class="liushu-details">${esc(t.details)}</p>
                  <div class="liushu-examples">
                    ${t.examples.map(([char, py, en, note]) => `
                      <button class="char-chip" data-say="${esc(char)}" title="Listen to ${esc(char)}">
                        <span class="char-glyph zh" lang="zh-Hans">${esc(char)}</span>
                        <span class="char-py lat">${esc(py)}</span>
                        <span class="char-en">${esc(en)}</span>
                        <small class="char-note">${esc(note)}</small>
                      </button>
                    `).join("")}
                  </div>
                </article>
              `).join("")}
            </div>

            <div class="rules-box">
              <div class="rules-head">
                <h3>The 7 Golden Stroke Order Rules <span class="zh" lang="zh-Hans">笔顺七条基本规则</span></h3>
                <p>Strokes are written in a strictly standardized sequence so characters balance naturally and remain legible in handwriting.</p>
              </div>
              <div class="stroke-grid">
                ${L.characters.rules.map(([en, zhRule, ex, tip], idx) => `
                  <div class="stroke-rule">
                    <span class="rule-num mono">0${idx + 1}</span>
                    <div class="rule-body">
                      <h4>${esc(en)} <span class="zh" lang="zh-Hans">${esc(zhRule)}</span></h4>
                      <p class="rule-ex"><span class="zh" lang="zh-Hans">${esc(ex)}</span></p>
                      <p class="rule-tip">${esc(tip)}</p>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ""}
          ${further([`<a href="#/write">Writing studio: Interactive Tian Zi Ge pad & stroke rules</a>`, paperLink("characters"), paperLink("characters-2"), paperLink("characters-hsk2"), paperLink("characters-hsk3"), paperLink("liushu")])}
        </div>
      </details>

      <!-- 03 Grammar -->
      <details class="learn-sec" id="grammar">
        ${secHead("03", "grammar", "Where the grammar differs", "语法差异", `Mandarin grammar is often simpler than English: no tenses, no plurals and no verb endings. But the word order follows different rules. These are the ${L.grammar.length} differences that matter most at the start.`)}
        <div class="sec-body">
          <div class="chip-row sec-tools" role="group" aria-label="Grammar pinyin display">
            <span class="chip-label">Pinyin</span>
            <button class="chip" data-py-opt="grammar" data-show="true" aria-pressed="${learnState.grammarPy}">Show 显示</button>
            <button class="chip" data-py-opt="grammar" data-show="false" aria-pressed="${!learnState.grammarPy}">Hide 隐藏</button>
          </div>
          <ol class="gram-grid${learnState.grammarPy ? "" : " hide-py"}">${L.grammar.map((g, i) => `<li class="gram">
            <span class="gram-no mono">${String(i + 1).padStart(2, "0")}</span>
            <h3>${esc(g.title)} <span class="zh" lang="zh-Hans">${esc(g.zh)}</span></h3>
            <p>${latin(esc(g.en))}</p>
            <div class="ex bad">
              <span class="mark" aria-label="Wrong">✗</span>
              <div class="ex-body">
                ${zh(g.wrong)}
                ${g.wrongPy ? `<span class="py lat ex-py">${esc(g.wrongPy)}</span>` : ""}
              </div>
            </div>
            <div class="ex good">
              <span class="mark" aria-label="Right">✓</span>
              <div class="ex-body">
                <button class="say-line" data-say="${esc(g.right)}" title="Listen">${zh(g.right)}</button>
                ${g.rightPy ? `<span class="py lat ex-py">${esc(g.rightPy)}</span>` : ""}
              </div>
            </div>
            <p class="gloss">${esc(g.gloss)}</p>
          </li>`).join("")}</ol>
          <div class="sb-box${learnState.grammarPy ? "" : " hide-py"}" data-sb>${sentenceBuilderHtml()}</div>
          ${further([paperLink("measure-words"), paperLink("question-words"), paperLink("le-guo"), paperLink("de"), paperLink("de-de-de"), paperLink("zai"), paperLink("ba"), paperLink("jiu-cai")])}
        </div>
      </details>

      <!-- 04 Sounds (before mistakes) -->
      <details class="learn-sec" id="sounds">
        ${secHead("04", "sounds", "Sounds English doesn't have", "英语里没有的音", "Most Mandarin sounds are close to English, but a few have no English match and change the meaning of a word. Each card says how to make the sound. Tap the pairs and listen for the difference.")}
        <div class="sec-body">
          ${speedRow()}
          <div class="sound-grid">${L.sounds.map((s) => `<article class="sound">
            <p class="sound-sym lat">${esc(s.sym)}</p>
            <h3>${esc(s.title)}</h3>
            <p class="sound-tip">${esc(s.tip)}</p>
            <ul class="pairs">${s.pairs.reduce((rows, p, i) => (i % 2 ? rows[rows.length - 1].push(p) : rows.push([p]), rows), []).map(([a, b]) => `<li>${sayItem(...a)}<span class="vs">vs</span>${sayItem(...b)}</li>`).join("")}</ul>
          </article>`).join("")}</div>
          ${further([`<a href="#/pinyin">Pinyin sounds: split any syllable and hear every initial and final</a>`, paperLink("tones"), paperLink("initials-finals"), paperLink("tricky-sounds")])}
        </div>
      </details>

      <!-- 05 Mistakes -->
      <details class="learn-sec" id="mistakes">
        ${secHead("05", "mistakes", "Common English-speaker mistakes", "英语母语者的常见错误", "These are the sentences English speakers build by translating word for word. The Chinese is understandable, but it sounds wrong. Learn the natural version and why it works.")}
        <div class="sec-body">
          <div class="chip-row sec-tools" role="group" aria-label="Mistakes pinyin display">
            <span class="chip-label">Pinyin</span>
            <button class="chip" data-py-opt="mistakes" data-show="true" aria-pressed="${learnState.mistakesPy}">Show 显示</button>
            <button class="chip" data-py-opt="mistakes" data-show="false" aria-pressed="${!learnState.mistakesPy}">Hide 隐藏</button>
          </div>
          <ul class="fix-list${learnState.mistakesPy ? "" : " hide-py"}">${L.mistakes.map(([bad, good, badPy, goodPy, note]) => `<li class="fix">
            <div class="ex bad">
              <span class="mark" aria-label="Wrong">✗</span>
              <div class="ex-body">
                ${zh(bad)}
                ${badPy ? `<span class="py lat ex-py">${esc(badPy)}</span>` : ""}
              </div>
            </div>
            <div class="ex good">
              <span class="mark" aria-label="Right">✓</span>
              <div class="ex-body">
                <button class="say-line" data-say="${esc(good)}" title="Listen">${zh(good)}</button>
                ${goodPy ? `<span class="py lat ex-py">${esc(goodPy)}</span>` : ""}
              </div>
            </div>
            <p class="fix-note">${latin(esc(note))}</p>
          </li>`).join("")}</ul>
          ${further([paperLink("hui-neng-keyi"), paperLink("comparisons"), paperLink("yiyang-yuelaiyue"), paperLink("connectors"), paperLink("chule-yijiu")])}
        </div>
      </details>

      <!-- 06 Idioms -->
      <details class="learn-sec" id="idioms">
        ${secHead("06", "idioms", "Essential Chinese idioms", "常用成语 · 经典熟语", "Four-character idioms (成语 chéngyǔ) and iconic proverbs are the poetic soul of Mandarin. Each condenses a timeless fable, historical event, or philosophical metaphor into vivid, memorable expressions. Here are 25 essential idioms and sayings every speaker knows.")}
        <div class="sec-body">
          <div class="idiom-controls">
            ${chipRow("Category", IDIOM_CATS, learnState.idiomCat, "data-idiom-cat")}
            <div class="chip-row sec-tools" role="group" aria-label="Idioms pinyin display">
              <span class="chip-label">Pinyin</span>
              <button class="chip" data-py-opt="idioms" data-show="true" aria-pressed="${learnState.idiomPy}">Show 显示</button>
              <button class="chip" data-py-opt="idioms" data-show="false" aria-pressed="${!learnState.idiomPy}">Hide 隐藏</button>
            </div>
          </div>
          <div class="idioms-grid${learnState.idiomPy ? "" : " hide-py"}" data-idioms>${idiomCards()}</div>
          <p class="sec-credit"><span class="credit-badge">Credit</span> Curated with special thanks to <b>Finley Jennings</b> · 特别鸣谢 Finley Jennings</p>
          ${further([paperLink("idioms")])}
        </div>
      </details>

      <!-- 07 Quiz -->
      <details class="learn-sec" id="quiz">
        ${secHead("07", "quiz", "Quick quiz", "小测验", "Questions on sounds, characters, grammar, common mistakes, and idioms. Pick an answer to see whether it's right and why.")}
        <div class="sec-body">
          <div class="chip-row sec-tools" role="group" aria-label="Quiz pinyin display">
            <span class="chip-label">Pinyin</span>
            <button class="chip" data-py-opt="quiz" data-show="true" aria-pressed="${learnState.quizPy}">Show 显示</button>
            <button class="chip" data-py-opt="quiz" data-show="false" aria-pressed="${!learnState.quizPy}">Hide 隐藏</button>
          </div>
          <div data-quiz>${quizHtml()}</div>
        </div>
      </details>

      <section class="toolkit learn-tools" aria-labelledby="tools">
        <div class="toolkit-head" id="tools">
          <h2>Keep studying <span class="zh">学习工具</span></h2>
          <p>Built from the New HSK (3.0) lists: 300 Level 1, 200 Level 2, 500 Level 3 and 1,000 Level 4 words.</p>
        </div>
        <div class="tools">
          <a class="tool" href="#/pinyin"><span class="tool-zh zh">音</span><h3>Pinyin sounds</h3><p>Split any syllable into initial, final and tone. Hear every sound and find the HSK words that use it.</p></a>
          <a class="tool" href="#/words"><span class="tool-zh zh">词</span><h3>Word list</h3><p>All 2,000 HSK 1–4 words with pinyin and meaning. Hide columns to test yourself and tick the words you know.</p></a>
          <a class="tool" href="#/flashcards"><span class="tool-zh zh">卡</span><h3>Flashcards</h3><p>Flip through words by topic, hear each one, and sort them into "know it" and "still learning".</p></a>
          <a class="tool" href="#/papers"><span class="tool-zh zh">纸</span><h3>Worksheets</h3><p>${papers.length} printable papers with answer keys, from pinyin and tones to 把 and result complements.</p></a>
        </div>
        <p class="teacher-note">Teaching a class? Print any worksheet on A4, or use the <a href="#/generate">paper generator</a> to build a new HSK paper with an answer key. See <a href="#/about">For teachers</a>.</p>
      </section>`;

    wireSpeak(main);
    wireHome();
  }

  function wireHome() {
    main.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => {
      const targetId = b.dataset.jump;
      const t = document.getElementById(targetId);
      if (t) {
        if (t.tagName === "DETAILS" && !t.open) {
          t.open = true;
        } else {
          const parent = t.closest("details");
          if (parent && !parent.open) parent.open = true;
        }
        t.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }));

    const toggleAllBtn = main.querySelector("#toggle-all-secs");
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener("click", () => {
        const secs = Array.from(main.querySelectorAll("details.learn-sec"));
        const anyClosed = secs.some((s) => !s.open);
        secs.forEach((s) => { s.open = anyClosed; });
        toggleAllBtn.setAttribute("aria-expanded", String(anyClosed));
        const lbl = toggleAllBtn.querySelector(".toggle-all-lbl");
        if (lbl) lbl.textContent = anyClosed ? "Collapse all 全部收起" : "Expand all 全部展开";
      });

      main.querySelectorAll("details.learn-sec").forEach((sec) => {
        sec.addEventListener("toggle", () => {
          const secs = Array.from(main.querySelectorAll("details.learn-sec"));
          const allOpen = secs.every((s) => s.open);
          const lbl = toggleAllBtn.querySelector(".toggle-all-lbl");
          if (lbl) lbl.textContent = allOpen ? "Collapse all 全部收起" : "Expand all 全部展开";
          toggleAllBtn.setAttribute("aria-expanded", String(allOpen));
        });
      });
    }

    main.querySelectorAll("[data-rate]").forEach((b) => b.addEventListener("click", () => {
      speechRate = +b.dataset.rate;
      main.querySelectorAll("[data-rate]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.rate === b.dataset.rate));
    }));
    const split = main.querySelector("[data-split]");
    if (split) split.addEventListener("click", () => { pyState.q = split.dataset.split; location.hash = "#/pinyin"; });
    main.querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => {
      learnState.topic = b.dataset.topic;
      main.querySelectorAll("[data-topic]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      main.querySelector("[data-flips]").innerHTML = phraseCards();
      wireFlips();
    }));
    main.querySelectorAll("[data-idiom-cat]").forEach((b) => b.addEventListener("click", () => {
      learnState.idiomCat = b.dataset.idiomCat;
      main.querySelectorAll("[data-idiom-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const grid = main.querySelector("[data-idioms]");
      if (grid) {
        grid.innerHTML = idiomCards();
        wireSpeak(grid);
      }
    }));
    main.querySelectorAll("[data-py-opt]").forEach((b) => b.addEventListener("click", () => {
      const sec = b.dataset.pyOpt;
      const show = b.dataset.show === "true";
      if (sec === "grammar") {
        learnState.grammarPy = show;
        main.querySelectorAll(`[data-py-opt="grammar"]`).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.show === String(show))));
        const grid = main.querySelector(".gram-grid");
        if (grid) grid.classList.toggle("hide-py", !show);
        const sb = main.querySelector(".sb-box");
        if (sb) sb.classList.toggle("hide-py", !show);
      } else if (sec === "mistakes") {
        learnState.mistakesPy = show;
        main.querySelectorAll(`[data-py-opt="mistakes"]`).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.show === String(show))));
        const list = main.querySelector(".fix-list");
        if (list) list.classList.toggle("hide-py", !show);
      } else if (sec === "idioms") {
        learnState.idiomPy = show;
        main.querySelectorAll(`[data-py-opt="idioms"]`).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.show === String(show))));
        const grid = main.querySelector(".idioms-grid");
        if (grid) grid.classList.toggle("hide-py", !show);
      } else if (sec === "quiz") {
        learnState.quizPy = show;
        main.querySelectorAll(`[data-py-opt="quiz"]`).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.show === String(show))));
        const qList = main.querySelector(".quiz");
        if (qList) qList.classList.toggle("hide-py", !show);
      }
    }));
    wireFlips();
    wireQuiz();
    wireSentenceBuilder();
  }

  function sentenceBuilderHtml() {
    const items = L.sentenceBuilder || [];
    if (!items.length) return "";
    const idx = ((learnState.sbIdx % items.length) + items.length) % items.length;
    const item = items[idx];
    if (!learnState.sbShuffled || learnState.sbShuffledIdx !== idx) {
      const indices = item.tokens.map((_, i) => i);
      let shuf = shuffled(indices, `sb-${idx}-${item.zh}`);
      // Ensure it is actually scrambled when possible
      if (shuf.length > 1 && shuf.every((v, i) => v === i)) shuf = [...shuf.slice(1), shuf[0]];
      learnState.sbShuffled = shuf;
      learnState.sbShuffledIdx = idx;
    }
    const picked = learnState.sbPicked;
    const remaining = learnState.sbShuffled.filter((i) => !picked.includes(i));
    const trayClass = learnState.sbChecked === true ? "is-right" : (learnState.sbChecked === false ? "is-wrong" : "");
    return `
      <div class="sb-head">
        <h3>Sentence Word-Order Builder <span class="zh">组句练习</span></h3>
        <span class="sb-progress mono">${idx + 1} / ${items.length}</span>
      </div>
      <div>
        <span class="sb-rule-tag">${esc(item.rule)}</span>
        <p class="sb-prompt-en">${esc(item.en)}</p>
      </div>
      <div class="sb-tray ${trayClass}" aria-label="Your sentence">
        ${picked.length
          ? picked.map((ti, pos) => `<button type="button" class="sb-tile in-tray" data-sb-remove="${pos}" title="Remove tile"><span class="sb-tile-zh zh" lang="zh-Hans">${esc(item.tokens[ti][0])}</span><span class="sb-tile-py lat">${esc(item.tokens[ti][1])}</span></button>`).join("")
          : `<span class="sb-placeholder">Tap the Chinese word tiles below in the right Mandarin order…</span>`}
      </div>
      <div class="sb-bank" aria-label="Available word tiles">
        ${remaining.map((ti) => `<button type="button" class="sb-tile" data-sb-add="${ti}"><span class="sb-tile-zh zh" lang="zh-Hans">${esc(item.tokens[ti][0])}</span><span class="sb-tile-py lat">${esc(item.tokens[ti][1])}</span></button>`).join("")}
      </div>
      ${learnState.sbChecked !== null ? `
        <div class="sb-feedback ${learnState.sbChecked ? "good" : "bad"}">
          <div class="sb-fb-head">
            <span>${learnState.sbChecked ? "✓ Correct!" : "✗ Not quite — correct order:"}</span>
            <button type="button" class="say-line" data-say="${esc(item.zh)}" title="Listen">${zh(item.zh)}</button>
            <span class="py lat sb-fb-py">${esc(item.py)}</span>
          </div>
          <p class="sb-fb-note">${esc(item.note)}</p>
        </div>` : ""}
      <div class="sb-actions">
        <div class="sb-actions-left">
          <button type="button" class="btn small" data-sb-check ${picked.length === item.tokens.length ? "" : "disabled"}>Check 检查</button>
          <button type="button" class="btn small ghost" data-sb-reset>Reset</button>
        </div>
        <div class="sb-actions-right">
          <button type="button" class="btn small ghost" data-sb-prev>← Prev</button>
          <button type="button" class="btn small ghost" data-sb-next>Next →</button>
        </div>
      </div>`;
  }

  function wireSentenceBuilder() {
    const box = main.querySelector("[data-sb]");
    if (!box) return;
    const items = L.sentenceBuilder || [];
    if (!items.length) return;
    const redraw = () => {
      box.innerHTML = sentenceBuilderHtml();
      wireSpeak(box);
      wireSentenceBuilder();
    };
    box.querySelectorAll("[data-sb-add]").forEach((b) => b.addEventListener("click", () => {
      learnState.sbPicked.push(+b.dataset.sbAdd);
      learnState.sbChecked = null;
      redraw();
    }));
    box.querySelectorAll("[data-sb-remove]").forEach((b) => b.addEventListener("click", () => {
      learnState.sbPicked.splice(+b.dataset.sbRemove, 1);
      learnState.sbChecked = null;
      redraw();
    }));
    const chk = box.querySelector("[data-sb-check]");
    if (chk) chk.addEventListener("click", () => {
      const item = items[learnState.sbIdx];
      const built = learnState.sbPicked.map((ti) => item.tokens[ti][0]).join("");
      const target = item.tokens.map((t) => t[0]).join("");
      learnState.sbChecked = built === target;
      if (learnState.sbChecked) speak(item.zh);
      redraw();
    });
    const rst = box.querySelector("[data-sb-reset]");
    if (rst) rst.addEventListener("click", () => { learnState.sbPicked = []; learnState.sbChecked = null; redraw(); });
    const go = (delta) => {
      learnState.sbIdx = (learnState.sbIdx + delta + items.length) % items.length;
      learnState.sbPicked = [];
      learnState.sbChecked = null;
      learnState.sbShuffled = null;
      redraw();
    };
    const prev = box.querySelector("[data-sb-prev]");
    const next = box.querySelector("[data-sb-next]");
    if (prev) prev.addEventListener("click", () => go(-1));
    if (next) next.addEventListener("click", () => go(1));
  }

  function wireFlips() {
    main.querySelectorAll("[data-flip]").forEach((c) => c.addEventListener("click", () => {
      const open = c.getAttribute("aria-expanded") !== "true";
      c.setAttribute("aria-expanded", open);
      if (open) speak(c.querySelector(".flip-back .zh").textContent);
    }));
  }

  function wireQuiz() {
    const box = main.querySelector("[data-quiz]");
    box.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
      learnState.answers[+b.dataset.q] = +b.dataset.a;
      box.innerHTML = quizHtml();
      wireQuiz();
    }));
    const r = box.querySelector("[data-quiz-reset]");
    if (r) r.addEventListener("click", () => { learnState.answers = {}; box.innerHTML = quizHtml(); wireQuiz(); box.scrollIntoView({ behavior: "smooth" }); });
  }

  /* ---------- Library ---------- */
  function uniq(key) { return ["All", ...new Set(papers.map((p) => p[key]))]; }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return papers.filter((p) =>
      (state.level === "All" || p.level === state.level) &&
      (state.skill === "All" || p.skill === state.skill) &&
      (!q || [p.title, p.zh, p.summary, p.skill, p.level].join(" ").toLowerCase().includes(q)));
  }

  function cards() {
    const list = filtered();
    if (!list.length) return `<p class="empty">No papers match those filters. <button class="link" data-reset>Clear filters</button></p>`;
    return list.map((p) => `
      <a class="card" href="#/paper/${p.id}">
        <span class="card-no">${p.no}</span>
        <span class="card-zh">${zh(p.zh)}</span>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.summary)}</p>
        <span class="meta"><span>${esc(p.level)}</span><span>${esc(p.skill)}</span><span>${p.minutes} min</span></span>
      </a>`).join("");
  }

  function renderLibrary() {
    document.title = "Worksheets — N1Mandarin";
    setActiveNav("papers");
    main.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">For teachers and self-study · 练习纸</p>
        <h1>Worksheets <span class="zh">练习纸</span></h1>
        <p class="lede">${papers.length} printable papers that follow the learning path: pinyin and tones, everyday phrases, grammar points and character practice for HSK 1–3. Each one has an answer key and prints cleanly on A4. Need more? <a href="#/generate">Generate a new HSK paper</a>.</p>
      </section>
      <section id="library" class="library">
        <div class="library-head">
          <h2>All papers</h2>
          <label class="search"><span class="sr">Search papers</span>
            <input type="search" placeholder="Search papers…" value="${esc(state.q)}" data-search /></label>
        </div>
        ${chipRow("Level", uniq("level"), state.level, 'data-level')}
        ${chipRow("Skill", uniq("skill"), state.skill, 'data-skill')}
        <div class="cards" data-cards>${cards()}</div>
      </section>`;
    main.querySelectorAll("[data-level],[data-skill]").forEach((b) => b.addEventListener("click", () => {
      const key = b.dataset.level !== undefined ? "level" : "skill";
      state[key] = b.dataset[key];
      main.querySelectorAll(`[data-${key}]`).forEach((x) => x.setAttribute("aria-pressed", x === b));
      refreshCards();
    }));
    main.querySelector("[data-search]").addEventListener("input", (e) => { state.q = e.target.value; refreshCards(); });
  }

  function refreshCards() {
    const box = main.querySelector("[data-cards]");
    box.innerHTML = cards();
    const r = box.querySelector("[data-reset]");
    if (r) r.addEventListener("click", () => { state.level = state.skill = "All"; state.q = ""; renderLibrary(); });
  }

  /* ---------- Paper sheet (shared by library papers and generator) ---------- */
  const ans = (a) => `<span class="answer">${latin(esc(a))}</span>`;
  const line = `<span class="write-line"></span>`;
  const promptOf = (it) => `<span class="prompt">${hasZh(it.q) ? zh(it.q) : esc(it.q)}${it.py ? ` <span class="py">${esc(it.py)}</span>` : ""}</span>`;

  const sectionRenderers = {
    tone: (s) => `<ol class="items two-col">${s.items.map((it) => `<li>${promptOf(it)}${line}${ans(it.a)}</li>`).join("")}</ol>`,
    translate: (s) => `<ol class="items">${s.items.map((it) => `<li>${promptOf(it)}${line}${ans(it.a)}</li>`).join("")}</ol>`,
    match: (s, p, i) => {
      const opts = shuffled(s.items.map((it) => it.a), p.id + i);
      return `<div class="match">
        <ol class="items items-match">${s.items.map((it) => `<li><span class="prompt">${zh(it.zh)} <span class="py">${esc(it.py)}</span></span><span class="box-ans"></span>${ans(LETTERS[opts.indexOf(it.a)])}</li>`).join("")}</ol>
        <ul class="options">${opts.map((o, k) => `<li><b>${LETTERS[k]}</b> ${esc(o)}</li>`).join("")}</ul>
      </div>`;
    },
    fill: (s) => `${s.bank ? `<div class="bank" aria-label="Word box">${s.bank.map(zh).join("")}</div>` : ""}
      <ol class="items items-fill">${s.items.map((it) => `<li><span class="prompt"><span class="zh" lang="zh-Hans">${gapZh(it.zh)}</span> <span class="py">${gap(it.py)}</span></span>${ans(it.a)}</li>`).join("")}</ol>`,
    grid: (s) => `<div class="grid-sheet">${s.items.map((it) => `
      <div class="grid-row">
        <div class="grid-info"><span class="zh">${esc(it.zh)}</span><span class="py">${esc(it.py)}</span><span class="en">${esc(it.en)}${it.strokes ? ` · ${it.strokes} strokes` : ""}</span></div>
        <div class="grid-boxes">
          <span class="tzg ink">${esc(it.zh)}</span><span class="tzg trace">${esc(it.zh)}</span><span class="tzg trace">${esc(it.zh)}</span>
          ${'<span class="tzg"></span>'.repeat(5)}
        </div>
      </div>`).join("")}</div>`,
    reading: (s) => `<div class="passage">
        <p class="zh passage-zh" lang="zh-Hans">${esc(s.passage)}</p>
        ${s.pinyin ? `<p class="py passage-py">${esc(s.pinyin)}</p>` : ""}
      </div>
      <ol class="items items-reading">${s.items.map((it) => `<li><span class="prompt">${zh(it.q)}</span>${line}${ans(it.a)}</li>`).join("")}</ol>`
  };

  function sheetHtml(p) {
    return `<article class="sheet ${state.answers ? "show-answers" : ""} ${state.pinyin ? "" : "hide-pinyin"}">
        <header class="sheet-head">
          <div>
            <p class="eyebrow">${p.eyebrow || `Paper ${p.no} · ${esc(p.level)} · ${esc(p.skill)} · ${p.minutes} min`}</p>
            <h1>${esc(p.title)} <span class="zh">${esc(p.zh)}</span></h1>
          </div>
          <dl class="student">
            <div><dt>Name 姓名</dt><dd></dd></div>
            <div><dt>Date 日期</dt><dd></dd></div>
            <div><dt>Score 分数</dt><dd></dd></div>
          </dl>
        </header>
        <p class="answer-banner">Answer key 答案</p>
        ${p.sections.map((s, i) => `
          <section class="part">
            <h2><span class="part-no">${LETTERS[i]}</span>${esc(s.title)}</h2>
            <p class="instr">${esc(s.instructions)}</p>
            ${sectionRenderers[s.type](s, p, i)}
          </section>`).join("")}
      </article>`;
  }

  function toolbarHtml(backHref, backLabel) {
    return `<div class="toolbar no-print">
        <a href="${backHref}" class="back">← ${backLabel}</a>
        <div class="toggles">
          <label class="switch"><input type="checkbox" data-t="pinyin" ${state.pinyin ? "checked" : ""}/> <span>Pinyin</span></label>
          <label class="switch"><input type="checkbox" data-t="answers" ${state.answers ? "checked" : ""}/> <span>Answer key</span></label>
          <button class="btn small" data-print>Print / Save PDF</button>
        </div>
      </div>`;
  }

  function wireSheet() {
    main.querySelectorAll("[data-t]").forEach((c) => c.addEventListener("change", () => {
      state[c.dataset.t] = c.checked;
      const sheet = main.querySelector(".sheet");
      sheet.classList.toggle("show-answers", state.answers);
      sheet.classList.toggle("hide-pinyin", !state.pinyin);
    }));
    main.querySelector("[data-print]").addEventListener("click", () => window.print());
  }

  function renderPaper(id) {
    setActiveNav("papers");
    const p = papers.find((x) => x.id === id);
    if (!p) { main.innerHTML = `<section class="narrow"><h1>Paper not found</h1><p><a href="#/papers">Back to the worksheets</a></p></section>`; return; }
    document.title = `${p.title} — N1Mandarin`;
    const next = papers[(papers.indexOf(p) + 1) % papers.length];
    main.innerHTML = toolbarHtml("#/papers", "Worksheets") + sheetHtml(p) +
      `<nav class="next no-print"><a href="#/paper/${next.id}">Next paper: ${esc(next.title)} →</a></nav>`;
    wireSheet();
  }

  /* ---------- Word list ---------- */
  const wl = { q: "", group: "All", hidePy: false, hideEn: false, onlyLearning: false, drawOpen: false, drawStrokes: [], exploreChar: "" };

  /* ---------- Draw-to-lookup handwriting recognizer ---------- */
  let CHAR_TEMPLATES = null;
  const CHAR_META = new Map();

  function ensureCharTemplates() {
    if (CHAR_TEMPLATES) return CHAR_TEMPLATES;
    // Collect all unique Hanzi characters from HSK 1-4 words
    WORDS.forEach((w) => {
      for (const ch of w.zh) {
        if (!/[\u4e00-\u9fff]/.test(ch)) continue;
        let m = CHAR_META.get(ch);
        if (!m) {
          m = { ch, count: 0, minLv: w.lv, exact: null };
          CHAR_META.set(ch, m);
        }
        m.count++;
        if (w.lv < m.minLv) m.minLv = w.lv;
        if (w.zh === ch && !m.exact) m.exact = w;
      }
    });

    const S = 24;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d", { willReadFrequently: true });

    const normCanvas = document.createElement("canvas");
    normCanvas.width = S; normCanvas.height = S;
    const nctx = normCanvas.getContext("2d", { willReadFrequently: true });

    const blur2 = (src) => {
      const tmp = new Float32Array(S * S);
      const dst = new Float32Array(S * S);
      const pass = (a, b) => {
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const v0 = a[y * S + Math.max(0, x - 1)];
            const v1 = a[y * S + x];
            const v2 = a[y * S + Math.min(S - 1, x + 1)];
            tmp[y * S + x] = 0.25 * v0 + 0.5 * v1 + 0.25 * v2;
          }
        }
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const v0 = tmp[Math.max(0, y - 1) * S + x];
            const v1 = tmp[y * S + x];
            const v2 = tmp[Math.min(S - 1, y + 1) * S + x];
            b[y * S + x] = 0.25 * v0 + 0.5 * v1 + 0.25 * v2;
          }
        }
      };
      pass(src, dst);
      pass(dst, src);
      return src;
    };

    const l2norm = (arr) => {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
      const d = Math.sqrt(s) || 1;
      for (let i = 0; i < arr.length; i++) arr[i] /= d;
      return arr;
    };

    const downsample8 = (arr24) => {
      const out = new Float32Array(64);
      for (let gy = 0; gy < 8; gy++) {
        for (let gx = 0; gx < 8; gx++) {
          let sum = 0;
          for (let dy = 0; dy < 3; dy++) {
            for (let dx = 0; dx < 3; dx++) {
              sum += arr24[(gy * 3 + dy) * S + (gx * 3 + dx)];
            }
          }
          out[gy * 8 + gx] = sum;
        }
      }
      return l2norm(out);
    };

    CHAR_TEMPLATES = [];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '20px "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Noto Sans SC", "SimHei", sans-serif';
    ctx.fillStyle = "#000";

    CHAR_META.forEach((meta) => {
      ctx.clearRect(0, 0, S, S);
      ctx.fillText(meta.ch, S / 2, S / 2);
      const data = ctx.getImageData(0, 0, S, S).data;
      let x0 = S, y0 = S, x1 = -1, y1 = -1;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          if (data[(y * S + x) * 4 + 3] > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < x0) return;

      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const scale = 20 / Math.max(bw, bh, 6);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = (S - dw) / 2;
      const dy = (S - dh) / 2;

      nctx.clearRect(0, 0, S, S);
      nctx.drawImage(c, x0, y0, bw, bh, dx, dy, dw, dh);
      const ndata = nctx.getImageData(0, 0, S, S).data;
      const raw = new Float32Array(S * S);
      for (let i = 0; i < S * S; i++) raw[i] = ndata[i * 4 + 3] / 255;

      // 4-bin edge orientation energy from gradients (normal to stroke gives direction)
      const grad4 = new Float32Array(4);
      for (let y = 1; y < S - 1; y++) {
        for (let x = 1; x < S - 1; x++) {
          const gx = raw[y * S + (x + 1)] - raw[y * S + (x - 1)];
          const gy = raw[(y + 1) * S + x] - raw[(y - 1) * S + x];
          const mag = Math.hypot(gx, gy);
          if (mag < 0.08) continue;
          // Stroke direction is perpendicular to gradient: (-gy, gx)
          const ang = ((Math.atan2(gx, -gy) % Math.PI) + Math.PI) % Math.PI;
          if (ang < Math.PI / 8 || ang >= (7 * Math.PI) / 8) grad4[0] += mag;       // horizontal
          else if (ang < (3 * Math.PI) / 8) grad4[2] += mag;                         // diag /
          else if (ang < (5 * Math.PI) / 8) grad4[1] += mag;                         // vertical
          else grad4[3] += mag;                                                      // diag \
        }
      }
      l2norm(grad4);

      const blurred = blur2(raw.slice());
      const tpl8 = downsample8(blurred);
      const tpl24 = l2norm(blurred);
      const aspect = Math.log((bw + 4) / (bh + 4));

      CHAR_TEMPLATES.push({ ch: meta.ch, meta, tpl24, tpl8, grad4, aspect });
    });

    // Attach helpers for query encoding
    CHAR_TEMPLATES._encode = (strokes) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let pts = 0;
      strokes.forEach((st) => st.forEach(([x, y]) => {
        pts++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }));
      if (!pts) return null;
      const bw = Math.max(maxX - minX, 1);
      const bh = Math.max(maxY - minY, 1);
      const scale = 20 / Math.max(bw, bh, 24);
      const ox = (S - bw * scale) / 2 - minX * scale;
      const oy = (S - bh * scale) / 2 - minY * scale;

      nctx.clearRect(0, 0, S, S);
      nctx.strokeStyle = "#000";
      nctx.lineWidth = 2.0;
      nctx.lineCap = "round";
      nctx.lineJoin = "round";

      const qGrad4 = new Float32Array(4);
      strokes.forEach((st) => {
        if (!st.length) return;
        nctx.beginPath();
        nctx.moveTo(st[0][0] * scale + ox, st[0][1] * scale + oy);
        if (st.length === 1) {
          nctx.lineTo(st[0][0] * scale + ox + 0.1, st[0][1] * scale + oy + 0.1);
        }
        for (let i = 1; i < st.length; i++) {
          const x0 = st[i - 1][0], y0 = st[i - 1][1];
          const x1 = st[i][0], y1 = st[i][1];
          nctx.lineTo(x1 * scale + ox, y1 * scale + oy);
          const dx = x1 - x0, dy = y1 - y0;
          const len = Math.hypot(dx, dy);
          if (len > 0.5) {
            const ang = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI;
            if (ang < Math.PI / 8 || ang >= (7 * Math.PI) / 8) qGrad4[0] += len;
            else if (ang < (3 * Math.PI) / 8) qGrad4[3] += len;
            else if (ang < (5 * Math.PI) / 8) qGrad4[1] += len;
            else qGrad4[2] += len;
          }
        }
        nctx.stroke();
      });
      l2norm(qGrad4);

      const ndata = nctx.getImageData(0, 0, S, S).data;
      const raw = new Float32Array(S * S);
      for (let i = 0; i < S * S; i++) raw[i] = ndata[i * 4 + 3] / 255;
      const blurred = blur2(raw);
      const q8 = downsample8(blurred);
      const q24 = l2norm(blurred);
      const qAspect = Math.log((bw * scale + 4) / (bh * scale + 4));
      return { q24, q8, qGrad4, qAspect };
    };

    return CHAR_TEMPLATES;
  }

  function recognizeDrawnChar(strokes, limit = 10) {
    if (!strokes.length) return [];
    const tpls = ensureCharTemplates();
    const q = tpls._encode(strokes);
    if (!q) return [];
    const { q24, q8, qGrad4, qAspect } = q;
    const scored = new Array(tpls.length);
    for (let i = 0; i < tpls.length; i++) {
      const t = tpls[i];
      let s24 = 0;
      for (let j = 0; j < 576; j++) s24 += q24[j] * t.tpl24[j];
      let s8 = 0;
      for (let j = 0; j < 64; j++) s8 += q8[j] * t.tpl8[j];
      const sG = qGrad4[0] * t.grad4[0] + qGrad4[1] * t.grad4[1] + qGrad4[2] * t.grad4[2] + qGrad4[3] * t.grad4[3];
      const aspDiff = Math.abs(qAspect - t.aspect);
      const score = 0.56 * s24 + 0.24 * s8 + 0.20 * sG - 0.12 * aspDiff;
      scored[i] = { ch: t.ch, meta: t.meta, score };
    }
    scored.sort((a, b) => b.score - a.score || a.meta.minLv - b.meta.minLv);
    return scored.slice(0, limit);
  }

  function wordMatches(w) {
    const q = wl.q.trim().toLowerCase();
    const plain = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return (wl.group === "All" || w.group === wl.group) &&
      (!wl.onlyLearning || !known.has(w.id)) &&
      (!q || w.zh.includes(q) || plain(w.py).replace(/\s/g, "").includes(plain(q).replace(/\s/g, "")) || w.en.toLowerCase().includes(q));
  }

  function renderCharLinks(zhStr) {
    return Array.from(zhStr).map((c) => /[\u4e00-\u9fff]/.test(c)
      ? `<button type="button" class="char-explore-btn" data-explore-char="${esc(c)}" title="Explore HSK 1–4 words with ${esc(c)}">${esc(c)}</button>`
      : esc(c)).join("");
  }

  function charExplorerHtml(ch) {
    if (!ch) return "";
    const matches = WORDS.filter((w) => w.zh.includes(ch))
      .sort((a, b) => a.lv - b.lv || a.zh.length - b.zh.length || a.n - b.n);
    const exact = matches.find((w) => w.zh === ch);
    const byLv = [1, 2, 3, 4].map((lv) => {
      const c = matches.filter((w) => w.lv === lv).length;
      return c ? `HSK ${lv}: ${c}` : "";
    }).filter(Boolean).join(" · ");
    const highlight = (word) => Array.from(word).map((c) => c === ch ? `<mark>${esc(c)}</mark>` : esc(c)).join("");
    return `
      <div class="char-exp-head">
        <div class="char-exp-main">
          <span class="char-exp-glyph zh" lang="zh-Hans">${esc(ch)}</span>
          <div class="char-exp-info">
            <div class="char-exp-title">
              ${exact ? `<span class="char-exp-py lat">${esc(exact.py)}</span><span class="char-exp-en">${esc(exact.en)}</span><span class="char-exp-lv">HSK ${exact.lv}</span>` : `<span class="char-exp-en">Character in ${matches.length} HSK 1–4 word${matches.length === 1 ? "" : "s"}</span>`}
              ${speakBtn(ch)}
            </div>
            <p class="char-exp-counts">${matches.length} compound &amp; standalone word${matches.length === 1 ? "" : "s"} across HSK 1–4${byLv ? ` (${byLv})` : ""} · Tap any word to listen</p>
          </div>
        </div>
        <div class="char-exp-actions">
          <a class="btn small ghost" href="#/write?char=${encodeURIComponent(ch)}">✍ Practice writing</a>
          <button type="button" class="btn small ghost" data-filter-char="${esc(ch)}">Filter table to "${esc(ch)}"</button>
          <button type="button" class="icon-btn" data-close-explorer aria-label="Close character explorer" title="Close">✕</button>
        </div>
      </div>
      <div class="char-exp-grid">
        ${matches.map((w) => `
          <button type="button" class="char-exp-card" data-say="${esc(w.zh)}" title="Listen to ${esc(w.zh)}">
            <span class="char-exp-card-top">
              <span class="char-exp-zh zh" lang="zh-Hans">${highlight(w.zh)}</span>
              <span class="char-exp-lv">HSK ${w.lv}</span>
            </span>
            <span class="char-exp-py lat">${esc(w.py)}</span>
            <span class="char-exp-en">${esc(shortEn(w.en))}</span>
          </button>
        `).join("")}
      </div>`;
  }

  function wordRows() {
    const list = levelWords().filter(wordMatches);
    if (!list.length) return `<tr><td colspan="6" class="empty">No words match. Try a different search or group.</td></tr>`;
    return list.map((w) => `
      <tr class="${known.has(w.id) ? "is-known" : ""}">
        <td class="num">${level === "all" || level === "12" ? `<span class="lv">${w.lv}</span>` : ""}${w.n}</td>
        <td class="w-zh"><span class="zh" lang="zh-Hans">${renderCharLinks(w.zh)}</span></td>
        <td class="w-py"><span class="cover">${esc(w.py)}</span></td>
        <td class="w-pos">${esc(w.pos)}</td>
        <td class="w-en"><span class="cover">${esc(w.en)}</span></td>
        <td class="w-act no-print">${speakBtn(w.zh)}<button class="icon-btn know" data-know="${w.id}" aria-pressed="${known.has(w.id)}" title="Mark as known" aria-label="Mark ${esc(w.zh)} as known">✓</button></td>
      </tr>`).join("");
  }

  function renderWords() {
    document.title = "HSK word list — N1Mandarin";
    setActiveNav("words");
    main.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">New HSK 3.0 · Levels 1 to 4</p>
        <h1>HSK word list <span class="zh">词汇表</span></h1>
        <p class="lede">All 300 HSK 1, 200 HSK 2, 500 HSK 3 and 1,000 HSK 4 words. Search by characters, pinyin (tone marks optional) or English, or click any character to explore its compound words. Hide the pinyin or meanings to test yourself, then click a covered cell to check it.</p>
      </section>
      <div class="words-tools no-print">
        <div class="search-row">
          <label class="search"><span class="sr">Search words</span><input type="search" placeholder="Search 爱, ai, love…" value="${esc(wl.q)}" data-wsearch /></label>
          <button class="btn small ghost draw-toggle-btn" type="button" data-draw-toggle aria-expanded="${wl.drawOpen}">✍ Draw character</button>
        </div>
        <div class="toggles">
          <label class="switch"><input type="checkbox" data-w="hidePy" ${wl.hidePy ? "checked" : ""}/> <span>Hide pinyin</span></label>
          <label class="switch"><input type="checkbox" data-w="hideEn" ${wl.hideEn ? "checked" : ""}/> <span>Hide meaning</span></label>
          <label class="switch"><input type="checkbox" data-w="onlyLearning" ${wl.onlyLearning ? "checked" : ""}/> <span>Still learning only</span></label>
          <button class="btn small" data-print>Print list</button>
        </div>
      </div>
      <section class="draw-lookup-panel no-print" data-draw-panel ${wl.drawOpen ? "" : "hidden"}>
        <div class="draw-pad-col">
          <div class="draw-canvas-wrap">
            <canvas class="draw-canvas" width="200" height="200" data-draw-canvas aria-label="Draw a Chinese character to look it up"></canvas>
          </div>
          <div class="draw-pad-actions">
            <button class="btn small ghost" type="button" data-draw-undo>↩ Undo</button>
            <button class="btn small ghost" type="button" data-draw-clear>Clear</button>
            <span class="draw-stroke-count mono" data-draw-count>0 strokes</span>
          </div>
        </div>
        <div class="draw-results-col">
          <div class="draw-results-head">
            <h3>Draw to lookup <span class="zh">手写查字</span></h3>
            <p>Draw a Chinese character on the Tian Zi Ge pad, then tap a matching character below to filter the HSK 1–4 word list.</p>
          </div>
          <div class="draw-candidates" data-draw-results>
            <p class="muted small">Start drawing a character on the left…</p>
          </div>
        </div>
      </section>
      <section class="char-explorer-panel no-print" data-char-explorer ${wl.exploreChar ? "" : "hidden"}>${wl.exploreChar ? charExplorerHtml(wl.exploreChar) : ""}</section>
      <div class="no-print">${levelRow("data-wlevel")}${chipRow("Type", GROUPS, wl.group, "data-group")}</div>
      <p class="count no-print" data-count></p>
      <div class="table-wrap">
        <table class="words ${wl.hidePy ? "hide-py" : ""} ${wl.hideEn ? "hide-en" : ""}">
          <thead><tr><th class="num">No.</th><th>Word</th><th>Pinyin</th><th class="w-pos">Type</th><th>Meaning</th><th class="no-print"><span class="sr">Actions</span></th></tr></thead>
          <tbody data-wrows>${wordRows()}</tbody>
        </table>
      </div>
      <p class="source">Word lists: New HSK Vocabulary Levels 1–4 (HSK 3.0), compiled by MandarinBean.com.</p>`;
    const refresh = () => { main.querySelector("[data-wrows]").innerHTML = wordRows(); wireRows(); updateCount(); };
    const updateCount = () => {
      const pool = levelWords();
      const shown = pool.filter(wordMatches).length;
      main.querySelector("[data-count]").textContent = `Showing ${shown} of ${pool.length} ${levelName(level)} words · ${pool.filter((w) => known.has(w.id)).length} marked as known`;
    };
    const explorerBox = main.querySelector("[data-char-explorer]");
    function openExplorer(ch, scroll = false) {
      if (!explorerBox) return;
      wl.exploreChar = ch || "";
      if (!ch) { explorerBox.hidden = true; explorerBox.innerHTML = ""; return; }
      explorerBox.innerHTML = charExplorerHtml(ch);
      explorerBox.hidden = false;
      wireSpeak(explorerBox);
      explorerBox.querySelector("[data-close-explorer]").addEventListener("click", () => openExplorer(""));
      explorerBox.querySelector("[data-filter-char]").addEventListener("click", (e) => {
        const target = e.currentTarget.dataset.filterChar;
        wl.q = target;
        const searchInput = main.querySelector("[data-wsearch]");
        if (searchInput) searchInput.value = target;
        if (!levelWords().some(wordMatches) && level !== "all") {
          level = "all";
          main.querySelectorAll("[data-wlevel]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.wlevel === "all"));
        }
        refresh();
      });
      if (scroll) explorerBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (wl.exploreChar) openExplorer(wl.exploreChar);

    function wireRows() {
      wireSpeak(main.querySelector("[data-wrows]"));
      main.querySelectorAll("[data-explore-char]").forEach((b) => b.addEventListener("click", () => {
        openExplorer(b.dataset.exploreChar, true);
      }));
      main.querySelectorAll("[data-know]").forEach((b) => b.addEventListener("click", () => {
        const n = b.dataset.know;
        known.has(n) ? known.delete(n) : known.add(n); store.save();
        b.setAttribute("aria-pressed", known.has(n)); b.closest("tr").classList.toggle("is-known", known.has(n));
        if (wl.onlyLearning) refresh(); else updateCount();
      }));
      main.querySelectorAll(".cover").forEach((c) => c.addEventListener("click", () => c.classList.toggle("peek")));
    }
    main.querySelectorAll("[data-wlevel]").forEach((b) => b.addEventListener("click", () => {
      level = b.dataset.wlevel; main.querySelectorAll("[data-wlevel]").forEach((x) => x.setAttribute("aria-pressed", x === b)); refresh();
    }));
    main.querySelector("[data-wsearch]").addEventListener("input", (e) => {
      wl.q = e.target.value;
      if (/^[\u4e00-\u9fff]$/.test(wl.q.trim())) openExplorer(wl.q.trim());
      refresh();
    });
    main.querySelectorAll("[data-group]").forEach((b) => b.addEventListener("click", () => {
      wl.group = b.dataset.group; main.querySelectorAll("[data-group]").forEach((x) => x.setAttribute("aria-pressed", x === b)); refresh();
    }));
    main.querySelectorAll("[data-w]").forEach((c) => c.addEventListener("change", () => {
      wl[c.dataset.w] = c.checked;
      const t = main.querySelector("table.words");
      t.classList.toggle("hide-py", wl.hidePy); t.classList.toggle("hide-en", wl.hideEn);
      if (c.dataset.w === "onlyLearning") refresh();
    }));
    main.querySelector("[data-print]").addEventListener("click", () => window.print());

    /* Draw-to-lookup wiring */
    const drawToggle = main.querySelector("[data-draw-toggle]");
    const drawPanel = main.querySelector("[data-draw-panel]");
    const drawCanvas = main.querySelector("[data-draw-canvas]");
    const drawResults = main.querySelector("[data-draw-results]");
    const drawCount = main.querySelector("[data-draw-count]");
    const dctx = drawCanvas.getContext("2d");
    let isDrawing = false;
    let activeStroke = null;

    function renderDrawPad() {
      const W = drawCanvas.width, H = drawCanvas.height;
      dctx.clearRect(0, 0, W, H);
      const cs = getComputedStyle(document.documentElement);
      const lineCol = cs.getPropertyValue("--color-line").trim() || "#ddd";
      const inkCol = cs.getPropertyValue("--color-ink").trim() || "#111";

      // Tian Zi Ge guide lines
      dctx.save();
      dctx.strokeStyle = lineCol;
      dctx.lineWidth = 1;
      dctx.setLineDash([4, 4]);
      dctx.beginPath();
      dctx.moveTo(W / 2, 0); dctx.lineTo(W / 2, H);
      dctx.moveTo(0, H / 2); dctx.lineTo(W, H / 2);
      dctx.moveTo(0, 0); dctx.lineTo(W, H);
      dctx.moveTo(W, 0); dctx.lineTo(0, H);
      dctx.stroke();
      dctx.restore();

      // Drawn strokes
      dctx.strokeStyle = inkCol;
      dctx.lineWidth = 7;
      dctx.lineCap = "round";
      dctx.lineJoin = "round";
      wl.drawStrokes.forEach((st) => {
        if (!st.length) return;
        dctx.beginPath();
        dctx.moveTo(st[0][0], st[0][1]);
        if (st.length === 1) dctx.lineTo(st[0][0] + 0.1, st[0][1] + 0.1);
        for (let i = 1; i < st.length; i++) dctx.lineTo(st[i][0], st[i][1]);
        dctx.stroke();
      });

      const n = wl.drawStrokes.length;
      drawCount.textContent = `${n} stroke${n === 1 ? "" : "s"}`;
    }

    function updateDrawMatches() {
      if (!wl.drawStrokes.length) {
        drawResults.innerHTML = `<p class="muted small">Start drawing a character on the left…</p>`;
        return;
      }
      const matches = recognizeDrawnChar(wl.drawStrokes, 10);
      drawResults.innerHTML = matches.map(({ ch, meta }) => {
        const py = meta.exact ? meta.exact.py : `HSK ${meta.minLv}+`;
        const sub = meta.exact ? shortEn(meta.exact.en) : `${meta.count} word${meta.count === 1 ? "" : "s"}`;
        return `<button class="draw-cand-btn" type="button" data-pick-char="${esc(ch)}" title="Search words with ${esc(ch)}">
          <span class="draw-cand-zh zh" lang="zh-Hans">${esc(ch)}</span>
          <span class="draw-cand-meta">
            <span class="draw-cand-py lat">${esc(py)}</span>
            <span class="draw-cand-sub">${esc(sub)}</span>
          </span>
        </button>`;
      }).join("");
      drawResults.querySelectorAll("[data-pick-char]").forEach((btn) => btn.addEventListener("click", () => {
        const ch = btn.dataset.pickChar;
        wl.q = ch;
        const searchInput = main.querySelector("[data-wsearch]");
        if (searchInput) searchInput.value = ch;
        // If current level has no words with this character, switch to All (HSK 1-4)
        if (!levelWords().some(wordMatches) && level !== "all") {
          level = "all";
          main.querySelectorAll("[data-wlevel]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.wlevel === "all"));
        }
        openExplorer(ch);
        refresh();
      }));
    }

    function canvasPt(e) {
      const r = drawCanvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * drawCanvas.width, ((e.clientY - r.top) / r.height) * drawCanvas.height];
    }

    drawCanvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      drawCanvas.setPointerCapture(e.pointerId);
      isDrawing = true;
      activeStroke = [canvasPt(e)];
      wl.drawStrokes.push(activeStroke);
      renderDrawPad();
    });
    drawCanvas.addEventListener("pointermove", (e) => {
      if (!isDrawing || !activeStroke) return;
      activeStroke.push(canvasPt(e));
      renderDrawPad();
    });
    const finishStroke = () => {
      if (!isDrawing) return;
      isDrawing = false;
      activeStroke = null;
      updateDrawMatches();
    };
    drawCanvas.addEventListener("pointerup", finishStroke);
    drawCanvas.addEventListener("pointercancel", finishStroke);

    main.querySelector("[data-draw-undo]").addEventListener("click", () => {
      if (!wl.drawStrokes.length) return;
      wl.drawStrokes.pop();
      renderDrawPad();
      updateDrawMatches();
    });
    main.querySelector("[data-draw-clear]").addEventListener("click", () => {
      wl.drawStrokes = [];
      renderDrawPad();
      updateDrawMatches();
    });
    drawToggle.addEventListener("click", () => {
      wl.drawOpen = !wl.drawOpen;
      drawPanel.hidden = !wl.drawOpen;
      drawToggle.setAttribute("aria-expanded", String(wl.drawOpen));
      if (wl.drawOpen) {
        ensureCharTemplates();
        renderDrawPad();
        updateDrawMatches();
      }
    });
    if (wl.drawOpen) {
      ensureCharTemplates();
      renderDrawPad();
      updateDrawMatches();
    }

    wireRows(); updateCount();
  }

  /* ---------- Flashcards ---------- */
  const fc = { group: "All", deck: [], i: 0, flipped: false, front: "zh", skipKnown: false };

  function buildDeck(shuffle) {
    let list = levelWords().filter((w) => (fc.group === "All" || w.group === fc.group) && (!fc.skipKnown || !known.has(w.id)));
    if (shuffle) list = shuffleWith(list, Math.random);
    fc.deck = list; fc.i = 0; fc.flipped = false;
  }

  function renderFlashcards() {
    document.title = "HSK flashcards — N1Mandarin";
    setActiveNav("flashcards");
    if (!fc.deck.length || fc.level !== level) { fc.level = level; buildDeck(false); }
    main.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">New HSK 3.0 · ${levelName(level)}</p>
        <h1>Flashcards <span class="zh">识字卡</span></h1>
        <p class="lede">Tap the card or press Space to flip. Use the arrow keys to move, K for "know it" and L for "still learning".</p>
      </section>
      ${levelRow("data-flevel")}
      <div class="fc-controls">
        ${chipRow("Type", GROUPS, fc.group, "data-fgroup")}
        <div class="toggles">
          <label class="switch"><span>Front</span>
            <select data-front>
              <option value="zh" ${fc.front === "zh" ? "selected" : ""}>Characters</option>
              <option value="en" ${fc.front === "en" ? "selected" : ""}>English</option>
              <option value="py" ${fc.front === "py" ? "selected" : ""}>Pinyin</option>
            </select></label>
          <label class="switch"><input type="checkbox" data-skip ${fc.skipKnown ? "checked" : ""}/> <span>Skip known words</span></label>
          <button class="btn small ghost" data-shuffle>Shuffle</button>
        </div>
      </div>
      <div class="fc-stage" data-stage></div>`;
    drawCard();
    main.querySelectorAll("[data-flevel]").forEach((b) => b.addEventListener("click", () => { level = b.dataset.flevel; renderFlashcards(); }));
    main.querySelectorAll("[data-fgroup]").forEach((b) => b.addEventListener("click", () => {
      fc.group = b.dataset.fgroup; main.querySelectorAll("[data-fgroup]").forEach((x) => x.setAttribute("aria-pressed", x === b)); buildDeck(false); drawCard();
    }));
    main.querySelector("[data-front]").addEventListener("change", (e) => { fc.front = e.target.value; fc.flipped = false; drawCard(); });
    main.querySelector("[data-skip]").addEventListener("change", (e) => { fc.skipKnown = e.target.checked; buildDeck(false); drawCard(); });
    main.querySelector("[data-shuffle]").addEventListener("click", () => { buildDeck(true); drawCard(); });
  }

  function drawCard() {
    const stage = main.querySelector("[data-stage]");
    if (!stage) return;
    if (!fc.deck.length) {
      stage.innerHTML = `<div class="fc-empty"><p>No cards left in this set. You've marked them all as known.</p><button class="btn small" data-reset-known>Reset known words</button></div>`;
      stage.querySelector("[data-reset-known]").addEventListener("click", () => { levelWords().forEach((x) => known.delete(x.id)); store.save(); buildDeck(false); drawCard(); });
      return;
    }
    const w = fc.deck[fc.i];
    const faces = {
      zh: `<span class="fc-big zh" lang="zh-Hans">${esc(w.zh)}</span>`,
      en: `<span class="fc-en-front">${esc(shortEn(w.en))}</span>`,
      py: `<span class="fc-py-front">${esc(w.py)}</span>`
    };
    const back = `
      <span class="fc-mid zh" lang="zh-Hans">${esc(w.zh)}</span>
      <span class="fc-py">${esc(w.py)}</span>
      <span class="fc-en">${esc(w.en)}</span>
      <span class="fc-pos">${esc(w.pos)} · HSK ${w.lv} No. ${w.n}</span>`;
    const done = fc.deck.filter((x) => known.has(x.id)).length;
    stage.innerHTML = `
      <div class="fc-progress"><span>Card ${fc.i + 1} of ${fc.deck.length}</span><span>${done} known in this set</span></div>
      <div class="fc-bar"><span style="width:${((fc.i + 1) / fc.deck.length) * 100}%"></span></div>
      <button class="fc-card ${fc.flipped ? "flipped" : ""} ${known.has(w.id) ? "is-known" : ""}" data-flip aria-label="Flashcard. Activate to flip.">
        <span class="fc-face fc-front">${faces[fc.front]}<span class="fc-hint">Tap to flip</span></span>
        <span class="fc-face fc-back">${back}</span>
      </button>
      <div class="fc-actions">
        <button class="btn small ghost" data-prev aria-label="Previous card">←</button>
        ${canSpeak ? `<button class="btn small ghost" data-say="${esc(w.zh)}">${ICON_SOUND} Listen</button>` : ""}
        <button class="btn small ghost" data-learning>Still learning</button>
        <button class="btn small" data-know-card>Know it ✓</button>
        <button class="btn small ghost" data-next aria-label="Next card">→</button>
      </div>`;
    stage.querySelector("[data-flip]").addEventListener("click", flip);
    stage.querySelector("[data-prev]").addEventListener("click", () => move(-1));
    stage.querySelector("[data-next]").addEventListener("click", () => move(1));
    stage.querySelector("[data-know-card]").addEventListener("click", () => mark(true));
    stage.querySelector("[data-learning]").addEventListener("click", () => mark(false));
    wireSpeak(stage);
  }
  function flip() { fc.flipped = !fc.flipped; const c = main.querySelector(".fc-card"); if (c) c.classList.toggle("flipped", fc.flipped); }
  function move(d) { if (!fc.deck.length) return; fc.i = (fc.i + d + fc.deck.length) % fc.deck.length; fc.flipped = false; drawCard(); }
  function mark(isKnown) {
    const w = fc.deck[fc.i]; if (!w) return;
    isKnown ? known.add(w.id) : known.delete(w.id); store.save();
    if (isKnown && fc.skipKnown) { fc.deck.splice(fc.i, 1); if (fc.i >= fc.deck.length) fc.i = 0; fc.flipped = false; drawCard(); }
    else move(1);
  }
  document.addEventListener("keydown", (e) => {
    if (!location.hash.startsWith("#/flashcards") || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
    else if (e.key === "ArrowRight") move(1);
    else if (e.key === "ArrowLeft") move(-1);
    else if (e.key.toLowerCase() === "k") mark(true);
    else if (e.key.toLowerCase() === "l") mark(false);
  });

  /* ---------- Paper generator ---------- */
  const SECTION_TYPES = {
    py: { label: "Write the pinyin", hint: "Character → pinyin with tone marks" },
    en: { label: "Write the meaning", hint: "Character → English" },
    zh: { label: "Write the characters", hint: "English → characters" },
    match: { label: "Match the meanings", hint: "8 words to match with letters" },
    grid: { label: "Character writing grid", hint: "田字格 practice for 6 words" }
  };
  const gen = { code: 0, n: 10, secs: ["py", "en", "zh", "match"], group: "All", learning: false };

  function readGenParams(qs) {
    const p = new URLSearchParams(qs);
    if (p.get("code")) gen.code = parseInt(p.get("code"), 10) || 0;
    if (p.get("n")) gen.n = Math.min(20, Math.max(4, parseInt(p.get("n"), 10) || 10));
    if (p.get("s")) gen.secs = p.get("s").split("").map((c) => ({ p: "py", e: "en", z: "zh", m: "match", g: "grid" }[c])).filter(Boolean);
    if (p.get("g") && GROUPS.includes(p.get("g"))) gen.group = p.get("g");
    if (p.get("L")) { const L = { "1": "1", "2": "2", "3": "3", "4": "4", "12": "12", "123": "all", "1234": "all" }[p.get("L")]; if (L) level = L; }
    if (!gen.code) gen.code = 1000 + Math.floor(Math.random() * 9000);
  }
  function genHash() {
    const s = gen.secs.map((k) => ({ py: "p", en: "e", zh: "z", match: "m", grid: "g" }[k])).join("");
    return `#/generate?L=${level === "all" ? "1234" : level}&code=${gen.code}&n=${gen.n}&s=${s}&g=${encodeURIComponent(gen.group)}`;
  }

  function buildGenerated() {
    const rand = rng(gen.code * 7919 + gen.n + ({ "1": 0, "2": 101, "12": 202, "3": 303, "4": 404, all: 505 }[level] || 0));
    let pool = levelWords().filter((w) => gen.group === "All" || w.group === gen.group);
    if (gen.learning) pool = pool.filter((w) => !known.has(w.id));
    pool = shuffleWith(pool, rand);
    let k = 0;
    const take = (count, ok = () => true) => {
      const out = [];
      while (out.length < count && k < pool.length) { const w = pool[k++]; if (ok(w)) out.push(w); }
      // If the pool runs out, reuse words rather than leave a section short
      if (out.length < count) shuffleWith(pool, rand).forEach((w) => { if (out.length < count && ok(w) && !out.includes(w)) out.push(w); });
      return out;
    };
    const sections = gen.secs.map((key) => {
      if (key === "py") return { type: "tone", title: "Write the pinyin", instructions: "Write the pinyin for each word, with tone marks.", items: take(gen.n).map((w) => ({ q: w.zh, a: w.py })) };
      if (key === "en") return { type: "translate", title: "What does it mean?", instructions: "Write the English meaning of each word.", items: take(gen.n).map((w) => ({ q: w.zh, py: w.py, a: w.en })) };
      if (key === "zh") return { type: "translate", title: "Write the characters", instructions: "Write each word in Chinese characters. The pinyin is there to help.", items: take(gen.n).map((w) => ({ q: shortEn(w.en), py: w.py, a: w.zh })) };
      if (key === "match") {
        const seen = new Set();
        const ws = take(8, (w) => { const e = shortEn(w.en); if (seen.has(e) || e.length > 28) return false; seen.add(e); return true; });
        return { type: "match", title: "Match the words to their meanings", instructions: "Write the letter of the correct meaning in each box.", items: ws.map((w) => ({ zh: w.zh, py: w.py, a: shortEn(w.en) })) };
      }
      if (key === "grid") return { type: "grid", title: "Practise writing", instructions: "Trace the grey characters, then write the word on your own.", items: take(6, (w) => w.zh.length === 1).map((w) => ({ zh: w.zh, py: w.py, en: shortEn(w.en) })) };
    });
    return {
      id: "gen" + level + gen.code, title: `${levelName(level)} Vocabulary Practice`, zh: { "1": "一级词汇练习", "2": "二级词汇练习", "3": "三级词汇练习", "4": "四级词汇练习", "12": "一、二级词汇练习", all: "一至四级词汇练习" }[level],
      eyebrow: `${levelName(level)} (3.0) · Paper code ${gen.code}${gen.group !== "All" ? " · " + esc(gen.group) : ""}`,
      sections
    };
  }

  function renderGenerate(qs) {
    document.title = "HSK paper generator — N1Mandarin";
    setActiveNav("generate");
    readGenParams(qs);
    const p = buildGenerated();
    main.innerHTML = `
      <section class="page-head no-print">
        <p class="eyebrow">New HSK 3.0 · Levels 1 to 4</p>
        <h1>Paper generator <span class="zh">出卷</span></h1>
        <p class="lede">Choose what goes on the paper, then print. The paper code rebuilds exactly the same paper, so you can reprint it or share the link with another teacher.</p>
      </section>
      <form class="gen-panel no-print" data-gen>
        <fieldset><legend>Sections</legend>
          ${Object.entries(SECTION_TYPES).map(([k, v]) => `<label class="check"><input type="checkbox" name="sec" value="${k}" ${gen.secs.includes(k) ? "checked" : ""}/> <span><b>${v.label}</b><small>${v.hint}</small></span></label>`).join("")}
        </fieldset>
        <fieldset><legend>Words</legend>
          <label class="field"><span>HSK level</span><select name="level">${(level === "12" ? [...LEVELS, ["12", "HSK 1 + 2"]] : LEVELS).map(([v, l]) => `<option value="${v}" ${v === level ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="field"><span>Word type</span><select name="group">${GROUPS.map((g) => `<option ${g === gen.group ? "selected" : ""}>${g}</option>`).join("")}</select></label>
          <label class="field"><span>Questions per section</span><input type="number" name="n" min="4" max="20" value="${gen.n}"/></label>
          <label class="check"><input type="checkbox" name="learning" ${gen.learning ? "checked" : ""}/> <span><b>Only words I'm still learning</b><small>${levelWords().filter((w) => !known.has(w.id)).length} ${levelName(level)} words not yet marked as known</small></span></label>
        </fieldset>
        <div class="gen-actions">
          <label class="field"><span>Paper code</span><input type="number" name="code" min="1000" max="99999" value="${gen.code}"/></label>
          <button type="button" class="btn ghost" data-new>New paper</button>
        </div>
      </form>
      ${gen.secs.length ? toolbarHtml("#/papers", "Worksheets") + sheetHtml(p) : `<p class="empty">Choose at least one section to build a paper.</p>`}
      <div class="no-print" style="height:var(--space-20)"></div>`;
    if (gen.secs.length) wireSheet();
    safeReplace(genHash());
    const form = main.querySelector("[data-gen]");
    const apply = () => {
      gen.secs = [...form.querySelectorAll('[name="sec"]:checked')].map((c) => c.value);
      gen.group = form.group.value;
      level = form.level.value;
      gen.n = Math.min(20, Math.max(4, parseInt(form.n.value, 10) || 10));
      gen.code = parseInt(form.code.value, 10) || gen.code;
      gen.learning = form.learning.checked;
      const y = window.scrollY;
      renderGenerate(genHash().split("?")[1]);
      window.scrollTo(0, y);
    };
    form.addEventListener("change", apply);
    main.querySelector("[data-new]").addEventListener("click", () => { form.code.value = 1000 + Math.floor(Math.random() * 9000); apply(); });
  }
  function safeReplace(h) { try { history.replaceState(null, "", h); } catch (e) { /* sandboxed preview */ } }

  /* ---------- About ---------- */
  function renderAbout() {
    document.title = "For teachers — N1Mandarin";
    setActiveNav("about");
    main.innerHTML = `<section class="narrow about">
      <h1>For teachers: how to use N1Mandarin</h1>
      <h2>The learning path</h2>
      <p>The <a href="#/">Learn</a> page is written for English-speaking students. Work through it in order: 01 everyday phrase cards, 02 how written Chinese works (六书 & stroke order), 03 where the grammar differs, 04 sounds English doesn't have, 05 common English-speaker mistakes, 06 essential Chinese idioms (成语, curated with Finley Jennings), then 07 the quiz. Each section is formatted as a collapsible drop-down tab that can be expanded or closed at any time. Grammar, mistakes, idiom, and quiz sections all offer interactive pinyin toggles to practice reading with or without pinyin. Each section links to the worksheets that practise it, so you can set the matching paper as homework. The content lives in <code>learn.js</code>.</p>
      <h2>Worksheets in class</h2>
      <p>Open a paper, switch off <b>Pinyin</b> for stronger students, and choose <b>Print / Save PDF</b>. The site header and buttons are hidden when printing, so you get a clean A4 worksheet with name, date and score boxes.</p>
      <h2>Marking</h2>
      <p>Switch on <b>Answer key</b> and print a second copy for yourself, or show it on the board. Matching letters are fixed, so the student copy and the key always line up.</p>
      <h2>HSK word list and flashcards</h2>
      <p>The <a href="#/words">word list</a> has all 300 New HSK 3.0 Level 1 words, 200 Level 2 words, 500 Level 3 words and 1,000 Level 4 words. Use the Level buttons to switch between HSK 1, HSK 2, HSK 3, HSK 4 or all four. Hide pinyin or meanings to quiz yourself, press the speaker to hear a word, and tick words you know. <a href="#/flashcards">Flashcards</a> use the same "known" ticks, so you can focus on the words you're still learning.</p>
      <h2>Pinyin sounds</h2>
      <p>The <a href="#/pinyin">pinyin page</a> splits any syllable into its initial, final and tone, and explains spelling rules like y/w and the dropped dots on ü. Tap a sound in the charts to hear it and see HSK words that use it, or print the chart for the classroom wall.</p>
      <h2>Generating papers</h2>
      <p>The <a href="#/generate">generator</a> picks words at random from the HSK 1, HSK 2, HSK 3 or HSK 4 list, or all four. Every paper has a code: type the same code with the same settings to rebuild the identical paper, or copy the page link to share it.</p>
      <h2>Adding worksheets</h2>
      <p>Worksheet content lives in <code>papers.js</code> and the vocabulary in <code>hsk1.js</code>, <code>hsk2.js</code>, <code>hsk3.js</code> and <code>hsk4.js</code>. Copy an existing paper object, give it a new <code>id</code>, and use the section types <code>tone</code>, <code>match</code>, <code>fill</code>, <code>translate</code>, <code>grid</code> or <code>reading</code>.</p>
      <h2>Contact</h2>
      <p>Have questions, feedback, or suggestions? Feel free to reach out via email: <a href="mailto:chang8alex8@gmail.com">chang8alex8@gmail.com</a>.</p>
      <p><a class="btn" href="#/papers">See the worksheets</a></p>
    </section>`;
  }


  /* ---------- Pinyin sounds ---------- */
  const PY = window.PINYIN;
  WORDS.forEach((w) => { w.syl = PY ? PY.split(w.py).filter((x) => !x.bad) : []; });
  const pyState = { q: "nǐ hǎo", open: {} };
  const TONE_PATHS = { 1: "M4 6 H36", 2: "M4 22 L36 6", 3: "M4 18 Q14 32 22 30 T36 10", 4: "M4 6 L36 32", 5: "" };
  const toneSvg = (n) => `<svg class="contour" viewBox="0 0 40 38" aria-hidden="true"><line x1="2" y1="4" x2="38" y2="4"/><line x1="2" y1="34" x2="38" y2="34"/>${n === 5 ? '<circle cx="20" cy="20" r="4"/>' : `<path d="${TONE_PATHS[n]}"/>`}</svg>`;
  const SOUND_NOTES = {
    y: "y is a spelling letter here: the real final starts with i or ü.",
    w: "w is a spelling letter here: the real final starts with u.",
    "-i": "After zh, ch, sh, r, z, c and s the i is not 'ee': it is a buzzing sound made in the same mouth position.",
    "ü-jqx": "After j, q, x and y, ü is written as u. The sound is still ü.",
    iu: "iu is short for iou: you hear a light o in the middle.",
    ui: "ui is short for uei: you hear a light e in the middle.",
    un: "un is short for uen (after most initials).",
    er: "The final r is erhua: curl the tongue at the end of the syllable."
  };
  function sylNotes(x) {
    const n = [];
    if (x.glide) n.push(SOUND_NOTES[x.glide]);
    if (x.fin === "-i") n.push(SOUND_NOTES["-i"]);
    if (/^[jqxy]$/.test(x.ini || x.glide) && /^ü/.test(x.fin)) n.push(SOUND_NOTES["ü-jqx"]);
    if (x.fin === "iu" || x.fin === "ui" || x.fin === "un") n.push(SOUND_NOTES[x.fin]);
    if (x.er) n.push(SOUND_NOTES.er);
    return n;
  }
  const finLabel = (f) => (f === "-i" ? "-i (buzz)" : f === "io" ? "o" : f);
  function wordsWith(test, max = 10) {
    const list = WORDS.filter((w) => w.syl.some(test));
    // favour short, single-sound words first
    list.sort((a, b) => a.syl.length - b.syl.length || a.lv - b.lv || a.n - b.n);
    return { total: list.length, list: list.slice(0, max) };
  }
  function pyMarked(w, test) {
    return w.syl.map((x) => test(x) ? `<mark>${esc(x.text)}</mark>` : esc(x.text)).join("");
  }
  function wordChips(found, test) {
    if (!found.total) return `<p class="muted">No HSK 1–4 words use this sound.</p>`;
    return `<ul class="py-words">${found.list.map((w) => `<li><button class="py-word" data-say="${esc(w.zh)}" title="Listen"><span class="zh" lang="zh-Hans">${esc(w.zh)}</span><span class="py">${pyMarked(w, test)}</span><span class="en">${esc(shortEn(w.en))}</span><span class="lv-tag">HSK ${w.lv}</span></button></li>`).join("")}</ul>
      ${found.total > found.list.length ? `<p class="muted small">Showing ${found.list.length} of ${found.total} HSK 1–4 words with this sound.</p>` : ""}`;
  }

  function sampleForInitial(ini) {
    if (!PY) return "";
    for (const g of PY.INITIAL_GROUPS) {
      const item = g.items.find((x) => x[0] === ini);
      if (item) return item[1];
    }
    return "";
  }
  function sampleForFinal(fin) {
    if (!PY) return "";
    for (const g of PY.FINAL_GROUPS) {
      const item = g.items.find((x) => x[0] === fin);
      if (item) return item[1];
    }
    return "";
  }

  function splitHtml(q) {
    const parts = PY.split(q);
    if (!q.trim()) return `<p class="muted">Type some pinyin above.</p>`;
    const flat = q.normalize("NFC").toLowerCase().replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, "");
    const match = WORDS.find((w) => w.py.normalize("NFC").toLowerCase().replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, "") === flat);
    return `${match ? `<p class="py-match">HSK ${match.lv} word: <button class="py-word inline" data-say="${esc(match.zh)}"><span class="zh" lang="zh-Hans">${esc(match.zh)}</span> <span class="en">${esc(shortEn(match.en))}</span> ${ICON_SOUND}</button></p>` : ""}
      <div class="syl-row">${parts.map((x) => {
        if (x.bad) return `<div class="syl bad"><p class="syl-big">${esc(x.bad)}</p><p class="muted small">Not a Mandarin syllable. Check the spelling.</p></div>`;
        const ini = x.ini || x.glide;
        const iniCh = ini ? sampleForInitial(ini) : "";
        const finCh = x.fin ? sampleForFinal(x.fin) : "";
        const same = wordsWith((y) => y.base === x.base && y.tone === x.tone, 4);
        const notes = sylNotes(x);
        return `<div class="syl">
          <div class="syl-header">
            <p class="syl-big">${esc(x.text)}</p>
            <button class="syl-audio-btn" data-say="${esc(x.text)}" aria-label="Listen to syllable ${esc(x.text)}" title="Listen to ${esc(x.text)}">${ICON_SOUND}</button>
          </div>
          <div class="syl-parts">
            <div class="part-box" data-g="${PY.groupOfInitial(ini)}" ${iniCh ? `data-say="${esc(iniCh)}" role="button" tabindex="0" title="Listen to initial ${esc(ini)} (${esc(iniCh)})"` : ""}>
              <div class="part-box-head">
                <span class="lbl">${x.glide ? "Spelling letter" : "Initial 声母"}</span>
                ${iniCh ? `<span class="part-audio" title="Listen">${ICON_SOUND}</span>` : ""}
              </div>
              <b>${ini ? esc(ini) : "—"}</b>
            </div>
            <span class="plus">+</span>
            <div class="part-box fin" data-g="${PY.groupOfFinal(x.fin)}" ${finCh ? `data-say="${esc(finCh)}" role="button" tabindex="0" title="Listen to final ${esc(x.fin)} (${esc(finCh)})"` : ""}>
              <div class="part-box-head">
                <span class="lbl">Final 韵母</span>
                ${finCh ? `<span class="part-audio" title="Listen">${ICON_SOUND}</span>` : ""}
              </div>
              <b>${esc(finLabel(x.fin))}${x.er ? " + r" : ""}</b>
            </div>
            <span class="plus">+</span>
            <div class="part-box tone"><span class="lbl">Tone 声调</span><b>${toneSvg(x.tone)} ${x.tone === 5 ? "neutral" : x.tone}</b></div>
          </div>
          ${notes.length ? `<ul class="syl-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
          ${same.total ? `<div class="syl-words"><span class="lbl">HSK words with ${esc(x.text)}</span>${same.list.map((w) => `<button class="py-word mini" data-say="${esc(w.zh)}"><span class="zh" lang="zh-Hans">${esc(w.zh)}</span> <span class="py">${esc(w.py)}</span></button>`).join("")}</div>` : ""}
        </div>`;
      }).join("")}</div>`;
  }

  function soundTable(kind, groups) {
    return groups.map((g) => `
      <div class="py-group" data-g="${g.key}">
        <div class="py-group-head">
          <h3>${esc(g.name)} <span class="zh">${esc(g.zh)}</span></h3>
          <p>${esc(g.tip)}</p>
        </div>
        <div class="py-tiles">${g.items.map(([sym, ch, py, hint]) => `
          <div class="py-tile" role="button" tabindex="0" data-kind="${kind}" data-sym="${esc(sym)}" data-group="${g.key}" data-say="${esc(ch)}" aria-label="${esc(sym)}, as in ${esc(ch)} ${esc(py)}">
            <div class="py-tile-top">
              <span class="sym">${esc(sym)}</span>
              <button class="py-tile-audio" type="button" data-say="${esc(ch)}" aria-label="Listen to ${esc(sym)} (${esc(ch)} ${esc(py)})" title="Listen to ${esc(sym)} (${esc(ch)})">
                ${ICON_SOUND}
              </button>
            </div>
            <span class="ex"><span class="zh" lang="zh-Hans">${esc(ch)}</span> ${esc(py)}</span>
            <span class="hint">${esc(hint)}</span>
          </div>`).join("")}</div>
        <div class="py-detail no-print" data-detail="${kind}-${g.key}" hidden></div>
      </div>`).join("");
  }

  function renderPinyin() {
    document.title = "Pinyin sounds — N1Mandarin";
    setActiveNav("pinyin");
    if (!PY) { main.innerHTML = `<p>Pinyin data failed to load.</p>`; return; }
    main.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">Pronunciation · 拼音</p>
        <h1>Pinyin sounds <span class="zh">声母和韵母</span></h1>
        <p class="lede">Every Mandarin syllable is an initial (the consonant at the start), a final (the vowel part) and a tone. Tap any initial or final to hear its clear native pronunciation and explore HSK words that use it.</p>
      </section>
      <section class="py-split no-print" aria-labelledby="split-h">
        <h2 id="split-h" class="py-h2">Split a syllable <span class="zh">拼音拆分</span></h2>
        <label class="search"><span class="sr">Pinyin to split</span><input type="search" data-pyq value="${esc(pyState.q)}" placeholder="Type pinyin, e.g. Zhōngguó or zhong1 guo2" /></label>
        <div class="chip-row"><span class="chip-label">Try</span>${["nǐ hǎo", "Zhōngguó", "xuéxiào", "qù", "péngyou", "zhīdào", "yīfu", "yíhuìr"].map((t) => `<button class="chip" data-try="${esc(t)}">${esc(t)}</button>`).join("")}</div>
        <p class="muted small">Tone marks or tone numbers both work (zhong1 guo2). Type v or u: for ü.</p>
        <div data-split>${splitHtml(pyState.q)}</div>
      </section>
      <section class="py-section" aria-labelledby="tones-h">
        <h2 id="tones-h" class="py-h2">The four tones <span class="zh">四声</span></h2>
        <div class="tone-cards">${PY.TONES.map((t) => `
          <button class="tone-card" data-say="${esc(t.ex[0])}" aria-label="${esc(t.name)}, as in ${esc(t.ex[0])} ${esc(t.ex[1])}">
            <div class="tone-card-top">
              ${toneSvg(t.n)}
              <span class="tone-audio-icon" aria-hidden="true" title="Listen">${ICON_SOUND}</span>
            </div>
            <span class="t-name">${esc(t.name)} <span class="zh">${esc(t.zh)}</span></span>
            <span class="t-ex"><span class="zh" lang="zh-Hans">${esc(t.ex[0])}</span> ${esc(t.ex[1])}</span>
            <span class="hint">${esc(t.contour)} · ${esc(t.ex[2])}</span>
          </button>`).join("")}</div>
      </section>
      <section class="py-section" aria-labelledby="ini-h">
        <div class="py-section-head">
          <h2 id="ini-h" class="py-h2">Initials <span class="zh">声母</span></h2>
          <button class="btn small no-print" data-print>Print chart</button>
        </div>
        <p class="muted">21 initials plus y and w, grouped by where they are made in the mouth. Each tile features an audio button to hear the sound. Pairs like b/p, d/t, g/k, j/q, zh/ch and z/c differ only by a puff of air: hold a tissue in front of your mouth and it should move for the second one.</p>
        ${soundTable("ini", PY.INITIAL_GROUPS)}
      </section>
      <section class="py-section" aria-labelledby="fin-h">
        <h2 id="fin-h" class="py-h2">Finals <span class="zh">韵母</span></h2>
        <p class="muted">Finals are grouped by their first vowel. Tap the speaker on each final to hear its exact sound. The i-, u- and ü- groups start with a quick glide before the main vowel.</p>
        ${soundTable("fin", PY.FINAL_GROUPS)}
      </section>
      <section class="py-section no-print">
        <h2 class="py-h2">Practise on paper</h2>
        <p class="muted">Print a worksheet: <a href="#/paper/initials-finals">Initials & Finals</a> · <a href="#/paper/tricky-sounds">Tricky Sounds</a> · <a href="#/paper/tones">Pinyin & Tones</a></p>
      </section>`;
    wireSpeak(main);
    const box = main.querySelector("[data-split]");
    const input = main.querySelector("[data-pyq]");
    const update = () => { pyState.q = input.value; box.innerHTML = splitHtml(pyState.q); wireSpeak(box); };
    input.addEventListener("input", update);
    main.querySelectorAll("[data-try]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.try; update(); }));
    main.querySelector("[data-print]").addEventListener("click", () => window.print());
    main.querySelectorAll(".py-tile").forEach((b) => {
      const toggle = () => {
        const { kind, sym, group } = b.dataset;
        const panel = main.querySelector(`[data-detail="${kind}-${group}"]`);
        const wasOpen = b.getAttribute("aria-pressed") === "true";
        panel.parentElement.querySelectorAll(".py-tile").forEach((x) => x.setAttribute("aria-pressed", "false"));
        if (wasOpen) { panel.hidden = true; return; }
        b.setAttribute("aria-pressed", "true");
        const test = kind === "ini" ? (x) => (x.ini || x.glide) === sym : (x) => x.fin === sym;
        const g = (kind === "ini" ? PY.INITIAL_GROUPS : PY.FINAL_GROUPS).find((x) => x.key === group);
        const item = g.items.find((x) => x[0] === sym);
        panel.innerHTML = `
          <div class="detail-head-wrap">
            <p class="detail-head"><b>${esc(sym)}</b> — ${esc(item[3])}. Example: <button class="say-inline mini" data-say="${esc(item[1])}" title="Listen to ${esc(item[1])} (${esc(item[2])})"><span class="zh" lang="zh-Hans">${esc(item[1])}</span> ${esc(item[2])} ${ICON_SOUND}</button></p>
          </div>
          ${wordChips(wordsWith(test), test)}`;
        panel.hidden = false;
        wireSpeak(panel);
      };
      b.addEventListener("click", (e) => {
        // If the audio button was clicked, its wireSpeak listener already played and stopped propagation
        speak(b.dataset.say, b);
        toggle();
      });
      b.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          speak(b.dataset.say, b);
          toggle();
        }
      });
    });
  }

  /* ---------- Chinese Character Writing Page ---------- */
  const WRITE_CHARS = [
    // Foundational & Numbers
    { zh: "一", py: "yī", en: "one", cat: "Foundational", strokes: 1, steps: ["横 (héng)"], radical: "一", tip: "Start with a light press, glide left to right with a gentle 5° rise, anchor firmly at the end." },
    { zh: "二", py: "èr", en: "two", cat: "Foundational", strokes: 2, steps: ["上横 (短)", "下横 (长)"], radical: "二", tip: "Top horizontal is shorter; bottom horizontal is longer for foundational balance." },
    { zh: "三", py: "sān", en: "three", cat: "Foundational", strokes: 3, steps: ["上横", "中横 (最短)", "下横 (最长)"], radical: "一", tip: "Rule: Top to bottom. The middle stroke is the shortest; bottom stroke is longest." },
    { zh: "十", py: "shí", en: "ten", cat: "Foundational", strokes: 2, steps: ["横 (héng)", "竖 (shù)"], radical: "十", tip: "Rule: Horizontal before vertical. Lay down the crossbar first, then pierce with the vertical." },
    { zh: "人", py: "rén", en: "person", cat: "Foundational", strokes: 2, steps: ["撇 (piě)", "捺 (nà)"], radical: "人", tip: "Rule: Left slant (撇) before right press (捺). Both legs rest squarely on the ground line." },
    { zh: "大", py: "dà", en: "big", cat: "Foundational", strokes: 3, steps: ["横", "撇", "捺"], radical: "大", tip: "A person with arms stretched wide. Horizontal first, then the left and right legs." },
    { zh: "天", py: "tiān", en: "sky / day", cat: "Foundational", strokes: 4, steps: ["上横", "下横", "撇", "捺"], radical: "大", tip: "Heaven stretching above humanity. Top horizontal is shorter; bottom horizontal is wider." },
    { zh: "中", py: "zhōng", en: "middle / China", cat: "Foundational", strokes: 4, steps: ["左竖", "横折", "横", "中竖"], radical: "丨", tip: "First form the outer box (口), then spear through the exact vertical center axis." },
    { zh: "国", py: "guó", en: "country", cat: "Foundational", strokes: 8, steps: ["左竖", "横折", "横", "横", "竖", "提", "点", "底横"], radical: "囗", tip: "Rule: Enter before closing. Frame the box, craft the jade (玉) inside, then seal the bottom." },

    // Nature & Pictograms
    { zh: "日", py: "rì", en: "sun / day", cat: "Nature", strokes: 4, steps: ["左竖", "横折", "中横", "底横"], radical: "日", tip: "Originally a circle with a sunspot. Outer frame first, inner ray, then seal bottom." },
    { zh: "月", py: "yuè", en: "moon / month", cat: "Nature", strokes: 4, steps: ["竖撇", "横折钩", "中横", "中横"], radical: "月", tip: "A crescent moon. Left stroke is a graceful vertical slash (撇); right side has a hook." },
    { zh: "山", py: "shān", en: "mountain", cat: "Nature", strokes: 3, steps: ["中竖", "竖折", "右竖"], radical: "山", tip: "Three towering peaks. Rule: Center before two sides (先中间后两边)." },
    { zh: "水", py: "shuǐ", en: "water", cat: "Nature", strokes: 4, steps: ["竖钩", "横撇", "撇", "捺"], radical: "水", tip: "Flowing river and splashing drops. Center vertical hook first, then left flow, then right splash." },
    { zh: "火", py: "huǒ", en: "fire", cat: "Nature", strokes: 4, steps: ["左点", "右撇", "中撇", "捺"], radical: "火", tip: "Sparks flanking the main flames. Two sparks first, then central blaze." },
    { zh: "木", py: "mù", en: "tree / wood", cat: "Nature", strokes: 4, steps: ["横", "竖", "撇", "捺"], radical: "木", tip: "Branches and roots. Cross (十) first, then sweeping left and right root strokes." },
    { zh: "口", py: "kǒu", en: "mouth", cat: "Nature", strokes: 3, steps: ["左竖", "横折", "底横"], radical: "口", tip: "Square mouth. Left vertical, top-right corner, then seal the bottom left-to-right." },
    { zh: "田", py: "tián", en: "rice field", cat: "Nature", strokes: 5, steps: ["左竖", "横折", "中竖", "中横", "底横"], radical: "田", tip: "A divided rice paddy. The very grid that Tian Zi Ge (田字格) is named after!" },

    // Masterpiece & Culture
    { zh: "永", py: "yǒng", en: "eternity / forever", cat: "Masterpiece", strokes: 5, steps: ["点 (侧)", "横折钩 (勒+努+趯)", "提 (策)", "撇 (掠)", "捺 (磔)"], radical: "水", tip: "The celebrated master character of Chinese calligraphy! Contains all 8 fundamental strokes in the Eight Principles of Yong (永字八法)." },
    { zh: "纸", py: "zhǐ", en: "paper", cat: "Masterpiece", strokes: 7, steps: ["撇折", "撇折", "提", "撇", "竖提", "横", "斜钩"], radical: "纟", tip: "N1Mandarin's signature seal! Silk radical (纟) on the left + clan component (氏) on the right." },
    { zh: "好", py: "hǎo", en: "good", cat: "Masterpiece", strokes: 6, steps: ["撇点", "撇", "提", "横撇", "竖钩", "横"], radical: "女", tip: "Woman (女) + Child (子) = harmony and goodness. Rule: Left half before right half." },
    { zh: "学", py: "xué", en: "to study / learn", cat: "Masterpiece", strokes: 8, steps: ["点", "点", "撇", "点", "横撇", "横撇", "竖钩", "横"], radical: "子", tip: "Enlightening sparks over a roof, sheltering the child (子) studying below." },
    { zh: "福", py: "fú", en: "blessing / fortune", cat: "Masterpiece", strokes: 13, steps: ["点", "横撇", "竖", "点", "横", "竖", "横折", "横", "竖", "横折", "横", "竖", "横"], radical: "礻", tip: "The quintessential Chinese character for prosperity and good fortune, displayed at Lunar New Year." }
  ];

  const STROKES_DATA = [
    { name: "横", py: "héng", en: "Horizontal", sym: "一", dir: "Left → Right",
      tip: "Keep pen steady, start with a subtle press, glide left-to-right with a slight upward rise (~5°), and anchor cleanly at the end.",
      ex: [["一", "yī"], ["十", "shí"], ["三", "sān"], ["天", "tiān"]] },
    { name: "竖", py: "shù", en: "Vertical", sym: "丨", dir: "Top ↓ Bottom",
      tip: "Anchor firmly at top, pull straight down. Two varieties: sharp needle tip (悬针, like 十) or rounded dewdrop (垂露, like 木).",
      ex: [["十", "shí"], ["中", "zhōng"], ["门", "mén"], ["木", "mù"]] },
    { name: "撇", py: "piě", en: "Left-falling", sym: "丿", dir: "Down-Left ↙",
      tip: "Start heavy at top-right, sweep smoothly down toward bottom-left, tapering off gracefully like a swan's neck.",
      ex: [["人", "rén"], ["八", "bā"], ["月", "yuè"], ["千", "qiān"]] },
    { name: "捺", py: "nà", en: "Right-falling", sym: "㇏", dir: "Down-Right ↘",
      tip: "Start light at top-left, press progressively heavier down to bottom-right, pause at the heel, and glide out horizontally.",
      ex: [["人", "rén"], ["大", "dà"], ["天", "tiān"], ["木", "mù"]] },
    { name: "点", py: "diǎn", en: "Dot", sym: "丶", dir: "Top-Left ↘ Right",
      tip: "Not a circular tap! It is a teardrop mark: start light at tip, press down-right with the brush belly, and lift cleanly.",
      ex: [["六", "liù"], ["下", "xià"], ["文", "wén"], ["永", "yǒng"]] },
    { name: "提", py: "tí", en: "Rising flick", sym: "㇀", dir: "Bottom-Left ↗ Top-Right",
      tip: "Press down firmly at bottom-left, then flick quickly upward to the right, ending in a crisp, sharp point.",
      ex: [["地", "dì"], ["冷", "lěng"], ["江", "jiāng"], ["永", "yǒng"]] },
    { name: "折", py: "zhé", en: "Turning / Corner", sym: "𠃍", dir: "Turn 90° ↴",
      tip: "Change direction without lifting the pen. Pause and press at the corner before continuing along the new stroke path.",
      ex: [["口", "kǒu"], ["日", "rì"], ["四", "sì"], ["田", "tián"]] },
    { name: "钩", py: "gōu", en: "Hook", sym: "亅", dir: "Sharp flick ↵",
      tip: "At the conclusion of a vertical or curved stroke, pause firmly, then flick inward or upward with a snappy finish.",
      ex: [["小", "xiǎo"], ["水", "shuǐ"], ["了", "le"], ["子", "zǐ"]] }
  ];

  const STROKE_RULES = [
    { no: "01", name: "Horizontal before vertical", zh: "先横后竖", ex: "十",
      steps: ["一 (héng)", "十 (shù)"],
      desc: "Lay down the horizontal foundation before piercing it with a vertical spine." },
    { no: "02", name: "Left slant before right slant", zh: "先撇后捺", ex: "人",
      steps: ["丿 (piě)", "人 (nà)"],
      desc: "Left-leaning slashes precede right-descending presses for balanced weight distribution." },
    { no: "03", name: "Top before bottom", zh: "先上后下", ex: "三",
      steps: ["一", "二", "三"],
      desc: "Build from the roof downward to the base, writing upper components before lower ones." },
    { no: "04", name: "Left before right", zh: "先左后右", ex: "你",
      steps: ["亻 (dān rén páng)", "尔 (ěr)"],
      desc: "Complete the left component or radical before embarking on the right half." },
    { no: "05", name: "Outside before inside", zh: "先外后内", ex: "同",
      steps: ["冂 (outer frame)", "一口 (inner content)"],
      desc: "Construct the sheltering boundary before placing interior strokes." },
    { no: "06", name: "Enter inside before closing", zh: "先进入后关门", ex: "回",
      steps: ["冂 (outer box)", "口 (inner content)", "一 (seal bottom)"],
      desc: "In full enclosures, enter and finish all interior contents before sealing the bottom line." },
    { no: "07", name: "Center before two flanks", zh: "先中间后两边", ex: "小",
      steps: ["亅 (center hook)", "丶 (left dot)", "丿 (right dot)"],
      desc: "For symmetrical characters, erect the central column first, then add balancing side wings." }
  ];

  const RADICALS_DATA = [
    { rad: "氵", name: "三点水", en: "Water", desc: "Flowing water, rivers, liquids", ex: [["江", "jiāng"], ["河", "hé"], ["洗", "xǐ"], ["海", "hǎi"]] },
    { rad: "亻", name: "单人旁", en: "Person", desc: "Human activities, relationships, states", ex: [["你", "nǐ"], ["他", "tā"], ["休", "xiū"], ["们", "men"]] },
    { rad: "女", name: "女字旁", en: "Woman / Female", desc: "Women, maternal relations, family", ex: [["妈", "mā"], ["她", "tā"], ["姐", "jiě"], ["妹", "mèi"]] },
    { rad: "扌", name: "提手旁", en: "Hand / Action", desc: "Physical actions performed with hands", ex: [["打", "dǎ"], ["找", "zhǎo"], ["拿", "ná"], ["提", "tí"]] },
    { rad: "口", name: "口字旁", en: "Mouth / Speech", desc: "Eating, drinking, speaking, vocalizing", ex: [["吃", "chī"], ["喝", "hē"], ["叫", "jiào"], ["吗", "ma"]] },
    { rad: "忄 / 心", name: "竖心旁 / 心字底", en: "Heart / Emotion", desc: "Feelings, thoughts, mental states", ex: [["想", "xiǎng"], ["快", "kuài"], ["慢", "màn"], ["懂", "dǒng"]] },
    { rad: "木", name: "木字旁", en: "Tree / Wood", desc: "Forests, wooden objects, flora", ex: [["林", "lín"], ["森", "sēn"], ["桌", "zhuō"], ["椅", "yǐ"]] },
    { rad: "日", name: "日字旁", en: "Sun / Time", desc: "Sunlight, daytime, dates, brightness", ex: [["明", "míng"], ["早", "zǎo"], ["晚", "wǎn"], ["昨", "zuó"]] },
    { rad: "月", name: "月字旁 (肉)", en: "Flesh / Moon", desc: "Anatomy, body parts, organs, moon", ex: [["朋", "péng"], ["脸", "liǎn"], ["腿", "tuǐ"], ["肚", "dù"]] },
    { rad: "讠", name: "言字旁", en: "Speech / Words", desc: "Language, conversations, speaking", ex: [["话", "huà"], ["语", "yǔ"], ["说", "shuō"], ["请", "qǐng"]] },
    { rad: "饣", name: "食字旁", en: "Food / Eat", desc: "Meals, dining, hunger, cooking", ex: [["饭", "fàn"], ["饱", "bǎo"], ["馆", "guǎn"], ["饿", "è"]] },
    { rad: "辶", name: "走之底", en: "Movement / Path", desc: "Walking, distances, roads, progress", ex: [["进", "jìn"], ["远", "yuǎn"], ["近", "jìn"], ["边", "biān"]] },
    { rad: "钅", name: "金字旁", en: "Metal / Gold", desc: "Metals, coins, clocks, iron", ex: [["钱", "qián"], ["钟", "zhōng"], ["铁", "tiě"], ["银", "yín"]] },
    { rad: "艹", name: "草字头", en: "Grass / Plants", desc: "Vegetation, herbs, tea, flowers", ex: [["茶", "chá"], ["菜", "cài"], ["药", "yào"], ["花", "huā"]] },
    { rad: "宀", name: "宝盖头", en: "Roof / Shelter", desc: "Houses, indoor spaces, safety", ex: [["家", "jiā"], ["安", "ān"], ["字", "zì"], ["室", "shì"]] },
    { rad: "火 / 灬", name: "火字旁 / 四点底", en: "Fire / Heat", desc: "Flames, cooking, boiling, temperature", ex: [["热", "rè"], ["烤", "kǎo"], ["点", "diǎn"], ["照", "zhào"]] }
  ];

  function resolveWriteChar(ch) {
    const preset = WRITE_CHARS.find((x) => x.zh === ch);
    if (preset) return preset;
    const exact = WORDS.find((w) => w.zh === ch);
    const parent = exact || WORDS.find((w) => w.zh.includes(ch));
    return {
      zh: ch,
      py: exact ? exact.py : (parent ? `${parent.py} (in ${parent.zh})` : "—"),
      en: exact ? exact.en : (parent ? `appears in ${parent.zh} (${shortEn(parent.en)})` : "Custom character"),
      cat: parent ? `HSK ${parent.lv}` : "Custom",
      strokes: "?",
      steps: [],
      radical: parent ? `HSK ${parent.lv}` : "Custom",
      tip: "Trace the faint guide using the 7 Golden Stroke Order Rules below: top to bottom, left to right, horizontal before vertical, and outside before closing."
    };
  }

  function renderWrite(qs = "") {
    document.title = "How to write Chinese characters — N1Mandarin";
    setActiveNav("write");

    const params = new URLSearchParams(qs);
    const reqChar = (params.get("char") || "").trim();
    const firstHanzi = Array.from(reqChar).find((c) => /[\u4e00-\u9fff]/.test(c));
    const initialChar = firstHanzi ? resolveWriteChar(firstHanzi) : (WRITE_CHARS.find((x) => x.zh === "永") || WRITE_CHARS[0]);

    const writeState = {
      char: initialChar,
      cat: ["Masterpiece", "Foundational", "Nature"].includes(initialChar.cat) ? initialChar.cat : "Masterpiece",
      guide: true,
      mizige: true,
      color: "#1e1c1b",
      width: 7,
      strokes: []
    };

    main.innerHTML = `
      <section class="page-head">
        <p class="eyebrow">Writing & Calligraphy · 汉字书写指南</p>
        <h1>How to write Chinese characters <span class="zh">汉字笔画与笔顺</span></h1>
        <p class="lede">Chinese characters look intricate, but they are built like Lego from just 8 fundamental strokes following 7 universal rules. Practice handwriting on the digital Tian Zi Ge (田字格) pad below, master stroke order, and explore the semantic radicals that unlock thousands of words.</p>
      </section>

      <!-- Interactive Writing Studio -->
      <section class="write-studio no-print" aria-label="Interactive character writing studio">
        <div class="canvas-column">
          <div class="canvas-frame">
            <canvas class="write-canvas" width="340" height="340"></canvas>
          </div>
          <div class="canvas-controls">
            <div class="control-row">
              <label class="switch"><input type="checkbox" data-t-guide ${writeState.guide ? "checked" : ""} /> <span>Trace guide 描红</span></label>
              <label class="switch"><input type="checkbox" data-t-mizige ${writeState.mizige ? "checked" : ""} /> <span>Diagonals 米字格</span></label>
            </div>
            <div class="control-row">
              <div class="color-picker" role="group" aria-label="Ink color">
                <button class="color-swatch" data-c="#1e1c1b" style="background:#1e1c1b;" aria-label="Black ink" aria-pressed="true" title="Deep Ink"></button>
                <button class="color-swatch" data-c="#b8432f" style="background:#b8432f;" aria-label="Cinnabar red" aria-pressed="false" title="Cinnabar Red"></button>
                <button class="color-swatch" data-c="#1d4ed8" style="background:#1d4ed8;" aria-label="Indigo blue" aria-pressed="false" title="Indigo Blue"></button>
              </div>
              <div class="width-picker" role="group" aria-label="Brush width">
                <button class="btn small ghost" data-w="3">Fine 细</button>
                <button class="btn small" data-w="7" aria-pressed="true">Medium 中</button>
                <button class="btn small ghost" data-w="14">Brush 粗</button>
              </div>
            </div>
            <div class="control-row">
              <button class="btn small ghost" data-action="undo">Undo 撤销</button>
              <button class="btn small ghost" data-action="clear">Clear 清空</button>
              <button class="btn small" data-action="save">Save PNG 保存</button>
            </div>
          </div>
        </div>

        <div class="char-details-column">
          <div class="char-info-card" data-char-info>
            <div class="char-hero-display zh" lang="zh-Hans">${esc(writeState.char.zh)}</div>
            <div class="char-meta">
              <div class="char-meta-top">
                <span class="char-py lat">${esc(writeState.char.py)}</span>
                <span class="char-en">${esc(writeState.char.en)}</span>
                <button class="say-line mini" data-say="${esc(writeState.char.zh)}" title="Listen to ${esc(writeState.char.zh)}">${ICON_SOUND} Listen</button>
              </div>
              <div class="char-badges">
                <span class="char-badge">Radical: ${esc(writeState.char.radical)}</span>
                <span class="char-badge">${writeState.char.strokes} strokes</span>
                <span class="char-badge">${esc(writeState.char.cat)}</span>
              </div>
              <p class="char-tip">${esc(writeState.char.tip)}</p>
            </div>
          </div>

          <div class="stroke-steps-box" data-steps-box>
            <div class="steps-label">Stroke Order Sequence · 笔顺拆解</div>
            ${writeState.char.steps.length ? `<ol class="steps-list">${writeState.char.steps.map((st, i) => `
              <li class="step-item"><span class="step-num">${i + 1}</span> ${esc(st)}</li>`).join("")}
            </ol>` : `<p class="muted small" style="margin:0;">Custom / HSK character — apply the 7 Golden Stroke Order Rules below while tracing.</p>`}
          </div>

          <div class="char-selector-box">
            <div class="selector-tabs" role="tablist">
              ${["Masterpiece", "Foundational", "Nature"].map((cat) => `
                <button class="chip" data-sel-cat="${cat}" aria-pressed="${writeState.cat === cat}">${cat}</button>`).join("")}
            </div>
            <div class="char-chips-grid" data-char-chips>
              ${WRITE_CHARS.filter((c) => c.cat === writeState.cat).map((c) => `
                <button class="char-chip write-char-chip zh" lang="zh-Hans" data-choose-char="${c.zh}" aria-pressed="${writeState.char.zh === c.zh}">${c.zh}</button>`).join("")}
            </div>
            <form class="write-custom-form" data-write-custom>
              <input type="text" maxlength="4" placeholder="Type any character, e.g. 爱" aria-label="Type any Chinese character to practice" data-custom-char />
              <button type="submit" class="btn small ghost">Practice 练习</button>
            </form>
          </div>
        </div>
      </section>

      <!-- The 8 Fundamental Strokes -->
      <section class="py-section" aria-labelledby="strokes-h">
        <div class="py-section-head">
          <h2 id="strokes-h" class="py-h2">The 8 Basic Strokes <span class="zh">永字八法 · 基本笔画</span></h2>
        </div>
        <p class="muted">In classical Chinese calligraphy, the character <b>永</b> (yǒng, eternity) famously contains all 8 fundamental brush strokes. Master these eight building blocks and you can write every single Chinese character.</p>
        <div class="strokes-grid">${STROKES_DATA.map((st) => `
          <article class="stroke-card">
            <div class="stroke-card-head">
              <div class="stroke-card-title">
                <span class="stroke-sym-large zh" lang="zh-Hans">${esc(st.sym)}</span>
                <span class="stroke-name">${esc(st.name)} <span class="py lat">(${esc(st.py)})</span></span>
              </div>
              <span class="stroke-dir">${esc(st.dir)}</span>
            </div>
            <p class="stroke-tip">${esc(st.tip)}</p>
            <div class="stroke-ex-row">
              <span class="lbl-inline">Examples:</span>
              ${st.ex.map(([ch, py]) => `<button class="stroke-ex-btn" data-say="${esc(ch)}" data-load-char="${esc(ch)}" title="Listen & load ${esc(ch)}"><span class="zh" lang="zh-Hans">${esc(ch)}</span> <span class="py lat">${esc(py)}</span></button>`).join("")}
            </div>
          </article>`).join("")}
        </div>
      </section>

      <!-- The 7 Golden Rules of Stroke Order -->
      <section class="py-section" aria-labelledby="rules-h">
        <h2 id="rules-h" class="py-h2">The 7 Golden Stroke Order Rules <span class="zh">笔顺七条基本规则</span></h2>
        <p class="muted">Why does stroke order matter? Writing strokes in the standard sequence guarantees proper optical balance, prevents ink smearing, and makes handwritten characters immediately recognizable to native readers.</p>
        <div class="stroke-grid">${STROKE_RULES.map((r) => `
          <div class="stroke-rule">
            <span class="rule-num mono">${esc(r.no)}</span>
            <div class="rule-body">
              <h4>${esc(r.name)} <span class="zh" lang="zh-Hans">${esc(r.zh)}</span></h4>
              <p class="rule-ex"><span class="zh" lang="zh-Hans">${esc(r.ex)}</span> <span class="muted small">(${r.steps.join(" → ")})</span></p>
              <p class="rule-tip">${esc(r.desc)}</p>
            </div>
          </div>`).join("")}
        </div>
      </section>

      <!-- Tian Zi Ge Spatial Guide -->
      <section class="py-section" aria-labelledby="grid-h">
        <h2 id="grid-h" class="py-h2">The Tian Zi Ge Architecture <span class="zh">田字格与结构美学</span></h2>
        <div class="tian-grid-guide">
          <div class="tian-diagram" aria-hidden="true">
            <div class="tian-quad">左上格<br>Top-Left</div>
            <div class="tian-quad">右上格<br>Top-Right</div>
            <div class="tian-quad">左下格<br>Btm-Left</div>
            <div class="tian-quad">右下格<br>Btm-Right</div>
          </div>
          <div>
            <h3>The Principle of the Balanced Square (方块字)</h3>
            <p class="muted">Chinese characters sit inside an imaginary square divided into 4 quadrants by the crosshair. Three golden principles ensure balanced characters:</p>
            <ul style="margin: var(--space-3) 0 0; padding-left: 1.2rem; display: grid; gap: var(--space-2); font-size: var(--text-sm);">
              <li><b>Center of Gravity (居中原则):</b> Characters must be centered in the grid. Leave approximately 15% breathing space around the outer border—never let strokes spill over the perimeter.</li>
              <li><b>Symmetry & Proportions (比例匀称):</b> Left-right split characters (like <b>好</b>, <b>明</b>, <b>你</b>) divide either 1:1 or 1:2 across the vertical line. Top-bottom characters (like <b>字</b>, <b>早</b>) align gracefully across the horizontal axis.</li>
              <li><b>Primary Spine Stroke (主笔突出):</b> Almost every character has one dominant primary stroke (主笔) that gives it stature—such as the long horizontal in <b>大</b>, the strong spine in <b>中</b>, or the grounding base in <b>王</b>.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Key Semantic Radicals -->
      <section class="py-section" aria-labelledby="radicals-h">
        <h2 id="radicals-h" class="py-h2">Essential Semantic Radicals <span class="zh">常用表意部首</span></h2>
        <p class="muted">Over 85% of Chinese characters are phono-semantic compounds. The radical tells you the category of meaning. Master these 16 roots to easily decode and memorize new characters.</p>
        <div class="radicals-grid">${RADICALS_DATA.map((rd) => `
          <article class="rad-card">
            <div class="rad-head">
              <span class="rad-glyph zh" lang="zh-Hans">${esc(rd.rad)}</span>
              <span class="rad-name">${esc(rd.name)}</span>
              <span class="rad-en">${esc(rd.en)}</span>
            </div>
            <p class="rad-desc">${esc(rd.desc)}</p>
            <div class="rad-examples">
              ${rd.ex.map(([ch, py]) => `<button class="chip mini" data-say="${esc(ch)}" data-load-char="${esc(ch)}" title="Listen & load ${esc(ch)}"><span class="zh" lang="zh-Hans">${esc(ch)}</span> <span class="py lat">${esc(py)}</span></button>`).join("")}
            </div>
          </article>`).join("")}
        </div>
      </section>

      <!-- Printable Practice Sheets -->
      <section class="py-section no-print">
        <h2 class="py-h2">Printable practice sheets</h2>
        <p class="muted">Print Tian Zi Ge character tracing worksheets to practice with pen on paper:
          ${further([paperLink("characters"), paperLink("characters-2"), paperLink("characters-hsk2"), paperLink("characters-hsk3"), paperLink("liushu"), `<a href="#/generate">Custom Worksheet Generator (generate your own grid sheets)</a>`])}
        </p>
      </section>
    `;

    wireSpeak(main);

    // Setup Canvas
    const canvas = main.querySelector(".write-canvas");
    const ctx = canvas.getContext("2d");
    let isDrawing = false;
    let currentStroke = [];

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGridAndStrokes();
    }

    function drawGridAndStrokes() {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (!w || !h) return;

      ctx.clearRect(0, 0, w, h);

      // Background
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      ctx.fillStyle = isDark ? "#23201e" : "#fcfaf7";
      ctx.fillRect(0, 0, w, h);

      // Outer Red Border
      ctx.strokeStyle = isDark ? "rgba(220, 100, 80, 0.6)" : "rgba(184, 67, 47, 0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      // Dashed crosshairs
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = isDark ? "rgba(220, 100, 80, 0.35)" : "rgba(184, 67, 47, 0.35)";
      ctx.lineWidth = 1;

      // Center Horizontal
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Center Vertical
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();

      // Diagonals (Mi Zi Ge)
      if (writeState.mizige) {
        ctx.strokeStyle = isDark ? "rgba(220, 100, 80, 0.18)" : "rgba(184, 67, 47, 0.18)";
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(w, h);
        ctx.moveTo(w, 0); ctx.lineTo(0, h);
        ctx.stroke();
      }
      ctx.restore();

      // Background Ghost Trace Character
      if (writeState.guide && writeState.char) {
        ctx.save();
        ctx.font = `${Math.floor(w * 0.72)}px "Noto Serif SC", "Songti SC", serif`;
        ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(184, 67, 47, 0.16)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(writeState.char.zh, w / 2, h / 2 + w * 0.04);
        ctx.restore();
      }

      // Draw User Strokes
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      writeState.strokes.forEach((strk) => {
        if (!strk.points.length) return;
        ctx.strokeStyle = isDark && strk.color === "#1e1c1b" ? "#f5f3ef" : strk.color;
        ctx.lineWidth = strk.width;
        ctx.beginPath();
        ctx.moveTo(strk.points[0].x, strk.points[0].y);
        for (let i = 1; i < strk.points.length; i++) {
          ctx.lineTo(strk.points[i].x, strk.points[i].y);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }

    function onStart(e) {
      e.preventDefault();
      isDrawing = true;
      const pos = getPos(e);
      currentStroke = [pos];
      writeState.strokes.push({
        color: writeState.color,
        width: writeState.width,
        points: currentStroke
      });
      drawGridAndStrokes();
    }

    function onMove(e) {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      currentStroke.push(pos);
      drawGridAndStrokes();
    }

    function onEnd() {
      isDrawing = false;
    }

    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);

    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    window.addEventListener("resize", resizeCanvas);
    setTimeout(resizeCanvas, 30);

    // Update details card
    function updateCharDisplay() {
      const infoBox = main.querySelector("[data-char-info]");
      const stepsBox = main.querySelector("[data-steps-box]");
      if (!infoBox || !stepsBox) return;

      infoBox.innerHTML = `
        <div class="char-hero-display zh" lang="zh-Hans">${esc(writeState.char.zh)}</div>
        <div class="char-meta">
          <div class="char-meta-top">
            <span class="char-py lat">${esc(writeState.char.py)}</span>
            <span class="char-en">${esc(writeState.char.en)}</span>
            <button class="say-line mini" data-say="${esc(writeState.char.zh)}" title="Listen to ${esc(writeState.char.zh)}">${ICON_SOUND} Listen</button>
          </div>
          <div class="char-badges">
            <span class="char-badge">Radical: ${esc(writeState.char.radical)}</span>
            <span class="char-badge">${writeState.char.strokes} strokes</span>
            <span class="char-badge">${esc(writeState.char.cat)}</span>
          </div>
          <p class="char-tip">${esc(writeState.char.tip)}</p>
        </div>`;

      stepsBox.innerHTML = `
        <div class="steps-label">Stroke Order Sequence · 笔顺拆解</div>
        ${writeState.char.steps.length ? `<ol class="steps-list">${writeState.char.steps.map((st, i) => `
          <li class="step-item"><span class="step-num">${i + 1}</span> ${esc(st)}</li>`).join("")}
        </ol>` : `<p class="muted small" style="margin:0;">Custom / HSK character — apply the 7 Golden Stroke Order Rules below while tracing.</p>`}`;

      wireSpeak(infoBox);

      main.querySelectorAll("[data-choose-char]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.chooseChar === writeState.char.zh));
      });
      drawGridAndStrokes();
    }

    // Controls wiring
    main.querySelector("[data-t-guide]").addEventListener("change", (e) => {
      writeState.guide = e.target.checked;
      drawGridAndStrokes();
    });

    main.querySelector("[data-t-mizige]").addEventListener("change", (e) => {
      writeState.mizige = e.target.checked;
      drawGridAndStrokes();
    });

    main.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", () => {
      writeState.color = b.dataset.c;
      main.querySelectorAll("[data-c]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));

    main.querySelectorAll("[data-w]").forEach((b) => b.addEventListener("click", () => {
      writeState.width = parseInt(b.dataset.w, 10);
      main.querySelectorAll("[data-w]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      main.querySelectorAll("[data-w]").forEach((x) => x.className = x === b ? "btn small" : "btn small ghost");
    }));

    main.querySelector('[data-action="undo"]').addEventListener("click", () => {
      writeState.strokes.pop();
      drawGridAndStrokes();
    });

    main.querySelector('[data-action="clear"]').addEventListener("click", () => {
      writeState.strokes = [];
      drawGridAndStrokes();
    });

    main.querySelector('[data-action="save"]').addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = `n1mandarin-${writeState.char.zh}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });

    // Category tabs
    main.querySelectorAll("[data-sel-cat]").forEach((b) => b.addEventListener("click", () => {
      writeState.cat = b.dataset.selCat;
      main.querySelectorAll("[data-sel-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const chipsBox = main.querySelector("[data-char-chips]");
      chipsBox.innerHTML = WRITE_CHARS.filter((c) => c.cat === writeState.cat).map((c) => `
        <button class="char-chip write-char-chip zh" lang="zh-Hans" data-choose-char="${c.zh}" aria-pressed="${writeState.char.zh === c.zh}">${c.zh}</button>`).join("");
      wireChips();
    }));

    function wireChips() {
      main.querySelectorAll("[data-choose-char]").forEach((b) => b.addEventListener("click", () => {
        const found = WRITE_CHARS.find((x) => x.zh === b.dataset.chooseChar);
        if (found) {
          writeState.char = found;
          writeState.strokes = [];
          speak(found.zh);
          updateCharDisplay();
        }
      }));
    }
    wireChips();

    const customForm = main.querySelector("[data-write-custom]");
    if (customForm) {
      customForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = customForm.querySelector("[data-custom-char]");
        const val = (input.value || "").trim();
        const ch = Array.from(val).find((c) => /[\u4e00-\u9fff]/.test(c));
        if (!ch) return;
        writeState.char = resolveWriteChar(ch);
        writeState.strokes = [];
        speak(ch);
        updateCharDisplay();
        input.value = "";
      });
    }

    // Clicking example words on strokes and radicals
    main.querySelectorAll("[data-load-char]").forEach((b) => b.addEventListener("click", () => {
      const ch = b.dataset.loadChar;
      let found = WRITE_CHARS.find((x) => x.zh === ch);
      if (!found) {
        // Create dynamic practice item for any sample character
        found = { zh: ch, py: "", en: "Practice character", cat: "Custom", strokes: 0, steps: ["Practice strokes in Tian Zi Ge"], radical: "", tip: "Practice this character in the Tian Zi Ge grid." };
      }
      writeState.char = found;
      writeState.strokes = [];
      speak(found.zh);
      updateCharDisplay();
      window.scrollTo({ top: main.querySelector(".write-studio").offsetTop - 80, behavior: "smooth" });
    }));
  }

  /* ---------- Dark mode theme toggle ---------- */
  function initTheme() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    function getTheme() {
      return document.documentElement.getAttribute("data-theme") || "light";
    }
    function updateState() {
      const isDark = getTheme() === "dark";
      btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      btn.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
    }
    btn.addEventListener("click", () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("n1m-theme", next); } catch (e) {}
      updateState();
    });
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        try {
          if (!localStorage.getItem("n1m-theme")) {
            document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
            updateState();
          }
        } catch (err) {}
      });
    }
    updateState();
  }
  initTheme();

  /* ---------- Router ---------- */
  function route() {
    const h = location.hash;
    if (h === "#library") { location.replace("#/papers"); return; } // old links
    const [path, qs] = h.split("?");
    const m = path.match(/^#\/paper\/([\w-]+)/);
    if (m) renderPaper(m[1]);
    else if (path === "#/words") {
      if (qs) {
        const params = new URLSearchParams(qs);
        const qVal = params.get("q");
        if (qVal) {
          wl.q = qVal;
          wl.group = "All";
          level = "all";
        }
      }
      renderWords();
    }
    else if (path === "#/flashcards") renderFlashcards();
    else if (path === "#/generate") renderGenerate(qs || "");
    else if (path === "#/pinyin") renderPinyin();
    else if (path === "#/write") renderWrite(qs || "");
    else if (path === "#/about") renderAbout();
    else if (path === "#/papers") renderLibrary();
    else renderHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();
})();
