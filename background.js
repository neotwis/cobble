/* Cobble background: only wakes for the focus-timer alarm. */
if (typeof importScripts === "function" && typeof Cobble === "undefined") importScripts("js/core.js");

const C = self.Cobble;

C.api.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "cobble-timer") return;
  const st = await C.store.get("timerState");
  if (!st.running || st.endsAt - Date.now() > 1500) return; // stale
  const s0 = await C.store.get("settings");
  C.setLang(s0.language);
  const { st: next, was, s } = await C.timer.complete(true);
  if (s.timer.notify) {
    try {
      C.api.notifications.create("cobble-" + Date.now(), {
        type: "basic",
        iconUrl: C.api.runtime.getURL("icons/icon128.png"),
        title: "Cobble — " + C.t(was) + " ✓",
        message: C.t(next.phase) + " · " + s.timer[next.phase === "work" ? "work" : next.phase] + " min"
      });
    } catch (e) { console.warn(e); }
  }
});

C.api.runtime.onInstalled.addListener(async (d) => {
  if (d.reason === "install") {
    const links = await C.store.get("links");
    if (!links.length) {
      const now = Date.now();
      await C.store.set("links", [
        { id: C.uid(), title: "Wikipedia", url: "https://www.wikipedia.org/", icon: "W", category: "Reading", position: 0, createdAt: now },
        { id: C.uid(), title: "GitHub", url: "https://github.com/", icon: "G", category: "Work", position: 1, createdAt: now }
      ]);
    }
  }
});
