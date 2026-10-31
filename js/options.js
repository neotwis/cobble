/* Cobble settings page. Every control saves immediately. */
(function () {
  "use strict";
  const C = window.Cobble, { el, t, store } = C;
  const ENGINES = { google: "Google", bing: "Bing", duckduckgo: "DuckDuckGo", brave: "Brave Search" };
  let S = null;
  const app = document.getElementById("app");

  async function update(fn, rerender) {
    const s = await store.get("settings");
    fn(s);
    if (await store.set("settings", s)) {
      S = s; C.applyTheme(S); C.applyBackground(S);
      if (rerender) render();
    }
  }
  const get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), S);
  const setPath = (s, path, v) => { const ks = path.split("."); const last = ks.pop(); ks.reduce((o, k) => o[k], s)[last] = v; };

  let fid = 0;
  function field(label, control, hint) {
    const id = control.id || (control.id = "f" + ++fid);
    return el("div", { class: "field" }, el("label", { for: id, text: label }), el("div", null, control, hint ? el("p", { class: "hint", text: hint }) : null));
  }
  function select(path, options, rerender) {
    const s = el("select", { class: "input", onchange: (e) => update((x) => setPath(x, path, e.target.value), rerender) },
      options.map(([v, l]) => el("option", { value: v, text: l })));
    s.value = String(get(path) ?? "");
    return s;
  }
  function range(path, min, max, step, unit) {
    const out = el("span", { class: "muted", style: "min-width:4em;text-align:right" });
    const show = (v) => (out.textContent = v + (unit || ""));
    const r = el("input", { type: "range", min, max, step, oninput: (e) => show(e.target.value), onchange: (e) => update((x) => setPath(x, path, Number(e.target.value))) });
    r.value = get(path); show(get(path));
    return el("div", { class: "row" }, r, out);
  }
  function number(path, min, max) {
    const n = el("input", { class: "input", type: "number", min, max, style: "max-width:7em", onchange: (e) => {
      const v = Math.round(Number(e.target.value));
      if (!(v >= min && v <= max)) { e.target.value = get(path); return; }
      update((x) => setPath(x, path, v));
    } });
    n.value = get(path);
    return n;
  }
  function check(path, label) {
    const c = el("input", { type: "checkbox", onchange: (e) => update((x) => setPath(x, path, e.target.checked)) });
    c.checked = !!get(path);
    return el("label", { class: "check" }, c, label);
  }
  function text(path, placeholder) {
    const i = el("input", { class: "input", placeholder, onchange: (e) => update((x) => setPath(x, path, e.target.value.trim())) });
    i.value = get(path) || "";
    return i;
  }
  const section = (id, title, ...kids) => el("section", { id, "aria-labelledby": id + "-h" }, el("h2", { id: id + "-h", text: title }), ...kids);

  /* ---- sections ---- */
  function profile() {
    return section("profile", t("profile"),
      field(t("yourName"), text("name", "")),
      field(t("language"), select("language", [["en", "English"], ["vi", "Tiếng Việt"]], true)));
  }

  function appearance() {
    const mode = C.isDark(S) ? "dark" : "light";
    const swatches = el("div", { class: "swatches", role: "group", "aria-label": t("palette") },
      Object.entries(C.PALETTES).map(([k, p]) => el("button", { class: "swatch", type: "button", "aria-pressed": String(S.palette === k), title: k, "aria-label": k,
        onclick: () => update((x) => { x.palette = k; }, true) },
        ["background", "primary", "accent"].map((c) => el("i", { style: "background:" + p[mode][c] })), el("span", { style: "font-size:.8em;padding:0 4px", text: k }))));
    const base = (C.PALETTES[S.palette] || C.PALETTES.stone)[mode];
    const cur = Object.assign({}, base, (S.colors && S.colors[mode]) || {});
    const colorset = el("div", { class: "colorset" }, ["primary", "accent", "background", "surface", "text", "border"].map((k) => {
      const inp = el("input", { type: "color", "aria-label": t("c_" + k), onchange: (e) => update((x) => { x.colors = x.colors || {}; x.colors[mode] = x.colors[mode] || {}; x.colors[mode][k] = e.target.value; }) });
      inp.value = cur[k];
      return el("label", null, inp, t("c_" + k));
    }));
    return section("appearance", t("appearance"),
      field(t("theme"), select("theme", [["system", t("system")], ["light", t("light")], ["dark", t("dark")]], true)),
      field(t("palette"), swatches),
      field(t("customColors") + " (" + t(mode) + ")", el("div", null, colorset,
        el("button", { class: "btn ghost", type: "button", style: "margin-top:8px", text: t("resetColors"), onclick: () => update((x) => { if (x.colors) delete x.colors[mode]; }, true) }))),
      field(t("font"), select("font", ["serif", "sans", "rounded", "mono"].map((f) => [f, t("f_" + f)]))),
      field(t("fontSize"), range("fontSize", 12, 22, 1, "px")),
      field(t("fontWeight"), range("fontWeight", 300, 700, 100)),
      field(t("lineHeight"), range("lineHeight", 1.2, 2, 0.05)));
  }

  function layout() {
    const list = el("div", { class: "wlist" }, S.widgets.map((w, i) => {
      const c = el("input", { type: "checkbox", onchange: (e) => update((x) => { x.widgets[i].on = e.target.checked; }) });
      c.checked = w.on;
      return el("div", { class: "wrow" },
        el("label", { class: "check grow" }, c, t(w.id)),
        el("button", { class: "btn icon", type: "button", disabled: i === 0, "aria-label": t("moveUp") + " " + t(w.id), text: "↑", onclick: () => update((x) => { const [m] = x.widgets.splice(i, 1); x.widgets.splice(i - 1, 0, m); }, true) }),
        el("button", { class: "btn icon", type: "button", disabled: i === S.widgets.length - 1, "aria-label": t("moveDown") + " " + t(w.id), text: "↓", onclick: () => update((x) => { const [m] = x.widgets.splice(i, 1); x.widgets.splice(i + 1, 0, m); }, true) }));
    }));
    return section("layout", t("layout"),
      field(t("width"), range("width", 720, 1600, 20, "px")),
      field(t("columns"), range("columns", 1, 4, 1)),
      field(t("spacing"), range("spacing", 8, 40, 2, "px")),
      field(t("searchPosition"), select("searchPosition", [["top", t("top")], ["bottom", t("bottom")], ["none", t("none")]])),
      field(t("widgets"), list));
  }

  function clock() {
    const zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : []).map((z) => [z, z.replace(/_/g, " ")]);
    return section("clock", t("clock"),
      field("", el("div", { class: "row wrap", style: "gap:1.2em" }, check("clock24", t("clock24")), check("showSeconds", t("showSeconds")), check("showDate", t("showDate")))),
      field(t("dateFormat"), select("dateFormat", [["long", t("d_long")], ["short", t("d_short")], ["iso", t("d_iso")]])),
      field(t("timezone"), select("timezone", [["", t("tzLocal")]].concat(zones))));
  }

  function search() {
    const opts = Object.entries(ENGINES).concat((S.customEngines || []).map((e) => ["custom:" + e.id, e.name]));
    const list = el("div", { class: "wlist" }, (S.customEngines || []).map((e) =>
      el("div", { class: "wrow" }, el("span", { class: "grow" }, el("b", { text: e.name }), " ", el("span", { class: "muted", text: e.url })),
        el("button", { class: "btn ghost danger", type: "button", text: t("del"), "aria-label": t("del") + " " + e.name,
          onclick: () => update((x) => { x.customEngines = x.customEngines.filter((y) => y.id !== e.id); if (x.engine === "custom:" + e.id) x.engine = "duckduckgo"; }, true) }))));
    const add = el("button", { class: "btn", type: "button", style: "margin-top:8px", text: "+ " + t("add"), onclick: () => {
      C.formDialog(t("customEngines"), [
        { name: "name", label: t("engineName"), required: true },
        { name: "url", label: t("engineUrl"), required: true, placeholder: "https://example.com/search?q=%s" }
      ], async (v) => {
        if (!v.url.includes("%s")) return t("needS");
        const url = C.validUrl(v.url.replace("%s", "COBBLEQ"));
        if (!url) return t("invalidUrl");
        await update((x) => { x.customEngines = (x.customEngines || []).concat({ id: C.uid(), name: v.name.trim().slice(0, 40), url: url.replace("COBBLEQ", "%s") }); }, true);
      });
    } });
    return section("search", t("search"),
      field(t("engine"), select("engine", opts)),
      field(t("customEngines"), el("div", null, list, add)));
  }

  function background() {
    const b = S.background;
    const kids = [field(t("background"), select("background.type", [["solid", t("b_solid")], ["gradient", t("b_gradient")], ["image", t("b_image")], ["upload", t("b_upload")]], true))];
    if (b.type === "solid") {
      const c = el("input", { type: "color", onchange: (e) => update((x) => { x.background.value = e.target.value; }) });
      c.value = /^#[0-9a-f]{6}$/i.test(b.value) ? b.value : (C.PALETTES[S.palette] || C.PALETTES.stone)[C.isDark(S) ? "dark" : "light"].background;
      kids.push(field(t("c_background"), el("div", { class: "row" }, c,
        el("button", { class: "btn ghost", type: "button", text: t("reset"), onclick: () => update((x) => { x.background.value = ""; }, true) }))));
    } else if (b.type === "gradient") {
      kids.push(field(t("b_gradient"), el("div", { class: "swatches" }, C.GRADIENTS.map((g, i) =>
        el("button", { class: "wall", type: "button", "aria-label": t("b_gradient") + " " + (i + 1), "aria-pressed": String(b.value === g), style: "background:" + g, onclick: () => update((x) => { x.background.value = g; }, true) })))));
    } else if (b.type === "image") {
      const i = el("input", { class: "input", placeholder: "https://…", onchange: (e) => {
        const u = C.validUrl(e.target.value);
        if (e.target.value && !u) { C.toast(t("invalidUrl"), true); return; }
        update((x) => { x.background.value = u || ""; });
      } });
      i.value = b.value || "";
      kids.push(field(t("imageUrl"), i));
    } else if (b.type === "upload") {
      const thumb = el("div", { class: "preview-thumb" });
      C.idb.get("wallpaper").then((blob) => { if (blob) thumb.style.backgroundImage = 'url("' + URL.createObjectURL(blob) + '")'; }).catch(() => {});
      const file = el("input", { type: "file", accept: "image/*", class: "input", onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (!f.type.startsWith("image/")) { C.toast(t("invalidUrl"), true); return; }
        if (f.size > 8 * 1024 * 1024) { C.toast(t("tooBig"), true); return; }
        try { await C.idb.put("wallpaper", f); await update((x) => { x.background.value = "upload:" + Date.now(); }, true); }
        catch (err) { C.toast(t("saveFailed") + ": " + err.message, true); }
      } });
      kids.push(field(t("upload"), el("div", { style: "display:flex;flex-direction:column;gap:8px" }, thumb, file)));
    }
    if (b.type !== "solid") {
      kids.push(field(t("blur"), range("background.blur", 0, 20, 1, "px")),
        field(t("overlay"), range("background.overlay", 0, 0.8, 0.05)),
        field(t("position"), select("background.position", [["center", "Center"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]])));
    }
    return section("background", t("background"), ...kids);
  }

  function weather() {
    const w = S.weather;
    const city = el("input", { class: "input grow", placeholder: "Hà Nội, London…" });
    city.value = w.city || "";
    const status = el("p", { class: "hint", role: "status", text: w.lat != null ? `${w.city} (${w.lat.toFixed(2)}, ${w.lon.toFixed(2)})` : "" });
    const find = async () => {
      const q = city.value.trim();
      if (!q) { await update((x) => { x.weather.city = ""; x.weather.lat = null; x.weather.lon = null; }); status.textContent = ""; return; }
      status.textContent = "…";
      try {
        const r = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=" + C.lang + "&name=" + encodeURIComponent(q));
        if (!r.ok) throw new Error(r.status);
        const j = await r.json(); const g = j.results && j.results[0];
        if (!g) { status.textContent = t("cityNotFound"); return; }
        const name = g.name + (g.country ? ", " + g.country : "");
        await update((x) => { x.weather.city = name; x.weather.lat = g.latitude; x.weather.lon = g.longitude; const ww = x.widgets.find((y) => y.id === "weather"); if (ww) ww.on = true; });
        city.value = name; status.textContent = `${name} (${g.latitude.toFixed(2)}, ${g.longitude.toFixed(2)})`;
      } catch { status.textContent = t("weatherErr"); }
    };
    city.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); find(); } });
    return section("weather", t("weather"),
      field(t("city"), el("div", null, el("div", { class: "row" }, city, el("button", { class: "btn", type: "button", text: t("findCity"), onclick: find })), status)),
      field(t("unit"), select("weather.unit", [["celsius", t("celsius")], ["fahrenheit", t("fahrenheit")]])));
  }

  function timerSec() {
    return section("timer", t("timerSettings"),
      field(t("workMin"), number("timer.work", 1, 180)),
      field(t("shortMin"), number("timer.short", 1, 60)),
      field(t("longMin"), number("timer.long", 1, 90)),
      field(t("every"), number("timer.every", 2, 12)),
      field("", check("timer.notify", t("notify"))));
  }

  function data() {
    const file = el("input", { type: "file", accept: "application/json,.json", class: "sr", id: "importFile", onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (!j || j.app !== "cobble" || typeof j.data !== "object") throw new Error();
        const d = j.data, clean = {};
        if (d.settings && typeof d.settings === "object") clean.settings = C.merge(C.clone(C.DEFAULTS.settings), d.settings);
        if (Array.isArray(d.links)) clean.links = d.links.filter((l) => l && C.validUrl(String(l.url || ""))).map((l, i) => ({ id: String(l.id || C.uid()), title: String(l.title || "").slice(0, 120), url: C.validUrl(l.url), icon: String(l.icon || "").slice(0, 4), category: String(l.category || "").slice(0, 60), position: i, createdAt: Number(l.createdAt) || Date.now() }));
        if (Array.isArray(d.notes)) clean.notes = d.notes.filter((n) => n && typeof n === "object").map((n) => ({ id: String(n.id || C.uid()), title: String(n.title || ""), body: String(n.body || ""), pinned: !!n.pinned, createdAt: Number(n.createdAt) || Date.now(), updatedAt: Number(n.updatedAt) || Date.now() }));
        if (!Object.keys(clean).length) throw new Error();
        if (clean.settings && clean.settings.background.type === "upload") clean.settings.background.type = "solid";
        await C.P(C.api.storage.local, "set")(clean);
        C.toast(t("imported"));
        await load();
      } catch { C.toast(t("importBad"), true); }
      e.target.value = "";
    } });
    return section("data", t("data"),
      el("p", { class: "hint", style: "margin-bottom:1em", text: t("exportHint") }),
      el("div", { class: "row wrap" },
        el("button", { class: "btn primary", type: "button", text: t("export"), onclick: async () => {
          const all = await store.all(); delete all.weatherCache;
          C.download("cobble-backup-" + new Date().toISOString().slice(0, 10) + ".json", { app: "cobble", version: 1, exportedAt: new Date().toISOString(), data: all });
        } }),
        el("button", { class: "btn", type: "button", text: t("import"), onclick: () => file.click() }), file,
        el("span", { class: "grow" }),
        el("button", { class: "btn danger", type: "button", text: t("resetAll"), onclick: async () => {
          if (!confirm(t("confirmReset"))) return;
          await C.P(C.api.storage.local, "clear")(); await C.idb.del("wallpaper").catch(() => {});
          C.api.alarms.clear("cobble-timer"); await load();
        } })));
  }

  function render() {
    const y = window.scrollY;
    document.title = t("settings") + " · Cobble";
    app.replaceChildren(
      el("header", null,
        el("div", { class: "row" }, el("img", { src: "icons/icon32.png", alt: "", width: 28, height: 28 }), el("h1", { class: "grow", text: t("settings") }),
          el("a", { class: "btn", href: "newtab.html", text: "← " + t("openDashboard") })),
        el("p", { class: "lead", text: t("savedAuto") }),
        el("nav", { class: "toc", "aria-label": t("settings") }, ["profile", "appearance", "layout", "clock", "search", "background", "weather", "timer", "data"].map((id) =>
          el("a", { class: "btn ghost", href: "#" + id, text: t(id === "timer" ? "timerSettings" : id) })))),
      profile(), appearance(), layout(), clock(), search(), background(), weather(), timerSec(), data(),
      el("p", { class: "muted", style: "text-align:center", text: "Cobble " + C.api.runtime.getManifest().version + " · neotwis" }));
    window.scrollTo(0, y);
  }

  async function load() { S = await store.get("settings"); C.applyTheme(S); C.applyBackground(S); render(); }
  load().catch((e) => { console.error(e); C.toast(e.message, true); });
})();
