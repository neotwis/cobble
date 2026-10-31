/* Cobble widgets. Each widget: (ctx) => HTMLElement (card body), may register cleanup via ctx.onCleanup */
(function () {
  "use strict";
  const C = window.Cobble, { el, t, store, api } = C;

  C.ENGINES = {
    google: { name: "Google", url: "https://www.google.com/search?q=%s" },
    bing: { name: "Bing", url: "https://www.bing.com/search?q=%s" },
    duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
    brave: { name: "Brave Search", url: "https://search.brave.com/search?q=%s" }
  };
  C.engineList = (s) => {
    const o = Object.assign({}, C.ENGINES);
    (s.customEngines || []).forEach((e) => (o["custom:" + e.id] = { name: e.name, url: e.url }));
    return o;
  };

  function favicon(url) {
    try { const h = new URL(url).hostname; return h; } catch { return ""; }
  }

  /* ---------- dialog helper ---------- */
  function formDialog(title, fields, onSave) {
    const dlg = document.getElementById("dlg");
    dlg.replaceChildren();
    const errEl = el("p", { class: "err-text", role: "alert" });
    const inputs = {};
    const form = el("form", { method: "dialog" },
      el("h3", { text: title, style: "margin:0" }),
      fields.map((f) => {
        const inp = f.type === "textarea"
          ? el("textarea", { class: "input", name: f.name, rows: 4 })
          : f.type === "select"
            ? el("select", { class: "input", name: f.name }, f.options.map((o) => el("option", { value: o.value, text: o.label })))
            : el("input", { class: "input", name: f.name, type: f.type || "text", list: f.list || null, required: f.required || null, placeholder: f.placeholder || null });
        inp.value = f.value ?? "";
        inputs[f.name] = inp;
        return el("label", null, f.label, inp);
      }),
      f2(),
      errEl,
      el("div", { class: "row", style: "justify-content:flex-end" },
        el("button", { class: "btn", type: "button", onclick: () => dlg.close(), text: t("cancel") }),
        el("button", { class: "btn primary", type: "submit", text: t("save") }))
    );
    function f2() { return null; }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const vals = {}; for (const k in inputs) vals[k] = inputs[k].value;
      const err = await onSave(vals);
      if (err) errEl.textContent = err; else dlg.close();
    });
    dlg.append(form);
    dlg.showModal();
    const first = form.querySelector("input,textarea"); first && first.focus();
  }
  C.formDialog = formDialog;

  /* ---------- Quick links ---------- */
  function linksWidget(ctx) {
    const root = el("div");
    let filter = "";
    let dragId = null;
    async function draw() {
      const links = (await store.get("links")).sort((a, b) => a.position - b.position);
      const shown = links.filter((l) => !filter || (l.title + l.url + l.category).toLowerCase().includes(filter));
      const groups = {};
      shown.forEach((l) => (groups[l.category || ""] ||= []).push(l));
      const grid = el("div", { class: "links" });
      const names = Object.keys(groups).sort();
      if (!links.length) grid.append(el("p", { class: "empty", text: t("empty") }));
      names.forEach((g) => {
        if (names.length > 1 || g) grid.append(el("div", { class: "groupname", text: g || "—" }));
        groups[g].forEach((l) => {
          const icon = l.icon && l.icon.trim()
            ? el("span", { class: "ic", text: l.icon.trim().slice(0, 2) })
            : el("span", { class: "ic", text: (l.title || "?").charAt(0).toUpperCase() });
          const a = el("a", { class: "link", href: l.url, target: "_blank", rel: "noopener noreferrer", draggable: "true", title: l.url,
            ondragstart: () => { dragId = l.id; a.classList.add("drag"); },
            ondragend: () => a.classList.remove("drag"),
            ondragover: (e) => e.preventDefault(),
            ondrop: async (e) => { e.preventDefault(); if (dragId && dragId !== l.id) await reorder(dragId, l.id); }
          }, icon, el("span", { class: "t", text: l.title || favicon(l.url) }),
            el("span", { class: "acts" },
              el("button", { type: "button", "aria-label": t("edit") + " " + l.title, text: "✎", onclick: (e) => { e.preventDefault(); edit(l); } }),
              el("button", { type: "button", "aria-label": t("del") + " " + l.title, text: "✕", onclick: async (e) => { e.preventDefault(); if (confirm(t("confirmDelete"))) { await store.set("links", links.filter((x) => x.id !== l.id)); draw(); } } })));
          grid.append(a);
        });
      });
      root.replaceChildren(grid);
    }
    async function reorder(from, to) {
      const links = (await store.get("links")).sort((a, b) => a.position - b.position);
      const fi = links.findIndex((l) => l.id === from), ti = links.findIndex((l) => l.id === to);
      const [m] = links.splice(fi, 1); links.splice(ti, 0, m);
      links.forEach((l, i) => (l.position = i));
      await store.set("links", links); draw();
    }
    async function edit(l) {
      const links = await store.get("links");
      const cats = [...new Set(links.map((x) => x.category).filter(Boolean))];
      let dl = document.getElementById("cats"); if (!dl) { dl = el("datalist", { id: "cats" }); document.body.append(dl); }
      dl.replaceChildren(...cats.map((c) => el("option", { value: c })));
      formDialog(l ? t("edit") : t("add"), [
        { name: "title", label: t("title"), value: l?.title, required: true },
        { name: "url", label: t("url"), value: l?.url, required: true, placeholder: "https://" },
        { name: "icon", label: t("icon"), value: l?.icon },
        { name: "category", label: t("group"), value: l?.category, list: "cats" }
      ], async (v) => {
        const url = C.normalizeUrl(v.url); if (!url) return t("invalidUrl");
        const cur = await store.get("links");
        if (l) Object.assign(cur.find((x) => x.id === l.id) || {}, { title: v.title.trim(), url, icon: v.icon.trim(), category: v.category.trim() });
        else cur.push({ id: C.uid(), title: v.title.trim(), url, icon: v.icon.trim(), category: v.category.trim(), position: cur.length, createdAt: Date.now() });
        if (await store.set("links", cur)) draw();
      });
    }
    ctx.head(
      el("input", { class: "input", style: "width:9em;padding:.2em .6em;font-size:.85em", placeholder: t("searchLinks"), "aria-label": t("searchLinks"), oninput: (e) => { filter = e.target.value.toLowerCase(); draw(); } }),
      el("button", { class: "btn icon", type: "button", "aria-label": t("add"), text: "+", onclick: () => edit(null) })
    );
    ctx.onStore((ch) => { if (ch.links) draw(); });
    draw();
    return root;
  }

  /* ---------- Notes ---------- */
  function notesWidget(ctx) {
    const root = el("div");
    let current = null, q = "", saveT = null;
    async function draw() {
      const notes = await store.get("notes");
      notes.sort((a, b) => (b.pinned - a.pinned) || b.updatedAt - a.updatedAt);
      if (current) {
        const n = notes.find((x) => x.id === current);
        if (!n) { current = null; return draw(); }
        const status = el("span", { class: "muted" });
        const count = el("span", { class: "muted", text: n.body.length + " " + t("chars") });
        const title = el("input", { class: "input", value: n.title, "aria-label": t("title"), placeholder: t("title") });
        title.value = n.title;
        const body = el("textarea", { class: "input note", "aria-label": t("notes") }); body.value = n.body;
        const save = () => {
          clearTimeout(saveT); status.textContent = "…";
          saveT = setTimeout(async () => {
            const all = await store.get("notes"); const x = all.find((y) => y.id === n.id); if (!x) return;
            x.title = title.value; x.body = body.value; x.updatedAt = Date.now();
            if (await store.set("notes", all)) status.textContent = t("noteSaved");
          }, 400);
          count.textContent = body.value.length + " " + t("chars");
        };
        title.addEventListener("input", save); body.addEventListener("input", save);
        root.replaceChildren(el("div", { style: "display:flex;flex-direction:column;gap:8px" },
          el("div", { class: "row" },
            el("button", { class: "btn ghost", type: "button", text: "← " + t("back"), onclick: () => { current = null; draw(); } }),
            el("span", { class: "grow" }),
            el("button", { class: "btn ghost", type: "button", text: n.pinned ? t("unpin") : t("pin"), onclick: async () => { const all = await store.get("notes"); const x = all.find((y) => y.id === n.id); x.pinned = !x.pinned; await store.set("notes", all); draw(); } }),
            el("button", { class: "btn ghost danger", type: "button", text: t("del"), onclick: async () => { if (!confirm(t("confirmDelete"))) return; await store.set("notes", (await store.get("notes")).filter((y) => y.id !== n.id)); current = null; draw(); } })),
          title, body,
          el("div", { class: "row" }, el("span", { class: "muted grow", text: t("created") + " " + C.fmtDate(n.createdAt) + " · " + t("modified") + " " + C.fmtDate(n.updatedAt) }), count, status)));
        body.focus();
        return;
      }
      const shown = notes.filter((n) => !q || (n.title + n.body).toLowerCase().includes(q));
      const list = el("div", { class: "notes-list" }, shown.length ? shown.map((n) =>
        el("button", { class: "note-item", type: "button", onclick: () => { current = n.id; draw(); } },
          el("b", { text: (n.pinned ? "📌 " : "") + (n.title || n.body.split("\n")[0] || t("newNote")) }),
          el("span", { class: "muted", text: C.fmtDate(n.updatedAt) }))) : el("p", { class: "empty", text: t("empty") }));
      root.replaceChildren(list);
    }
    ctx.head(
      el("input", { class: "input", style: "width:8em;padding:.2em .6em;font-size:.85em", placeholder: t("searchNotes"), "aria-label": t("searchNotes"), oninput: (e) => { q = e.target.value.toLowerCase(); if (!current) draw(); } }),
      el("button", { class: "btn icon", type: "button", "aria-label": t("newNote"), text: "+", onclick: async () => {
        const all = await store.get("notes"); const n = { id: C.uid(), title: "", body: "", pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
        all.push(n); await store.set("notes", all); current = n.id; draw();
      } })
    );
    ctx.onStore((ch) => { if (ch.notes && !current) draw(); });
    draw();
    return root;
  }

  /* ---------- Focus timer ---------- */
  function timerWidget(ctx) {
    const root = el("div");
    const disp = el("p", { class: "tdisp", "aria-live": "off" });
    const bar = el("i"); const barW = el("div", { class: "bar" }, bar);
    const info = el("p", { class: "muted", style: "text-align:center;margin:0" });
    const tabs = el("div", { class: "tabs", role: "group" });
    const ctrls = el("div", { class: "row", style: "justify-content:center;margin-top:.6em" });
    root.append(tabs, disp, barW, ctrls, info);
    let st = null, s = null;
    async function load() { st = await store.get("timerState"); s = await store.get("settings"); render(); }
    function render() {
      if (!st) return;
      const left = C.timer.left(st), total = C.timer.dur(s, st.phase);
      const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
      disp.textContent = String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
      bar.style.width = (100 - (left / total) * 100).toFixed(1) + "%";
      const today = st.today === new Date().toDateString() ? st.todayCount : 0;
      info.textContent = today + " " + t("sessions");
      tabs.replaceChildren(...["work", "short", "long"].map((p) => el("button", { class: "btn", type: "button", "aria-pressed": String(st.phase === p), text: t(p), onclick: () => C.timer.reset(p) })));
      const paused = !st.running && left < total;
      ctrls.replaceChildren(
        el("button", { class: "btn primary", type: "button", text: st.running ? t("pause") : paused ? t("resume") : t("start"), onclick: () => (st.running ? C.timer.pause() : C.timer.start()) }),
        el("button", { class: "btn", type: "button", text: t("reset"), onclick: () => C.timer.reset() }),
        el("button", { class: "btn ghost", type: "button", text: t("skip"), onclick: () => C.timer.complete(false) }));
      if (st.running && left <= 0) {
        // background alarm should handle; fall back if it didn't (e.g. background asleep)
        setTimeout(async () => { const x = await store.get("timerState"); if (x.running && x.endsAt <= Date.now() - 3000) C.timer.complete(true); }, 3500);
      }
    }
    const iv = setInterval(render, 500);
    ctx.onCleanup(() => clearInterval(iv));
    ctx.onStore((ch) => { if (ch.timerState || ch.settings) load(); });
    load();
    return root;
  }

  /* ---------- Bookmarks (real browser bookmarks) ---------- */
  function bookmarksWidget(ctx) {
    const root = el("div");
    let folder = null, q = "", stack = [];
    async function has() {
      try { return await C.P(api.permissions, "contains")({ permissions: ["bookmarks"] }); } catch { return false; }
    }
    async function draw() {
      if (!(await has()) || !api.bookmarks) {
        root.replaceChildren(el("p", { class: "muted", text: t("bmNeed") }),
          el("button", { class: "btn primary", type: "button", text: t("grantBookmarks"), onclick: async () => {
            try { const ok = await C.P(api.permissions, "request")({ permissions: ["bookmarks"] }); if (ok) location.reload(); } catch (e) { C.toast(e.message, true); }
          } }));
        return;
      }
      const B = api.bookmarks;
      let items;
      try {
        if (q) items = await C.P(B, "search")(q);
        else {
          if (!folder) { const tree = await C.P(B, "getTree")(); folder = tree[0].id; }
          items = await C.P(B, "getChildren")(folder);
        }
      } catch (e) { root.replaceChildren(el("p", { class: "empty", text: e.message })); return; }
      const rows = items.slice(0, 200).map((b) => {
        const isFolder = !b.url;
        return el("div", { class: "bm-row" },
          el("span", { "aria-hidden": "true", text: isFolder ? "▸" : "·" }),
          isFolder
            ? el("button", { class: "open", type: "button", text: b.title || "(untitled)", onclick: () => { stack.push(folder); folder = b.id; q = ""; draw(); } })
            : el("a", { href: b.url, target: "_blank", rel: "noopener noreferrer", text: b.title || b.url, title: b.url }),
          b.parentId && b.parentId !== "0" && el("button", { class: "mini", type: "button", text: t("edit"), "aria-label": t("edit") + " " + b.title, onclick: () => edit(b) }),
          b.parentId && b.parentId !== "0" && el("button", { class: "mini", type: "button", text: t("del"), "aria-label": t("del") + " " + b.title, onclick: async () => {
            if (!confirm(t("confirmDelete"))) return;
            try { isFolder ? await C.P(B, "removeTree")(b.id) : await C.P(B, "remove")(b.id); } catch (e) { C.toast(e.message, true); }
          } }));
      });
      root.replaceChildren(
        el("div", { class: "row", style: "margin-bottom:6px" },
          stack.length && !q ? el("button", { class: "btn ghost", type: "button", text: "← " + t("back"), onclick: () => { folder = stack.pop(); draw(); } }) : null,
          el("span", { class: "grow" }),
          !q && stack.length ? el("button", { class: "btn ghost", type: "button", text: "+ " + t("add"), onclick: () => edit(null, false) }) : null,
          !q && stack.length ? el("button", { class: "btn ghost", type: "button", text: "+ " + t("newFolder"), onclick: () => edit(null, true) }) : null),
        el("div", { class: "bm" }, rows.length ? rows : el("p", { class: "empty", text: q ? t("empty") : t("folderEmpty") })));
    }
    function edit(b, asFolder) {
      const folderMode = b ? !b.url : asFolder;
      const fields = [{ name: "title", label: t("title"), value: b?.title, required: true }];
      if (!folderMode) fields.push({ name: "url", label: t("url"), value: b?.url, required: true });
      formDialog(b ? t("edit") : folderMode ? t("newFolder") : t("add"), fields, async (v) => {
        let url; if (!folderMode) { url = C.normalizeUrl(v.url); if (!url) return t("invalidUrl"); }
        try {
          if (b) await C.P(api.bookmarks, "update")(b.id, folderMode ? { title: v.title } : { title: v.title, url });
          else await C.P(api.bookmarks, "create")(folderMode ? { parentId: folder, title: v.title } : { parentId: folder, title: v.title, url });
        } catch (e) { return e.message; }
      });
    }
    ctx.head(el("input", { class: "input", style: "width:9em;padding:.2em .6em;font-size:.85em", placeholder: t("searchBookmarks"), "aria-label": t("searchBookmarks"), oninput: (e) => { q = e.target.value.trim(); draw(); } }));
    // reflect real browser changes
    if (api.bookmarks) {
      const h = () => draw();
      ["onCreated", "onRemoved", "onChanged", "onMoved"].forEach((ev) => api.bookmarks[ev].addListener(h));
      ctx.onCleanup(() => ["onCreated", "onRemoved", "onChanged", "onMoved"].forEach((ev) => api.bookmarks[ev].removeListener(h)));
    }
    draw();
    return root;
  }

  /* ---------- Calendar ---------- */
  function calendarWidget() {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const loc = C.lang === "vi" ? "vi-VN" : undefined;
    const heads = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: "narrow" }));
    return el("div", null,
      el("p", { style: "margin:0 0 .5em", text: now.toLocaleDateString(loc, { month: "long", year: "numeric" }) }),
      el("div", { class: "cal" }, heads.map((h) => el("span", { class: "h", text: h })),
        [...Array(first)].map(() => el("span")),
        [...Array(days)].map((_, i) => el("span", { class: "d" + (i + 1 === now.getDate() ? " today" : ""), text: i + 1 }))));
  }

  /* ---------- Quote ---------- */
  function quoteWidget() {
    const Q = window.COBBLE_QUOTES;
    const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    const [text, who] = Q[day % Q.length];
    return el("div", null, el("blockquote", { text: "“" + text + "”" }), el("p", { class: "muted", text: "— " + who }));
  }

  /* ---------- Weather (Open-Meteo, free, no key) ---------- */
  const WMO = { 0: "☀️ Clear", 1: "🌤 Mostly clear", 2: "⛅ Partly cloudy", 3: "☁️ Overcast", 45: "🌫 Fog", 48: "🌫 Fog", 51: "🌦 Drizzle", 53: "🌦 Drizzle", 55: "🌦 Drizzle", 61: "🌧 Rain", 63: "🌧 Rain", 65: "🌧 Heavy rain", 71: "🌨 Snow", 73: "🌨 Snow", 75: "🌨 Heavy snow", 80: "🌦 Showers", 81: "🌦 Showers", 82: "⛈ Violent showers", 95: "⛈ Thunderstorm", 96: "⛈ Thunderstorm", 99: "⛈ Thunderstorm" };
  function weatherWidget(ctx) {
    const root = el("div", null, el("p", { class: "muted", text: "…" }));
    (async () => {
      const s = ctx.settings; const w = s.weather;
      if (w.lat == null) { root.replaceChildren(el("p", { class: "muted", text: t("weatherOff") })); return; }
      try {
        const cacheKey = "weatherCache";
        const c = (await C.P(api.storage.local, "get")(cacheKey))[cacheKey];
        let data;
        if (c && c.lat === w.lat && c.unit === w.unit && Date.now() - c.at < 20 * 60000) data = c.data;
        else {
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1&temperature_unit=${w.unit}`);
          if (!r.ok) throw new Error(r.status);
          data = await r.json();
          C.P(api.storage.local, "set")({ [cacheKey]: { at: Date.now(), lat: w.lat, unit: w.unit, data } });
        }
        const u = w.unit === "fahrenheit" ? "°F" : "°C";
        root.replaceChildren(
          el("p", { style: "font-size:2.2em;margin:0;font-weight:300", text: Math.round(data.current.temperature_2m) + u }),
          el("p", { style: "margin:0", text: WMO[data.current.weather_code] || "—" }),
          el("p", { class: "muted", text: `${w.city} · ↑${Math.round(data.daily.temperature_2m_max[0])}° ↓${Math.round(data.daily.temperature_2m_min[0])}° · ${Math.round(data.current.wind_speed_10m)} km/h` }),
          el("p", { class: "muted", style: "font-size:.7em", text: "Open-Meteo.com" }));
      } catch { root.replaceChildren(el("p", { class: "muted", text: t("weatherErr") })); }
    })();
    return root;
  }

  /* ---------- Clock widget (secondary, e.g. other timezone) ---------- */
  function clockWidget(ctx) {
    const p = el("p", { style: "font-size:2.2em;margin:0;font-weight:300;font-variant-numeric:tabular-nums" });
    const z = el("p", { class: "muted" });
    const tz = ctx.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tick = () => { try { p.textContent = new Date().toLocaleTimeString(C.lang === "vi" ? "vi-VN" : undefined, { timeZone: tz, hour12: !ctx.settings.clock24, hour: "2-digit", minute: "2-digit" }); } catch { p.textContent = "--"; } };
    z.textContent = tz.replace(/_/g, " ");
    tick(); const iv = setInterval(tick, 1000); ctx.onCleanup(() => clearInterval(iv));
    return el("div", null, p, z);
  }

  C.WIDGETS = { links: linksWidget, notes: notesWidget, timer: timerWidget, bookmarks: bookmarksWidget, calendar: calendarWidget, quote: quoteWidget, weather: weatherWidget, clock: clockWidget };
})();
