/* Cobble toolbar popup */
(function () {
  "use strict";
  const C = window.Cobble, { el, t, store, api } = C;
  const $ = (id) => document.getElementById(id);

  async function init() {
    const s = await store.get("settings");
    C.applyTheme(s);
    $("openSettings").textContent = t("settings");
    $("openDash").textContent = t("openDashboard");
    $("addTab").textContent = t("addTab");
    $("qnTitle").textContent = t("quickNote");
    $("qnSave").textContent = t("save");

    $("openDash").onclick = () => { api.tabs.create({ url: api.runtime.getURL("newtab.html") }); window.close(); };
    $("openSettings").onclick = () => { api.runtime.openOptionsPage(); window.close(); };

    $("addTab").onclick = async () => {
      try {
        const [tab] = await C.P(api.tabs, "query")({ active: true, currentWindow: true });
        const url = tab && C.validUrl(tab.url || "");
        if (!url) { C.toast(t("invalidUrl"), true); return; }
        const links = await store.get("links");
        if (!links.some((l) => l.url === url)) {
          links.push({ id: C.uid(), title: (tab.title || new URL(url).hostname).slice(0, 80), url, icon: "", category: "", position: links.length, createdAt: Date.now() });
          if (!(await store.set("links", links))) return;
        }
        $("addTab").textContent = "✓ " + t("added");
        $("addTab").disabled = true;
      } catch (e) { C.toast(e.message, true); }
    };

    $("qn").onsubmit = async (e) => {
      e.preventDefault();
      const body = $("qnBody").value.trim(); if (!body) return;
      const notes = await store.get("notes");
      const now = Date.now();
      notes.push({ id: C.uid(), title: body.split("\n")[0].slice(0, 60), body, pinned: false, createdAt: now, updatedAt: now });
      if (await store.set("notes", notes)) { $("qnBody").value = ""; $("qnStatus").textContent = t("noteSaved"); }
    };

    // mini timer
    const card = $("timerCard");
    const disp = el("p", { class: "tdisp", style: "margin:0" });
    const label = el("p", { class: "muted", style: "text-align:center;margin:0" });
    const ctrls = el("div", { class: "row", style: "justify-content:center;margin-top:6px" });
    card.append(label, disp, ctrls);
    let st = await store.get("timerState"), cfg = s;
    function render() {
      const left = C.timer.left(st), total = C.timer.dur(cfg, st.phase);
      disp.textContent = String(Math.floor(left / 60000)).padStart(2, "0") + ":" + String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
      label.textContent = t("timer") + " · " + t(st.phase);
      const paused = !st.running && left < total;
      ctrls.replaceChildren(
        el("button", { class: "btn primary", type: "button", text: st.running ? t("pause") : paused ? t("resume") : t("start"), onclick: () => (st.running ? C.timer.pause() : C.timer.start()) }),
        el("button", { class: "btn", type: "button", text: t("reset"), onclick: () => C.timer.reset() }));
    }
    store.onChange(async (ch) => { if (ch.timerState || ch.settings) { st = await store.get("timerState"); cfg = await store.get("settings"); render(); } });
    render(); setInterval(render, 500);
    $("qnBody").focus();
  }
  init().catch((e) => { console.error(e); C.toast(e.message, true); });
})();
