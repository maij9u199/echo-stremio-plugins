/**
 * @name Stream Finder
 * @description Search box, quality and audio toggles, and a drag-to-resize handle for the streams sidebar.
 * @version 1.0.3
 * @author Echo
 */
(function () {
  if (window.__sfLoaded) return; // never run twice
  window.__sfLoaded = true;

  const UI_ID = "stream-finder-ui";
  const LIST_SEL = '[class*="streams-container"]';
  const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

  const LANG_NAMES = {
    GB: "English", US: "English", ES: "Spanish", MX: "Latino", RU: "Russian",
    JP: "Japanese", IT: "Italian", PT: "Portuguese", BR: "Brazilian", FR: "French",
    DE: "German", IN: "Hindi", UA: "Ukrainian", PL: "Polish", CN: "Chinese",
    TW: "Chinese", KR: "Korean", NL: "Dutch", TR: "Turkish", SA: "Arabic",
    GR: "Greek", CZ: "Czech", HU: "Hungarian", RO: "Romanian", SE: "Swedish",
    NO: "Norwegian", DK: "Danish", FI: "Finnish", IL: "Hebrew", TH: "Thai",
    VN: "Vietnamese", ID: "Indonesian", BG: "Bulgarian", HR: "Croatian",
    RS: "Serbian", SK: "Slovak", SI: "Slovenian", LT: "Lithuanian",
    LV: "Latvian", EE: "Estonian"
  };

  const RES_CHIPS = [["4k", "4K"], ["1080p", "1080p"], ["720p", "720p"], ["480p", "480p"]];
  const FEAT_CHIPS = [["hdr", "HDR"], ["dv", "Dolby Vision"]];

  // Rows are hidden with a class (not inline styles), so another script resetting
  // row.style.display can't undo the filter. Leftovers from StreamSearch (this
  // plugin's earlier, unreleased name) are hidden too.
  (function addStyles() {
    const st = document.createElement("style");
    st.id = "stream-finder-styles";
    st.textContent =
      ".sf-hidden { display: none !important; }" +
      "#stream-search-box, #stream-resize-handle { display: none !important; }";
    document.head.appendChild(st);
  })();

  const state = { q: "", res: new Set(), feat: new Set(), langs: new Set() };
  let lastSig = null;
  let queued = false;

  function flagToCode(flag) {
    return [...flag].map((c) => String.fromCharCode(c.codePointAt(0) - 0x1f1e6 + 65)).join("");
  }
  function codeToFlag(code) {
    return String.fromCodePoint(...[...code].map((c) => c.charCodeAt(0) - 65 + 0x1f1e6));
  }

  function info(row) {
    const raw = row.textContent || "";
    const t = raw.toLowerCase();
    let res = "other";
    if (/\b(4k|2160p|uhd)\b/.test(t)) res = "4k";
    else if (/\b1080p\b/.test(t)) res = "1080p";
    else if (/\b720p\b/.test(t)) res = "720p";
    else if (/\b480p\b/.test(t)) res = "480p";
    const hdr = /\bhdr(10)?\b/.test(t);
    const dv = /\b(dv|dolby[\s._-]*vision)\b/.test(t);
    const multi = /\b(multi|dual)[\s._-]*audio\b/.test(t);
    const codes = [...new Set((raw.match(FLAG_RE) || []).map(flagToCode))];
    const names = codes.map((c) => LANG_NAMES[c] || c).join(" ").toLowerCase();
    return { res, hdr, dv, multi, codes, text: t + " " + names };
  }

  function applyFilter(list) {
    const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    Array.from(list.children).forEach((row) => {
      const i = info(row);
      let ok = terms.every((t) => i.text.includes(t));
      if (ok && state.res.size) ok = state.res.has(i.res);
      if (ok && state.feat.has("hdr")) ok = i.hdr;
      if (ok && state.feat.has("dv")) ok = i.dv;
      if (ok && state.langs.size) {
        ok = [...state.langs].some((l) => (l === "multi" ? i.multi : i.codes.includes(l)));
      }
      row.classList.toggle("sf-hidden", !ok);
    });
  }

  function styleChip(b) {
    const on = state[b.dataset.group].has(b.dataset.key);
    b.style.cssText =
      "display:inline-block;flex:none;white-space:nowrap;line-height:1.2;cursor:pointer;" +
      "padding:6px 12px;border-radius:999px;font-size:13px;" +
      "border:1px solid " + (on ? "#7b5bf5" : "rgba(255,255,255,0.2)") + ";" +
      "background:" + (on ? "#7b5bf5" : "rgba(255,255,255,0.06)") + ";color:#fff;";
  }

  function refresh() {
    const ui = document.getElementById(UI_ID);
    if (ui) ui.querySelectorAll("button[data-group]").forEach(styleChip);
    const list = document.querySelector(LIST_SEL);
    if (list) applyFilter(list);
  }

  function makeChip(group, key, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.group = group;
    b.dataset.key = key;
    b.textContent = label;
    styleChip(b);
    b.addEventListener("click", () => {
      const set = state[group];
      if (set.has(key)) set.delete(key);
      else set.add(key);
      refresh();
    });
    return b;
  }

  function makeRow(labelText) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;flex:none;flex-wrap:wrap;align-items:center;gap:8px;" +
      "height:auto;min-height:max-content;margin:0 0 10px;";
    const label = document.createElement("span");
    label.textContent = labelText;
    label.style.cssText = "flex:none;color:rgba(255,255,255,0.6);font-size:13px;min-width:56px;";
    row.appendChild(label);
    return row;
  }

  function buildUI() {
    state.q = "";
    state.res.clear();
    state.feat.clear();
    state.langs.clear();
    lastSig = null;

    const ui = document.createElement("div");
    ui.id = UI_ID;
    ui.style.cssText =
      "display:block;flex:none;width:100%;box-sizing:border-box;height:auto;" +
      "min-height:max-content;overflow:visible;position:relative;z-index:2;" +
      "margin:8px 0 16px;padding:0 16px;";

    // keep Stremio shortcuts from firing while typing or clicking here
    ["keydown", "keyup", "keypress"].forEach((evt) =>
      ui.addEventListener(evt, (e) => e.stopPropagation())
    );

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search streams (e.g. wolfman remux)";
    input.style.cssText =
      "display:block;flex:none;width:100%;height:44px;box-sizing:border-box;margin:0 0 12px;" +
      "padding:0 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);" +
      "background:rgba(255,255,255,0.08);color:#fff;font-size:15px;line-height:44px;outline:none;";
    input.addEventListener("input", () => {
      state.q = input.value;
      refresh();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        input.value = "";
        state.q = "";
        refresh();
      }
    });
    ui.appendChild(input);

    const qualRow = makeRow("Quality");
    RES_CHIPS.forEach(([k, l]) => qualRow.appendChild(makeChip("res", k, l)));
    FEAT_CHIPS.forEach(([k, l]) => qualRow.appendChild(makeChip("feat", k, l)));
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear all";
    clear.style.cssText =
      "display:inline-block;flex:none;white-space:nowrap;cursor:pointer;padding:6px 12px;" +
      "font-size:13px;border:none;background:transparent;color:rgba(255,255,255,0.6);" +
      "text-decoration:underline;";
    clear.addEventListener("click", () => {
      state.q = "";
      state.res.clear();
      state.feat.clear();
      state.langs.clear();
      input.value = "";
      refresh();
    });
    qualRow.appendChild(clear);
    ui.appendChild(qualRow);

    const langRow = makeRow("Audio");
    langRow.dataset.role = "lang-row";
    ui.appendChild(langRow);

    return ui;
  }

  // build language chips from the flags found in the current list
  function syncLangChips(ui, list) {
    const counts = new Map();
    let multiCount = 0;
    Array.from(list.children).forEach((row) => {
      const i = info(row);
      if (i.multi) multiCount++;
      i.codes.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const sig = multiCount + "|" + sorted.map(([c, n]) => c + n).join(",");
    if (sig === lastSig) return;
    lastSig = sig;

    // drop selections that no longer exist in this list
    [...state.langs].forEach((l) => {
      const exists = l === "multi" ? multiCount > 0 : counts.has(l);
      if (!exists) state.langs.delete(l);
    });

    const langRow = ui.querySelector('[data-role="lang-row"]');
    // keep the label, remove old chips
    Array.from(langRow.querySelectorAll("button")).forEach((b) => b.remove());
    if (multiCount > 0) {
      langRow.appendChild(makeChip("langs", "multi", "Multi/Dual Audio (" + multiCount + ")"));
    }
    sorted.forEach(([code, n]) => {
      const name = LANG_NAMES[code] || code;
      langRow.appendChild(makeChip("langs", code, codeToFlag(code) + " " + name + " (" + n + ")"));
    });
  }

  // ---------- draggable sidebar resize ----------
  const SIDEBAR_SEL = '[class*="streams-list-container"]';
  const HANDLE_ID = "stream-finder-resize";
  const WIDTH_KEY = "streamfinder.sidebarWidth";
  const OLD_WIDTH_KEY = "streamsearch.sidebarWidth";
  const MIN_W = 320;
  let dragging = false;

  // The sidebar only has a "width" when Stremio lays it out beside the movie info (a row).
  // In narrow windows Stremio stacks it underneath (a column) and flex-basis would become
  // its HEIGHT, so the override must stay off there.
  function isRowLayout(side) {
    const p = side.parentElement;
    if (!p) return false;
    const cs = getComputedStyle(p);
    return cs.display.indexOf("flex") !== -1 && cs.flexDirection.indexOf("row") === 0;
  }
  function clampW(w, side) {
    const p = side && side.parentElement;
    const room = p ? p.getBoundingClientRect().width : window.innerWidth;
    const max = Math.max(MIN_W, Math.floor(room - 280)); // always leave room for the movie info
    return Math.min(max, Math.max(MIN_W, w));
  }
  function savedWidth() {
    try {
      const v = parseInt(localStorage.getItem(WIDTH_KEY) || localStorage.getItem(OLD_WIDTH_KEY), 10);
      return v > 0 ? v : null;
    } catch (e) {
      return null;
    }
  }
  function saveWidth(w) {
    try {
      localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
      // Keep a leftover copy of the old StreamSearch plugin (if any) on the same width.
      localStorage.setItem(OLD_WIDTH_KEY, String(Math.round(w)));
    } catch (e) {}
  }
  function clearSaved() {
    try {
      localStorage.removeItem(WIDTH_KEY);
      localStorage.removeItem(OLD_WIDTH_KEY);
    } catch (e) {}
  }
  function setWidth(side, w) {
    side.style.setProperty("flex", "0 0 " + clampW(w, side) + "px", "important");
  }
  function clearWidth(side) {
    side.style.removeProperty("flex");
  }

  function ensureResize() {
    const side = document.querySelector(SIDEBAR_SEL);
    if (!side) return;
    if (getComputedStyle(side).position === "static") side.style.position = "relative";

    let handle = side.querySelector("#" + HANDLE_ID);
    if (!handle) {
      handle = document.createElement("div");
      handle.id = HANDLE_ID;
      handle.title = "Drag to resize (double-click to reset)";
      handle.style.cssText =
        "position:absolute;left:0;top:0;bottom:0;width:8px;cursor:col-resize;" +
        "z-index:20;background:transparent;touch-action:none;transition:background 0.15s;";
      handle.addEventListener("mouseenter", () => {
        handle.style.background = "rgba(123,91,245,0.55)";
      });
      handle.addEventListener("mouseleave", () => {
        if (!dragging) handle.style.background = "transparent";
      });

      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sideEl = handle.parentElement;
        if (!sideEl) return;
        dragging = true;
        const startX = e.clientX;
        const startW = sideEl.getBoundingClientRect().width;
        handle.setPointerCapture(e.pointerId);
        handle.style.background = "rgba(123,91,245,0.8)";
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";

        const move = (ev) => setWidth(sideEl, startW + (startX - ev.clientX));
        const up = (ev) => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
          try { handle.releasePointerCapture(ev.pointerId); } catch (err) {}
          document.body.style.userSelect = "";
          document.body.style.cursor = "";
          handle.style.background = "transparent";
          dragging = false;
          saveWidth(sideEl.getBoundingClientRect().width);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      });

      handle.addEventListener("dblclick", () => {
        const sideEl = handle.parentElement;
        if (sideEl) sideEl.style.removeProperty("flex");
        clearSaved();
      });

      side.appendChild(handle);
    }

    // Side-by-side layout: show the handle and apply the saved width.
    // Stacked layout (narrow window): hide the handle and leave Stremio's own sizing alone.
    const row = isRowLayout(side);
    handle.style.display = row ? "" : "none";
    if (!row) {
      clearWidth(side);
      return;
    }
    const w = savedWidth();
    if (w && !dragging) setWidth(side, w);
  }

  window.addEventListener("resize", () => {
    if (!dragging) ensureResize();
  });

  function ensureUI() {
    ensureResize();
    const list = document.querySelector(LIST_SEL);
    if (!list || !list.parentElement) return;
    let ui = document.getElementById(UI_ID);
    // Fine as long as it sits in the same container, anywhere above the list.
    const placed =
      ui && ui.parentElement === list.parentElement && !!(ui.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!placed) {
      if (ui) ui.remove();
      ui = buildUI();
      list.parentElement.insertBefore(ui, list);
    }
    const notices = [];
    if (document.getElementById("stream-search-box")) {
      notices.push(["old", "Old StreamSearch plugin detected. Delete StreamSearch.plugin.js from your plugins folder."]);
    }
    notices.forEach(([key, text]) => {
      if (ui.querySelector('[data-sf-note="' + key + '"]')) return;
      console.warn("[Stream Finder] " + text);
      const note = document.createElement("div");
      note.setAttribute("data-sf-note", key);
      note.textContent = text;
      note.style.cssText = "margin:0 0 10px;padding:8px 12px;border-radius:8px;font-size:12px;color:#ffd9a0;background:rgba(255,181,71,0.15);";
      ui.insertBefore(note, ui.firstChild);
    });
    syncLangChips(ui, list);
    applyFilter(list);
  }

  console.log("[Stream Finder] v1.0.3 loaded");

  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      ensureUI();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ensureUI(); // run once now, in case the streams list is already on screen
})();
