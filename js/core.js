/* Cobble core: browser compat layer, storage, i18n, theming. Plain script, exposes window.Cobble */
(function (g) {
  "use strict";
  const api = g.browser && g.browser.runtime ? g.browser : g.chrome;
  const isFirefox = typeof g.browser !== "undefined" && !!g.browser.runtime;

  // promise wrapper that works for both chrome (callbacks or promises) and firefox
  function call(fn, ...args) {
    return new Promise((res, rej) => {
      try {
        const r = fn(...args, (v) => {
          const e = api.runtime && api.runtime.lastError;
          e ? rej(new Error(e.message)) : res(v);
        });
        if (r && typeof r.then === "function") r.then(res, rej);
      } catch (e) {
        // firefox rejects extra callback arg on some APIs
        try { Promise.resolve(fn(...args)).then(res, rej); } catch (e2) { rej(e2); }
      }
    });
  }
  const P = (obj, name) => (...a) => (isFirefox ? obj[name](...a) : call(obj[name].bind(obj), ...a));

  const DEFAULTS = {
    settings: {
      name: "",
      language: "en",
      theme: "system",
      palette: "stone",
      colors: null, // custom overrides {primary, accent, background, surface, text, border}
      font: "serif",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.5,
      clock24: false,
      showSeconds: false,
      showDate: true,
      dateFormat: "long",
      timezone: "",
      engine: "duckduckgo",
      customEngines: [],
      searchPosition: "top",
      width: 1100,
      columns: 3,
      spacing: 20,
      background: { type: "solid", value: "", blur: 0, overlay: 0.15, position: "center" },
      widgets: [
        { id: "clock", on: true, size: 1 },
        { id: "links", on: true, size: 2 },
        { id: "notes", on: true, size: 1 },
        { id: "timer", on: true, size: 1 },
        { id: "bookmarks", on: true, size: 1 },
        { id: "calendar", on: false, size: 1 },
        { id: "quote", on: true, size: 1 },
        { id: "weather", on: false, size: 1 }
      ],
      weather: { city: "", lat: null, lon: null, unit: "celsius" },
      timer: { work: 25, short: 5, long: 15, every: 4, notify: true }
    },
    links: [],
    notes: [],
    timerState: { phase: "work", running: false, endsAt: 0, remaining: 25 * 60 * 1000, completed: 0, today: "", todayCount: 0 }
  };

  const store = {
    async get(key) {
      try {
        const o = await P(api.storage.local, "get")(key);
        if (o[key] === undefined) return clone(DEFAULTS[key]);
        if (key === "settings") return merge(clone(DEFAULTS.settings), o[key]);
        return o[key];
      } catch (e) { console.error("[cobble] read failed", e); return clone(DEFAULTS[key]); }
    },
    async set(key, value) {
      try { await P(api.storage.local, "set")({ [key]: value }); return true; }
      catch (e) { console.error("[cobble] write failed", e); toast(t("saveFailed") + ": " + e.message, true); return false; }
    },
    async all() { return P(api.storage.local, "get")(null); },
    async replace(data) { await P(api.storage.local, "clear")(); await P(api.storage.local, "set")(data); },
    onChange(cb) { api.storage.onChanged.addListener((ch, area) => area === "local" && cb(ch)); }
  };

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function merge(base, over) {
    if (!over || typeof over !== "object") return base;
    for (const k of Object.keys(over)) {
      if (k === "widgets" && Array.isArray(over.widgets)) {
        const ids = over.widgets.map((w) => w.id);
        base.widgets = over.widgets.filter((w) => base.widgets.some((b) => b.id === w.id))
          .concat(base.widgets.filter((b) => !ids.includes(b.id)));
      } else if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) && over[k] && typeof over[k] === "object") {
        base[k] = merge(base[k], over[k]);
      } else base[k] = over[k];
    }
    return base;
  }

  /* IndexedDB for wallpapers */
  const idb = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open("cobble", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("files");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async put(key, blob) {
      const db = await idb.open();
      return new Promise((res, rej) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(blob, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    },
    async get(key) {
      const db = await idb.open();
      return new Promise((res, rej) => { const q = db.transaction("files").objectStore("files").get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    },
    async del(key) {
      const db = await idb.open();
      return new Promise((res) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").delete(key); tx.oncomplete = res; });
    }
  };

  /* i18n */
  const STR = {
    en: {
      morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night",
      search: "Search the web", links: "Quick links", notes: "Notes", timer: "Focus", bookmarks: "Bookmarks",
      calendar: "Calendar", quote: "Daily quote", weather: "Weather", clock: "Clock",
      add: "Add", edit: "Edit", del: "Delete", save: "Save", cancel: "Cancel", title: "Title", url: "URL",
      group: "Group", icon: "Icon (emoji or letter)", invalidUrl: "Please enter a valid http(s) URL.",
      newNote: "New note", pin: "Pin", unpin: "Unpin", searchNotes: "Search notes", searchLinks: "Filter links",
      created: "Created", modified: "Edited", chars: "chars", empty: "Nothing here yet.",
      work: "Work", short: "Short break", long: "Long break", start: "Start", pause: "Pause", resume: "Resume", reset: "Reset", skip: "Skip",
      sessions: "sessions today", grantBookmarks: "Allow bookmark access", bmNeed: "Cobble needs permission to read your browser bookmarks.",
      searchBookmarks: "Search bookmarks", back: "Back", newFolder: "New folder", folderEmpty: "This folder is empty.",
      settings: "Settings", openDashboard: "Open dashboard", quickNote: "Quick note", noteSaved: "Saved",
      weatherOff: "Set a city in Settings to show weather.", weatherErr: "Weather service unavailable right now.",
      saveFailed: "Could not save", confirmDelete: "Delete this item?", export: "Export", import: "Import",
      customize: "Customize", done: "Done", hide: "Hide", bigger: "Wider", smaller: "Narrower", moveUp: "Move earlier", moveDown: "Move later"
    },
    vi: {
      morning: "Chào buổi sáng", afternoon: "Chào buổi chiều", evening: "Chào buổi tối", night: "Chúc ngủ ngon",
      search: "Tìm kiếm trên web", links: "Liên kết nhanh", notes: "Ghi chú", timer: "Tập trung", bookmarks: "Dấu trang",
      calendar: "Lịch", quote: "Trích dẫn hôm nay", weather: "Thời tiết", clock: "Đồng hồ",
      add: "Thêm", edit: "Sửa", del: "Xoá", save: "Lưu", cancel: "Huỷ", title: "Tiêu đề", url: "URL",
      group: "Nhóm", icon: "Biểu tượng (emoji hoặc chữ)", invalidUrl: "Vui lòng nhập URL http(s) hợp lệ.",
      newNote: "Ghi chú mới", pin: "Ghim", unpin: "Bỏ ghim", searchNotes: "Tìm ghi chú", searchLinks: "Lọc liên kết",
      created: "Tạo", modified: "Sửa", chars: "ký tự", empty: "Chưa có gì.",
      work: "Làm việc", short: "Nghỉ ngắn", long: "Nghỉ dài", start: "Bắt đầu", pause: "Tạm dừng", resume: "Tiếp tục", reset: "Đặt lại", skip: "Bỏ qua",
      sessions: "phiên hôm nay", grantBookmarks: "Cho phép truy cập dấu trang", bmNeed: "Cobble cần quyền đọc dấu trang của trình duyệt.",
      searchBookmarks: "Tìm dấu trang", back: "Quay lại", newFolder: "Thư mục mới", folderEmpty: "Thư mục trống.",
      settings: "Cài đặt", openDashboard: "Mở bảng điều khiển", quickNote: "Ghi chú nhanh", noteSaved: "Đã lưu",
      weatherOff: "Đặt thành phố trong Cài đặt để xem thời tiết.", weatherErr: "Dịch vụ thời tiết hiện không khả dụng.",
      saveFailed: "Không thể lưu", confirmDelete: "Xoá mục này?", export: "Xuất", import: "Nhập",
      customize: "Tuỳ chỉnh", done: "Xong", hide: "Ẩn", bigger: "Rộng hơn", smaller: "Hẹp hơn", moveUp: "Lên trước", moveDown: "Xuống sau"
    }
  };
  Object.assign(STR.en, {
    show: "Show", hidden: "Hidden", addTab: "Add this tab to links", added: "Added", searchPlaceholder: "Search or type a URL",
    profile: "Profile", yourName: "Your name", language: "Language", appearance: "Appearance", theme: "Theme",
    system: "System", light: "Light", dark: "Dark", palette: "Palette", customColors: "Custom colors", resetColors: "Reset colors",
    c_primary: "Primary", c_accent: "Accent", c_background: "Background", c_surface: "Cards", c_text: "Text", c_border: "Borders",
    font: "Font", f_serif: "Serif", f_sans: "Sans", f_rounded: "Rounded", f_mono: "Mono",
    fontSize: "Text size", fontWeight: "Text weight", lineHeight: "Line height",
    layout: "Layout", width: "Page width", columns: "Columns", spacing: "Spacing", searchPosition: "Search bar",
    top: "Top", bottom: "Bottom", none: "Hidden", widgets: "Widgets", clock24: "24-hour clock", showSeconds: "Show seconds",
    showDate: "Show date", dateFormat: "Date format", d_long: "Long", d_short: "Short", d_iso: "ISO (2026-01-31)",
    timezone: "Timezone for clock widget", tzLocal: "Local time", engine: "Default engine", customEngines: "Custom engines",
    engineName: "Name", engineUrl: "URL with %s for the query", needS: "The URL must contain %s.",
    background: "Background", b_solid: "Solid color", b_gradient: "Gradient", b_image: "Image link", b_upload: "Uploaded image",
    imageUrl: "Image URL", upload: "Upload image", blur: "Blur", overlay: "Dim", position: "Position",
    city: "City", findCity: "Find", cityNotFound: "City not found.", unit: "Unit", celsius: "Celsius", fahrenheit: "Fahrenheit",
    timerSettings: "Focus timer", workMin: "Work (min)", shortMin: "Short break (min)", longMin: "Long break (min)",
    every: "Long break every", notify: "Notify when a session ends", data: "Your data",
    exportHint: "Download everything as a JSON file, or restore a previous export.", resetAll: "Reset everything",
    confirmReset: "Erase all Cobble data? This cannot be undone.", imported: "Import complete", importBad: "That file is not a Cobble export.",
    savedAuto: "Changes save automatically.", tooBig: "Image must be under 8 MB."
  });
  Object.assign(STR.vi, {
    show: "Hiện", hidden: "Đã ẩn", addTab: "Thêm tab này vào liên kết", added: "Đã thêm", searchPlaceholder: "Tìm kiếm hoặc nhập URL",
    profile: "Hồ sơ", yourName: "Tên của bạn", language: "Ngôn ngữ", appearance: "Giao diện", theme: "Chủ đề",
    system: "Theo hệ thống", light: "Sáng", dark: "Tối", palette: "Bảng màu", customColors: "Màu tuỳ chỉnh", resetColors: "Đặt lại màu",
    c_primary: "Chính", c_accent: "Nhấn", c_background: "Nền", c_surface: "Thẻ", c_text: "Chữ", c_border: "Viền",
    font: "Phông chữ", f_serif: "Có chân", f_sans: "Không chân", f_rounded: "Bo tròn", f_mono: "Đơn cách",
    fontSize: "Cỡ chữ", fontWeight: "Độ đậm", lineHeight: "Giãn dòng",
    layout: "Bố cục", width: "Độ rộng trang", columns: "Số cột", spacing: "Khoảng cách", searchPosition: "Thanh tìm kiếm",
    top: "Trên", bottom: "Dưới", none: "Ẩn", widgets: "Tiện ích", clock24: "Đồng hồ 24 giờ", showSeconds: "Hiện giây",
    showDate: "Hiện ngày", dateFormat: "Định dạng ngày", d_long: "Dài", d_short: "Ngắn", d_iso: "ISO (2026-01-31)",
    timezone: "Múi giờ cho tiện ích đồng hồ", tzLocal: "Giờ địa phương", engine: "Công cụ mặc định", customEngines: "Công cụ tuỳ chỉnh",
    engineName: "Tên", engineUrl: "URL có %s cho từ khoá", needS: "URL phải chứa %s.",
    background: "Hình nền", b_solid: "Màu đơn", b_gradient: "Chuyển màu", b_image: "Liên kết ảnh", b_upload: "Ảnh tải lên",
    imageUrl: "URL ảnh", upload: "Tải ảnh lên", blur: "Làm mờ", overlay: "Làm tối", position: "Vị trí",
    city: "Thành phố", findCity: "Tìm", cityNotFound: "Không tìm thấy thành phố.", unit: "Đơn vị", celsius: "Độ C", fahrenheit: "Độ F",
    timerSettings: "Hẹn giờ tập trung", workMin: "Làm việc (phút)", shortMin: "Nghỉ ngắn (phút)", longMin: "Nghỉ dài (phút)",
    every: "Nghỉ dài sau mỗi", notify: "Thông báo khi hết phiên", data: "Dữ liệu của bạn",
    exportHint: "Tải toàn bộ dữ liệu dưới dạng tệp JSON, hoặc khôi phục từ bản đã xuất.", resetAll: "Xoá tất cả",
    confirmReset: "Xoá toàn bộ dữ liệu Cobble? Không thể hoàn tác.", imported: "Đã nhập xong", importBad: "Tệp này không phải bản xuất của Cobble.",
    savedAuto: "Thay đổi được lưu tự động.", tooBig: "Ảnh phải nhỏ hơn 8 MB."
  });
  let lang = "en";
  function t(k) { return (STR[lang] && STR[lang][k]) || STR.en[k] || k; }

  /* Theme */
  const PALETTES = {
    stone: { light: { primary: "#3a3733", accent: "#8a7f6f", background: "#f5f2ec", surface: "#fbfaf7", text: "#2a2825", border: "#e2ddd3" },
             dark: { primary: "#e8e3da", accent: "#b3a690", background: "#1d1c1a", surface: "#262522", text: "#ece8e1", border: "#3a3834" } },
    moss: { light: { primary: "#3c4a3a", accent: "#7d8f6a", background: "#f1f2ec", surface: "#f9faf6", text: "#262b24", border: "#dde0d4" },
            dark: { primary: "#dfe6d6", accent: "#9fb187", background: "#191c18", surface: "#222620", text: "#e6ebe0", border: "#353a32" } },
    clay: { light: { primary: "#5a3d30", accent: "#b07a5c", background: "#f6efe9", surface: "#fcf8f5", text: "#2f2420", border: "#e8dbd1" },
            dark: { primary: "#f0ddd2", accent: "#d39a7a", background: "#1e1917", surface: "#28211e", text: "#efe4dd", border: "#3d3330" } },
    slate: { light: { primary: "#2f3a44", accent: "#6f8293", background: "#eef1f3", surface: "#f8fafb", text: "#22292f", border: "#d8dee3" },
             dark: { primary: "#dbe3ea", accent: "#93a8ba", background: "#171b1e", surface: "#20252a", text: "#e4e9ed", border: "#323a41" } }
  };
  const FONTS = {
    serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
    sans: "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', sans-serif",
    rounded: "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif",
    mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
  };
  function isDark(s) { return s.theme === "dark" || (s.theme === "system" && g.matchMedia("(prefers-color-scheme: dark)").matches); }
  function applyTheme(s) {
    lang = s.language || "en";
    document.documentElement.lang = lang;
    const mode = isDark(s) ? "dark" : "light";
    const base = (PALETTES[s.palette] || PALETTES.stone)[mode];
    const c = Object.assign({}, base, (s.colors && s.colors[mode]) || {});
    const r = document.documentElement.style;
    for (const k in c) r.setProperty("--c-" + k, c[k]);
    r.setProperty("--font", FONTS[s.font] || FONTS.serif);
    r.setProperty("--fs", s.fontSize + "px");
    r.setProperty("--fw", s.fontWeight);
    r.setProperty("--lh", s.lineHeight);
    r.setProperty("--width", s.width + "px");
    r.setProperty("--cols", s.columns);
    r.setProperty("--gap", s.spacing + "px");
    document.documentElement.dataset.mode = mode;
  }

  /* DOM helpers — never use innerHTML with user data */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
    return n;
  }
  function validUrl(u) {
    try { const x = new URL(u.trim()); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
  }
  function normalizeUrl(u) { u = (u || "").trim(); if (u && !/^[a-z]+:\/\//i.test(u)) u = "https://" + u; return validUrl(u); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toast(msg, err) {
    if (typeof document === "undefined") { console.warn("[cobble]", msg); return; }
    let box = document.getElementById("toasts");
    if (!box) { box = el("div", { id: "toasts", role: "status", "aria-live": "polite" }); document.body.append(box); }
    const n = el("div", { class: "toast" + (err ? " err" : ""), text: msg });
    box.append(n); setTimeout(() => n.remove(), 3200);
  }
  function download(name, data) {
    const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function fmtDate(ts) { return new Date(ts).toLocaleString(lang === "vi" ? "vi-VN" : undefined, { dateStyle: "medium", timeStyle: "short" }); }

  /* Timer logic shared by pages & background */
  const timer = {
    dur(s, phase) { return (phase === "work" ? s.timer.work : phase === "short" ? s.timer.short : s.timer.long) * 60000; },
    left(st) { return st.running ? Math.max(0, st.endsAt - Date.now()) : st.remaining; },
    async start() {
      const st = await store.get("timerState");
      if (st.running) return;
      st.running = true; st.endsAt = Date.now() + st.remaining;
      await store.set("timerState", st);
      api.alarms.create("cobble-timer", { when: st.endsAt });
    },
    async pause() {
      const st = await store.get("timerState");
      if (!st.running) return;
      st.remaining = Math.max(0, st.endsAt - Date.now()); st.running = false;
      await store.set("timerState", st); api.alarms.clear("cobble-timer");
    },
    async reset(phase) {
      const s = await store.get("settings"); const st = await store.get("timerState");
      st.phase = phase || st.phase; st.running = false; st.remaining = timer.dur(s, st.phase);
      await store.set("timerState", st); api.alarms.clear("cobble-timer");
    },
    // advance to next phase; returns new state
    async complete(countIt) {
      const s = await store.get("settings"); const st = await store.get("timerState");
      const day = new Date().toDateString();
      if (st.today !== day) { st.today = day; st.todayCount = 0; }
      const was = st.phase;
      if (was === "work") {
        if (countIt) { st.completed++; st.todayCount++; }
        st.phase = st.completed > 0 && st.completed % s.timer.every === 0 ? "long" : "short";
      } else st.phase = "work";
      st.running = false; st.remaining = timer.dur(s, st.phase);
      await store.set("timerState", st); api.alarms.clear("cobble-timer");
      return { st, was, s };
    }
  };

  /* Backgrounds */
  const GRADIENTS = [
    "linear-gradient(160deg, #e9e4da 0%, #c9bfae 100%)",
    "linear-gradient(160deg, #dfe5d6 0%, #9fb187 100%)",
    "linear-gradient(160deg, #f3e2d6 0%, #c98f6e 100%)",
    "linear-gradient(160deg, #dde4ea 0%, #7f93a5 100%)",
    "linear-gradient(160deg, #2b2a27 0%, #4a443b 100%)",
    "radial-gradient(circle at 30% 20%, #efe8dc 0%, #b8ab96 70%, #8a7f6f 100%)"
  ];
  let bgUrl = null;
  async function applyBackground(s) {
    const bg = document.getElementById("bg"), ov = document.getElementById("overlay");
    if (!bg) return;
    const b = s.background || {};
    if (bgUrl) { URL.revokeObjectURL(bgUrl); bgUrl = null; }
    bg.style.backgroundImage = ""; bg.style.backgroundColor = ""; bg.style.filter = ""; bg.style.inset = "0";
    let layered = false;
    if (b.type === "solid" && b.value) bg.style.backgroundColor = b.value;
    else if (b.type === "gradient" && b.value) { bg.style.backgroundImage = b.value; layered = true; }
    else if (b.type === "image" && validUrl(b.value || "")) { bg.style.backgroundImage = 'url("' + validUrl(b.value).replace(/"/g, "%22") + '")'; layered = true; }
    else if (b.type === "upload") {
      try { const blob = await idb.get("wallpaper"); if (blob) { bgUrl = URL.createObjectURL(blob); bg.style.backgroundImage = 'url("' + bgUrl + '")'; layered = true; } } catch (e) { console.warn(e); }
    }
    bg.style.backgroundPosition = b.position || "center";
    if (layered && b.blur > 0) { bg.style.filter = "blur(" + b.blur + "px)"; bg.style.inset = -b.blur * 2 + "px"; }
    if (ov) ov.style.opacity = layered ? String(b.overlay ?? 0) : "0";
    document.documentElement.classList.toggle("has-wall", layered);
  }

  g.Cobble = { api, isFirefox, P, store, idb, DEFAULTS, t, setLang: (l) => (lang = l), get lang() { return lang; }, STR, PALETTES, FONTS, GRADIENTS, applyTheme, applyBackground, isDark, el, validUrl, normalizeUrl, uid, toast, download, fmtDate, timer, merge, clone };
})(typeof self !== "undefined" ? self : window);
