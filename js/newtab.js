/* Cobble new tab dashboard */
(function () {
  "use strict";
  const C = window.Cobble, { el, t, store } = C;
  let S = null, editing = false, cleanups = [], storeSubs = [], clockIv = null;

  function greeting() {
    const h = new Date().getHours();
    const k = h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : h < 22 ? "evening" : "night";
    return t(k) + (S.name ? ", " + S.name : "") + ".";
  }
  function fmtTime(d) {
    const o = { hour: "2-digit", minute: "2-digit", hour12: !S.clock24 };
    if (S.showSeconds) o.second = "2-digit";
    return d.toLocaleTimeString(C.lang === "vi" ? "vi-VN" : undefined, o);
  }
  function fmtDay(d) {
    if (S.dateFormat === "iso") return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const o = S.dateFormat === "short" ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "long", month: "long", day: "numeric", year: "numeric" };
    return d.toLocaleDateString(C.lang === "vi" ? "vi-VN" : undefined, o);
  }
  function tickHero() {
    const d = new Date();
    document.getElementById("greet").textContent = greeting();
    document.getElementById("time").textContent = fmtTime(d);
    const de = document.getElementById("date");
    de.textContent = S.showDate ? fmtDay(d) : "";
    de.hidden = !S.showDate;
  }

  function setupSearch() {
    const form = document.getElementById("search"), q = document.getElementById("q"), sel = document.getElementById("engine");
    form.classList.toggle("bottom", S.searchPosition === "bottom");
    form.hidden = S.searchPosition === "none";
    q.placeholder = t("searchPlaceholder");
    const list = C.engineList(S);
    if (!list[S.engine]) S.engine = "duckduckgo";
    sel.replaceChildren(...Object.entries(list).map(([id, e]) => el("option", { value: id, text: e.name })));
    sel.value = S.engine;
    sel.onchange = async () => { const s = await store.get("settings"); s.engine = sel.value; await store.set("settings", s); };
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = q.value.trim(); if (!v) return;
      const looksUrl = !/\s/.test(v) && (/^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(v));
      const direct = looksUrl && C.normalizeUrl(v);
      const eng = list[sel.value] || C.ENGINES.duckduckgo;
      location.href = direct || eng.url.replace("%s", encodeURIComponent(v));
    };
  }

  async function saveWidgets(fn) {
    const s = await store.get("settings"); fn(s.widgets); await store.set("settings", s);
  }

  function renderGrid() {
    cleanups.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
    cleanups = []; storeSubs = [];
    const grid = document.getElementById("grid");
    grid.replaceChildren();
    const cols = Math.max(1, S.columns);
    S.widgets.forEach((w, idx) => {
      if (!w.on && !editing) return;
      const make = C.WIDGETS[w.id]; if (!make) return;
      const head = el("span", { class: "row" });
      const ctx = {
        settings: S,
        head: (...n) => head.append(...n),
        onCleanup: (f) => cleanups.push(f),
        onStore: (f) => storeSubs.push(f)
      };
      let body;
      try { body = w.on ? make(ctx) : el("p", { class: "muted", text: t("hidden") }); }
      catch (e) { console.error(e); body = el("p", { class: "empty", text: e.message }); }
      const span = Math.min(Math.max(1, w.size || 1), cols);
      const bar = el("div", { class: "editbar" },
        el("button", { class: "btn icon", type: "button", title: t("moveUp"), "aria-label": t("moveUp") + " " + t(w.id), disabled: idx === 0, text: "←", onclick: () => saveWidgets((ws) => { const [m] = ws.splice(idx, 1); ws.splice(idx - 1, 0, m); }) }),
        el("button", { class: "btn icon", type: "button", title: t("moveDown"), "aria-label": t("moveDown") + " " + t(w.id), disabled: idx === S.widgets.length - 1, text: "→", onclick: () => saveWidgets((ws) => { const [m] = ws.splice(idx, 1); ws.splice(idx + 1, 0, m); }) }),
        el("button", { class: "btn icon", type: "button", title: t("smaller"), "aria-label": t("smaller") + " " + t(w.id), disabled: span <= 1, text: "−", onclick: () => saveWidgets((ws) => { ws[idx].size = Math.max(1, span - 1); }) }),
        el("button", { class: "btn icon", type: "button", title: t("bigger"), "aria-label": t("bigger") + " " + t(w.id), disabled: span >= cols, text: "+", onclick: () => saveWidgets((ws) => { ws[idx].size = Math.min(cols, span + 1); }) }),
        el("button", { class: "btn", type: "button", text: w.on ? t("hide") : t("show"), onclick: () => saveWidgets((ws) => { ws[idx].on = !ws[idx].on; }) }));
      const card = el("section", { class: "card" + (w.on ? "" : " off"), style: "grid-column: span " + span, "aria-label": t(w.id) },
        bar, el("h2", null, el("span", { text: t(w.id) }), head), body);
      grid.append(card);
    });
  }

  function applyStatic() {
    document.title = (C.lang === "vi" ? "Tab mới" : "New Tab") + " · Cobble";
    document.getElementById("customize").textContent = editing ? t("done") : t("customize");
    document.getElementById("settingsLink").textContent = t("settings");
    document.getElementById("app").classList.toggle("editing", editing);
  }

  async function renderAll() {
    S = await store.get("settings");
    C.applyTheme(S);
    C.applyBackground(S);
    applyStatic();
    tickHero();
    setupSearch();
    renderGrid();
  }

  async function init() {
    await renderAll();
    clearInterval(clockIv);
    clockIv = setInterval(tickHero, 1000);
    document.getElementById("customize").addEventListener("click", () => { editing = !editing; applyStatic(); renderGrid(); });
    store.onChange((ch) => {
      if (ch.settings) { renderAll(); return; }
      storeSubs.forEach((f) => { try { f(ch); } catch (e) { console.warn(e); } });
    });
    if (C.api.storage.onChanged && window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => S.theme === "system" && C.applyTheme(S));
    }
    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (e.key === "/" && !["input", "textarea", "select"].includes(tag) && !e.target.isContentEditable) {
        e.preventDefault(); document.getElementById("q").focus();
      }
    });
    if (S.searchPosition !== "none") document.getElementById("q").focus();
  }
  init().catch((e) => { console.error(e); C.toast(e.message, true); });
})();
