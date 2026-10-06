/**
 * @name Addon Organizer
 * @description Drag and drop your addons into the order you want. Also rename addons and show or hide their catalogs.
 * @version 1.0.2
 * @author Echo
 *
 * Inspired by "Stremio Addon Manager" by Zcc09 (github.com/Zcc09/stremio-addon-manager-plugin).
 * This is a separate implementation with its own drag-and-drop engine and interface. It can
 * read that plugin's saved renames/hidden catalogs so users can switch over without losing them.
 */
(function () {
  "use strict";
  if (window.__aoLoaded) return;
  window.__aoLoaded = true;

  // ---------------------------------------------------------------------------
  // Constants and state
  // ---------------------------------------------------------------------------
  const API = "https://api.strem.io/api/";
  const CONFIG_KEY = "addon-organizer-config";
  // Settings saved by the older "Stremio Addon Manager" plugin are picked up too.
  const LEGACY_CONFIG_KEY = "stremio-addon-manager-custom-config";
  const RES_LABELS = {
    catalog: "Catalogs",
    stream: "Streams",
    subtitles: "Subtitles",
    meta: "Metadata",
    addon_catalog: "Addon lists",
  };

  const state = {
    auth: "",
    items: [], // [{ id, raw, manifest, base, edited, resetPending }]
    snapshot: "",
    open: false,
    loading: false,
    saving: false,
  };

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function icon(name) {
    const stroke = (d) =>
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      d +
      "</svg>";
    switch (name) {
      case "grip":
        return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';
      case "up":
        return stroke('<path d="M6 15l6-6 6 6"/>');
      case "down":
        return stroke('<path d="M6 9l6 6 6-6"/>');
      case "sliders":
        return stroke('<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>');
      case "trash":
        return stroke('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>');
      case "close":
        return stroke('<path d="M6 6l12 12M18 6L6 18"/>');
      case "reorder":
        return stroke('<path d="M7 20V4M7 4L4 7M7 4l3 3M17 4v16M17 20l-3-3M17 20l3-3"/>');
      default:
        return "";
    }
  }

  function getAuthKey() {
    try {
      const profile = JSON.parse(localStorage.getItem("profile"));
      return (profile && profile.auth && profile.auth.key) || "";
    } catch (e) {
      return "";
    }
  }

  function readCfg() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY) || localStorage.getItem(LEGACY_CONFIG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeCfg(cfg) {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    } catch (e) {
      console.error("[Addon Organizer] could not save settings", e);
    }
  }

  async function api(method, payload) {
    // No Content-Type header on purpose. It keeps this a "simple" request, so the
    // browser skips the CORS preflight that api.strem.io would not answer.
    const resp = await fetch(API + method, { method: "POST", body: JSON.stringify(payload) });
    return resp.json();
  }

  async function fetchBaseManifest(transportUrl) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const url = transportUrl.endsWith("/manifest.json")
        ? transportUrl
        : transportUrl.replace(/\/$/, "") + "/manifest.json";
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      return data.manifest || data;
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  const isSearchCatalog = (c) =>
    (c.id && String(c.id).includes("search")) || (Array.isArray(c.extra) && c.extra.some((e) => e && e.name === "search"));

  function resourceTags(m) {
    const names = new Set(
      (m.resources || []).map((r) => (typeof r === "string" ? r : r && r.name)).filter(Boolean)
    );
    if (!names.size && m.catalogs && m.catalogs.length) names.add("catalog");
    return [...names].map((n) => RES_LABELS[n] || n);
  }

  function cfgOf(it) {
    const m = it.manifest;
    return {
      name: m.name,
      description: m.description,
      logo: m.logo,
      background: m.background,
      catalogs: (m.catalogs || []).map((c) => ({ id: c.id, type: c.type, name: c.name, hidden: !!c.hidden })),
    };
  }

  function applySaved(m, saved) {
    if (saved.name) m.name = saved.name;
    ["description", "logo", "background"].forEach((k) => {
      if (typeof saved[k] === "string" && saved[k]) m[k] = saved[k];
    });
    if (Array.isArray(m.catalogs) && Array.isArray(saved.catalogs)) {
      m.catalogs.forEach((c) => {
        const s = saved.catalogs.find((x) => x.id === c.id && x.type === c.type);
        if (s) {
          if (s.name) c.name = s.name;
          c.hidden = !!s.hidden;
        }
      });
    }
  }

  function signature() {
    return JSON.stringify(state.items.map((it) => [it.id, it.edited ? cfgOf(it) : null, it.resetPending ? 1 : 0]));
  }
  const isDirty = () => state.items.length > 0 && signature() !== state.snapshot;

  // ---------------------------------------------------------------------------
  // Loading and saving
  // ---------------------------------------------------------------------------
  async function loadAddons() {
    const data = await api("addonCollectionGet", {
      type: "AddonCollectionGet",
      authKey: state.auth,
      update: true,
    });
    if (!data.result || !Array.isArray(data.result.addons)) {
      throw new Error("Could not read your addon list. Try logging out and back in.");
    }
    const addons = data.result.addons;
    const cfg = readCfg();
    const bases = await Promise.all(addons.map((a) => fetchBaseManifest(a.transportUrl)));

    state.items = addons.map((a, i) => {
      const base = bases[i] || a.manifest || { name: a.transportUrl };
      const manifest = clone(base);
      const saved = cfg[a.transportUrl];
      if (saved) applySaved(manifest, saved);
      return { id: a.transportUrl, raw: a, manifest, base: clone(base), edited: !!saved, resetPending: false };
    });
    state.snapshot = signature();
  }

  async function saveChanges() {
    if (state.saving || !isDirty()) return;
    state.saving = true;
    refreshFooter();
    try {
      const payload = state.items.map((it) => {
        const addon = clone(it.raw);
        if (it.edited || it.resetPending) {
          const m = clone(it.edited ? it.manifest : it.base);
          if (Array.isArray(m.catalogs)) {
            m.catalogs = m.catalogs
              .filter((c) => !c.hidden)
              .map((c) => {
                const copy = Object.assign({}, c);
                delete copy.hidden;
                return copy;
              });
          }
          addon.manifest = m;
        }
        return addon;
      });

      const data = await api("addonCollectionSet", {
        type: "AddonCollectionSet",
        authKey: state.auth,
        addons: payload,
      });
      if (!data.result || !data.result.success) {
        throw new Error((data.result && data.result.error) || (data.error && data.error.message) || "Stremio rejected the update.");
      }

      const newCfg = {};
      state.items.forEach((it) => {
        if (it.edited) newCfg[it.id] = cfgOf(it);
      });
      writeCfg(newCfg);
      toast("Saved. Reloading Stremio...", "ok");
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      console.error("[Addon Organizer] save failed", e);
      state.saving = false;
      toast("Save failed: " + (e && e.message ? e.message : "unknown error"), "err");
      refreshFooter();
    }
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  function ensureStyles() {
    if (document.getElementById("ao-styles")) return;
    const style = document.createElement("style");
    style.id = "ao-styles";
    style.textContent = `
      .ao-overlay, .ao-overlay * { font-size: inherit; line-height: inherit; font-family: inherit; box-sizing: border-box; }
      .ao-overlay {
        position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center;
        padding: 24px; background: rgba(6, 5, 12, 0.72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        color: #f2f1f7; font-size: 14px; line-height: 1.4; opacity: 0; pointer-events: none; transition: opacity .18s ease;
      }
      .ao-overlay.ao-visible { opacity: 1; pointer-events: auto; }
      .ao-modal {
        width: 100%; max-width: 720px; max-height: 100%; display: flex; flex-direction: column; overflow: hidden;
        background: #14131d; border: 1px solid rgba(255,255,255,0.09); border-radius: 18px;
        box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(123,91,245,0.12);
        transform: translateY(8px) scale(.985); transition: transform .2s ease;
      }
      .ao-visible .ao-modal { transform: none; }
      .ao-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 22px 24px 16px; flex: none; }
      .ao-title { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
      .ao-sub { margin: 4px 0 0; color: #9d9bb0; font-size: 13px; }
      .ao-body { flex: 1 1 auto; overflow-y: auto; padding: 10px 16px 12px; min-height: 120px; }
      .ao-body::-webkit-scrollbar { width: 8px; }
      .ao-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 8px; }
      .ao-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }

      .ao-row {
        position: relative; border-radius: 14px; background: rgba(255,255,255,0.045);
        border: 1px solid rgba(255,255,255,0.06); transition: background .15s ease, border-color .15s ease;
      }
      .ao-row:hover { background: rgba(255,255,255,0.07); }
      .ao-row.ao-dragging {
        z-index: 5; background: #231f38; border-color: #7b5bf5; cursor: grabbing;
        box-shadow: 0 18px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(123,91,245,0.5); transition: none;
      }
      .ao-row.ao-flash { animation: ao-flash .7s ease; }
      @keyframes ao-flash { 0% { background: rgba(123,91,245,0.35); } 100% { background: rgba(255,255,255,0.045); } }
      .ao-main { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 6px; }
      .ao-grip {
        flex: none; width: 30px; height: 44px; display: flex; align-items: center; justify-content: center;
        color: #6f6d84; background: transparent; border: none; border-radius: 8px; cursor: grab; touch-action: none;
        padding: 0;
      }
      .ao-grip:hover { color: #cfc8ff; background: rgba(255,255,255,0.06); }
      .ao-grip svg { width: 18px; height: 18px; }
      .ao-num {
        flex: none; min-width: 26px; height: 26px; border-radius: 999px; display: flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; color: #c9bfff; background: rgba(123,91,245,0.18);
      }
      .ao-logo {
        flex: none; width: 44px; height: 44px; border-radius: 11px; overflow: hidden; display: flex; align-items: center; justify-content: center;
        background: rgba(255,255,255,0.07);
      }
      .ao-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
      .ao-initial { font-size: 18px; font-weight: 700; color: #cfc8ff; }
      .ao-info { flex: 1 1 auto; min-width: 0; }
      .ao-name { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ao-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
      .ao-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; color: #b9b6cf; background: rgba(255,255,255,0.07); }
      .ao-ver { font-size: 11px; color: #77748c; align-self: center; }
      .ao-actions { flex: none; display: flex; align-items: center; gap: 4px; }
      .ao-icon-btn {
        width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0;
        color: #b9b6cf; background: transparent; border: none; border-radius: 9px; cursor: pointer; transition: background .15s, color .15s;
      }
      .ao-icon-btn svg { width: 18px; height: 18px; }
      .ao-icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #fff; }
      .ao-icon-btn:disabled { opacity: .28; cursor: default; }
      .ao-icon-btn.ao-on { background: rgba(123,91,245,0.22); color: #d8d0ff; }
      .ao-icon-btn.ao-danger:hover:not(:disabled) { background: rgba(229,62,62,0.2); color: #ff8f8f; }
      .ao-icon-btn.ao-armed { width: auto; padding: 0 10px; background: #c62828; color: #fff; font-size: 12px; font-weight: 700; }

      .ao-edit { display: none; padding: 4px 16px 16px 62px; }
      .ao-open .ao-edit { display: block; }
      .ao-field { display: block; margin-bottom: 14px; }
      .ao-label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #9d9bb0; text-transform: uppercase; letter-spacing: .04em; }
      .ao-input {
        width: 100%; height: 38px; padding: 0 12px; color: #fff; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 9px; outline: none; font-size: 14px; -webkit-appearance: none; appearance: none;
      }
      .ao-input:focus { border-color: #7b5bf5; box-shadow: 0 0 0 3px rgba(123,91,245,0.25); }
      .ao-cat-head { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 8px; }
      .ao-link { background: none; border: none; padding: 4px 6px; color: #a794ff; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 6px; }
      .ao-link:hover { background: rgba(123,91,245,0.16); color: #d8d0ff; }
      .ao-cats { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; padding-right: 4px; }
      .ao-cat { display: flex; align-items: center; gap: 10px; }
      .ao-cat .ao-input { height: 34px; }
      .ao-badge { flex: none; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; color: #c9bfff; background: rgba(123,91,245,0.16); text-transform: capitalize; }
      .ao-badge-search { color: #ffd08a; background: rgba(255,170,60,0.15); }
      .ao-empty { color: #77748c; font-size: 13px; padding: 4px 0 8px; }
      .ao-edit-foot { margin-top: 12px; display: flex; justify-content: flex-end; }

      .ao-switch { flex: none; position: relative; width: 38px; height: 22px; display: inline-block; cursor: pointer; }
      .ao-switch input { position: absolute; opacity: 0; width: 0; height: 0; -webkit-appearance: none; appearance: none; }
      .ao-switch span { position: absolute; inset: 0; border-radius: 999px; background: rgba(255,255,255,0.16); transition: background .15s; }
      .ao-switch span::after {
        content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s;
      }
      .ao-switch input:checked + span { background: #7b5bf5; }
      .ao-switch input:checked + span::after { transform: translateX(16px); }

      .ao-foot {
        flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px;
        border-top: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.025);
      }
      .ao-status { display: flex; align-items: center; gap: 8px; color: #9d9bb0; font-size: 13px; }
      .ao-dot { width: 8px; height: 8px; border-radius: 50%; background: #4a485c; }
      .ao-dirty .ao-dot { background: #ffb547; box-shadow: 0 0 0 3px rgba(255,181,71,0.2); }
      .ao-dirty .ao-status { color: #ffd9a0; }
      .ao-btns { display: flex; gap: 8px; }
      .ao-btn {
        height: 38px; padding: 0 18px; border-radius: 10px; border: 1px solid transparent; font-size: 14px; font-weight: 700; cursor: pointer;
        transition: background .15s, opacity .15s, transform .1s;
      }
      .ao-btn:active:not(:disabled) { transform: translateY(1px); }
      .ao-btn.ao-ghost { color: #d4d2e6; background: rgba(255,255,255,0.07); }
      .ao-btn.ao-ghost:hover { background: rgba(255,255,255,0.12); }
      .ao-btn.ao-primary { color: #fff; background: #7b5bf5; }
      .ao-btn.ao-primary:hover:not(:disabled) { background: #8c70ff; }
      .ao-btn:disabled { opacity: .4; cursor: default; }

      .ao-skel { height: 64px; border-radius: 14px; background: linear-gradient(100deg, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 70%); background-size: 200% 100%; animation: ao-shimmer 1.2s linear infinite; }
      @keyframes ao-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
      .ao-msg { padding: 40px 16px; text-align: center; color: #9d9bb0; }
      .ao-msg .ao-btn { margin-top: 14px; }

      .ao-toast {
        position: absolute; left: 50%; bottom: 76px; transform: translate(-50%, 10px); max-width: 80%; padding: 10px 16px; border-radius: 10px;
        font-size: 13px; font-weight: 600; color: #fff; background: #2b2940; border: 1px solid rgba(255,255,255,0.12);
        opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s;
      }
      .ao-toast.ao-show { opacity: 1; transform: translate(-50%, 0); }
      .ao-toast.ao-ok { background: #1c5b3a; border-color: #2f9e63; }
      .ao-toast.ao-err { background: #6b2020; border-color: #c24444; }

      .ao-launcher {
        position: fixed; right: 22px; bottom: 22px; z-index: 9999; display: none; align-items: center; gap: 8px; height: 44px; padding: 0 18px 0 14px;
        color: #fff; background: #7b5bf5; border: none; border-radius: 999px; font-size: 14px; font-weight: 700; cursor: pointer;
        box-shadow: 0 8px 24px rgba(123,91,245,0.45); transition: transform .15s, background .15s;
      }
      .ao-launcher.ao-show { display: inline-flex; }
      .ao-launcher:hover { background: #8c70ff; transform: translateY(-1px); }
      .ao-launcher svg { width: 18px; height: 18px; }
      body.ao-noselect, body.ao-noselect * { user-select: none !important; -webkit-user-select: none !important; cursor: grabbing !important; }
      @media (max-width: 560px) {
        .ao-overlay { padding: 8px; }
        .ao-tags, .ao-num { display: none; }
        .ao-edit { padding-left: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Modal shell
  // ---------------------------------------------------------------------------
  let overlay = null;
  let toastTimer = 0;

  const $ = (sel) => overlay && overlay.querySelector(sel);

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.className = "ao-overlay";
    overlay.id = "ao-overlay";
    overlay.innerHTML = `
      <div class="ao-modal" role="dialog" aria-modal="true" aria-label="Addon Organizer">
        <div class="ao-head">
          <div>
            <h2 class="ao-title">Addon Organizer</h2>
            <p class="ao-sub">Drag the grip to reorder, or use the arrows. Addons higher up are used first.</p>
          </div>
          <button class="ao-icon-btn" data-top="close" title="Close">${icon("close")}</button>
        </div>
        <div class="ao-body" id="ao-body"></div>
        <div class="ao-foot" id="ao-foot">
          <div class="ao-status"><span class="ao-dot"></span><span id="ao-status-text">No changes</span></div>
          <div class="ao-btns">
            <button class="ao-btn ao-ghost" data-top="close">Close</button>
            <button class="ao-btn ao-primary" data-top="save" disabled>Save changes</button>
          </div>
        </div>
        <div class="ao-toast" id="ao-toast"></div>
      </div>`;
    document.body.appendChild(overlay);

    // Keep Stremio's keyboard shortcuts from firing while typing here.
    ["keydown", "keyup", "keypress"].forEach((evt) =>
      overlay.addEventListener(evt, (e) => {
        e.stopPropagation();
        if (evt === "keydown" && e.key === "Escape") closeModal();
      })
    );
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeModal();
    });
    overlay.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-top]");
      if (!btn) return;
      if (btn.dataset.top === "close") closeModal();
      if (btn.dataset.top === "save") saveChanges();
    });
  }

  function toast(msg, kind) {
    const el = $("#ao-toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "ao-toast ao-show" + (kind ? " ao-" + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("ao-show"), kind === "err" ? 5000 : 2500);
  }

  function refreshFooter() {
    if (!overlay) return;
    const dirty = isDirty();
    const foot = $("#ao-foot");
    foot.classList.toggle("ao-dirty", dirty);
    $("#ao-status-text").textContent = state.saving ? "Saving..." : dirty ? "Unsaved changes" : "No changes";
    const save = $('[data-top="save"]');
    save.disabled = !dirty || state.saving;
    save.textContent = state.saving ? "Saving..." : "Save changes";
  }

  function openModal() {
    state.auth = getAuthKey();
    ensureStyles();
    if (!overlay) buildOverlay();
    state.open = true;
    state.saving = false;
    requestAnimationFrame(() => overlay.classList.add("ao-visible"));
    updateLauncher();
    reload();
  }

  function closeModal(force) {
    if (!state.open) return;
    if (!force && isDirty() && !window.confirm("Discard your unsaved changes?")) return;
    state.open = false;
    overlay.classList.remove("ao-visible");
    updateLauncher();
  }

  async function reload() {
    const body = $("#ao-body");
    state.items = [];
    state.snapshot = "";
    refreshFooter();
    if (!state.auth) {
      body.innerHTML = `<div class="ao-msg">You need to be signed in to Stremio to manage addons.</div>`;
      return;
    }
    body.innerHTML = `<div class="ao-list">${'<div class="ao-skel"></div>'.repeat(5)}</div>`;
    try {
      await loadAddons();
      renderList();
    } catch (e) {
      console.error("[Addon Organizer] load failed", e);
      body.innerHTML = `<div class="ao-msg">${esc(e && e.message ? e.message : "Something went wrong.")}<br><button class="ao-btn ao-ghost" data-retry>Try again</button></div>`;
      const retry = body.querySelector("[data-retry]");
      if (retry) retry.onclick = reload;
    }
    refreshFooter();
  }

  // ---------------------------------------------------------------------------
  // List rendering
  // ---------------------------------------------------------------------------
  function rowHTML(it) {
    const m = it.manifest;
    const logo = m.logo
      ? `<img src="${esc(m.logo)}" alt="" loading="lazy">`
      : `<span class="ao-initial">${esc((m.name || "?").trim().charAt(0).toUpperCase())}</span>`;
    const tags = resourceTags(m).map((t) => `<span class="ao-tag">${esc(t)}</span>`).join("");
    const ver = m.version ? `<span class="ao-ver">v${esc(m.version)}</span>` : "";
    const protectedAddon = !!(it.raw.flags && it.raw.flags.protected);
    return `
      <div class="ao-main">
        <button class="ao-grip" data-grip title="Drag to reorder" aria-label="Drag to reorder">${icon("grip")}</button>
        <span class="ao-num"></span>
        <div class="ao-logo">${logo}</div>
        <div class="ao-info">
          <div class="ao-name">${esc(m.name)}</div>
          <div class="ao-tags">${tags}${ver}</div>
        </div>
        <div class="ao-actions">
          <button class="ao-icon-btn" data-act="up" title="Move up">${icon("up")}</button>
          <button class="ao-icon-btn" data-act="down" title="Move down">${icon("down")}</button>
          <button class="ao-icon-btn" data-act="edit" title="Rename and catalogs">${icon("sliders")}</button>
          <button class="ao-icon-btn ao-danger" data-act="remove" title="${protectedAddon ? "Built-in addon, can't be removed" : "Remove addon"}" ${protectedAddon ? "disabled" : ""}>${icon("trash")}</button>
        </div>
      </div>
      <div class="ao-edit"></div>`;
  }

  function editHTML(it) {
    const m = it.manifest;
    const cats = m.catalogs || [];
    const catHTML = cats.length
      ? cats
          .map(
            (c, idx) => `
        <div class="ao-cat" data-idx="${idx}">
          <label class="ao-switch" title="Show this catalog"><input type="checkbox" data-cat-vis ${c.hidden ? "" : "checked"}><span></span></label>
          <input class="ao-input" data-cat-name value="${esc(c.name)}">
          <span class="ao-badge">${esc(c.type || "other")}</span>${isSearchCatalog(c) ? '<span class="ao-badge ao-badge-search">Search</span>' : ""}
        </div>`
          )
          .join("")
      : '<div class="ao-empty">This addon has no catalogs.</div>';
    return `
      <label class="ao-field"><span class="ao-label">Display name</span>
        <input class="ao-input" data-field="name" value="${esc(m.name)}"></label>
      <div class="ao-cat-head">
        <span class="ao-label" style="margin:0">Catalogs (${cats.length})</span>
        ${cats.length ? '<span><button class="ao-link" data-act="cats-show">Show all</button><button class="ao-link" data-act="cats-hide">Hide all</button></span>' : ""}
      </div>
      <div class="ao-cats">${catHTML}</div>
      <div class="ao-edit-foot"><button class="ao-link" data-act="reset">Reset this addon to default</button></div>`;
  }

  function renderList() {
    const body = $("#ao-body");
    body.innerHTML = "";
    if (!state.items.length) {
      body.innerHTML = '<div class="ao-msg">No addons found.</div>';
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "ao-list";
    ul.id = "ao-list";
    state.items.forEach((it) => {
      const li = document.createElement("li");
      li.className = "ao-row";
      li.dataset.id = it.id;
      li.innerHTML = rowHTML(it);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    renumber();
    wireList(ul);
  }

  function itemOf(li) {
    return state.items.find((x) => x.id === li.dataset.id);
  }

  function renumber() {
    const rows = [...document.querySelectorAll("#ao-list > .ao-row")];
    rows.forEach((li, i) => {
      li.querySelector(".ao-num").textContent = String(i + 1);
      li.querySelector('[data-act="up"]').disabled = i === 0;
      li.querySelector('[data-act="down"]').disabled = i === rows.length - 1;
    });
  }

  function commitOrder() {
    const ids = [...document.querySelectorAll("#ao-list > .ao-row")].map((li) => li.dataset.id);
    state.items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    renumber();
    refreshFooter();
  }

  // Smoothly slide an element from where it used to be to where it is now.
  function flip(el, oldTop) {
    el.style.transition = "none";
    el.style.transform = "";
    const delta = oldTop - el.getBoundingClientRect().top;
    if (!delta) return;
    el.style.transform = `translateY(${delta}px)`;
    void el.offsetHeight;
    el.style.transition = "transform 200ms ease";
    el.style.transform = "";
    const done = () => {
      el.style.transition = "";
      el.removeEventListener("transitionend", done);
    };
    el.addEventListener("transitionend", done);
  }

  function nudge(li, dir) {
    const other = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
    if (!other) return;
    const list = li.parentElement;
    const liTop = li.getBoundingClientRect().top;
    const otherTop = other.getBoundingClientRect().top;
    if (dir < 0) list.insertBefore(li, other);
    else list.insertBefore(other, li);
    flip(li, liTop);
    flip(other, otherTop);
    li.classList.remove("ao-flash");
    void li.offsetWidth;
    li.classList.add("ao-flash");
    commitOrder();
    li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ---------------------------------------------------------------------------
  // Drag to reorder (pointer events, so it works reliably inside Electron)
  // ---------------------------------------------------------------------------
  function beginDrag(e, li, grip) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const list = li.parentElement;
    const body = $("#ao-body");
    try {
      grip.setPointerCapture(e.pointerId);
    } catch (err) {}

    // Collapse any open editor so every row has the same height while dragging.
    list.querySelectorAll(".ao-open").forEach((r) => r.classList.remove("ao-open"));

    let startY = e.clientY;
    let curY = e.clientY;
    li.classList.add("ao-dragging");
    document.body.classList.add("ao-noselect");

    function swapIfNeeded() {
      for (let guard = 0; guard < 6; guard++) {
        const r = li.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const prev = li.previousElementSibling;
        const next = li.nextElementSibling;
        let other = null;
        let before = false;
        if (prev) {
          const pr = prev.getBoundingClientRect();
          if (center < pr.top + pr.height / 2) {
            other = prev;
            before = true;
          }
        }
        if (!other && next) {
          const nr = next.getBoundingClientRect();
          if (center > nr.top + nr.height / 2) other = next;
        }
        if (!other) return;

        const liTop = r.top;
        const otherTop = other.getBoundingClientRect().top;
        if (before) list.insertBefore(li, other);
        else list.insertBefore(other, li);

        // Keep the dragged row glued to the cursor after the DOM move.
        startY -= liTop - li.getBoundingClientRect().top;
        li.style.transform = `translateY(${curY - startY}px)`;
        flip(other, otherTop);
        commitOrder(); // keeps the position badges and unsaved-changes indicator live
      }
    }

    // Position the dragged row under the cursor, but never let it poke outside the list.
    function place() {
      let t = curY - startY;
      li.style.transform = `translateY(${t}px)`;
      const lr = list.getBoundingClientRect();
      const r = li.getBoundingClientRect();
      if (r.top < lr.top - 4) t += lr.top - 4 - r.top;
      else if (r.bottom > lr.bottom + 4) t -= r.bottom - lr.bottom - 4;
      li.style.transform = `translateY(${t}px)`;
    }

    function apply() {
      place();
      swapIfNeeded();
      place();
    }

    let ended = false;

    const onMove = (ev) => {
      // The button was released somewhere we never heard about (outside the window, alt-tab...).
      if (ev.buttons === 0) return onEnd(ev);
      curY = ev.clientY;
      apply();
    };

    let raf = 0;
    const tick = () => {
      const br = body.getBoundingClientRect();
      let speed = 0;
      if (curY < br.top + 50) speed = -Math.min(20, Math.ceil((br.top + 50 - curY) / 3));
      else if (curY > br.bottom - 50) speed = Math.min(20, Math.ceil((curY - (br.bottom - 50)) / 3));
      if (speed) {
        const before = body.scrollTop;
        body.scrollTop = before + speed;
        const actual = body.scrollTop - before;
        if (actual) {
          startY -= actual;
          apply();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    function onEnd(ev) {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onEnd, true);
      window.removeEventListener("pointercancel", onEnd, true);
      window.removeEventListener("blur", onEnd);
      try {
        if (ev && ev.pointerId !== undefined) grip.releasePointerCapture(ev.pointerId);
      } catch (err) {}
      document.body.classList.remove("ao-noselect");

      // Settle the row into its slot.
      li.style.transition = "transform 160ms ease";
      li.style.transform = "";
      setTimeout(() => {
        li.style.transition = "";
        li.classList.remove("ao-dragging");
      }, 170);
      commitOrder();
    }

    // Listen on window, not the grip: moving the row in the DOM can drop pointer capture mid-drag.
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onEnd, true);
    window.addEventListener("pointercancel", onEnd, true);
    window.addEventListener("blur", onEnd);
  }

  // ---------------------------------------------------------------------------
  // Row interactions
  // ---------------------------------------------------------------------------
  function markEdited(it) {
    it.edited = true;
    it.resetPending = false;
    refreshFooter();
  }

  function refreshRow(li, it) {
    const fresh = document.createElement("div");
    fresh.innerHTML = rowHTML(it);
    li.querySelector(".ao-logo").innerHTML = fresh.querySelector(".ao-logo").innerHTML;
    li.querySelector(".ao-name").textContent = it.manifest.name;
  }

  function openEditor(li, it) {
    const wasOpen = li.classList.contains("ao-open");
    li.parentElement.querySelectorAll(".ao-open").forEach((r) => {
      r.classList.remove("ao-open");
      r.querySelector('[data-act="edit"]').classList.remove("ao-on");
    });
    if (wasOpen) return;
    li.querySelector(".ao-edit").innerHTML = editHTML(it);
    li.classList.add("ao-open");
    li.querySelector('[data-act="edit"]').classList.add("ao-on");
    li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function wireList(ul) {
    ul.addEventListener("pointerdown", (e) => {
      const grip = e.target.closest("[data-grip]");
      if (!grip) return;
      const li = grip.closest(".ao-row");
      beginDrag(e, li, grip);
    });

    ul.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const li = btn.closest(".ao-row");
      const it = itemOf(li);
      const act = btn.dataset.act;

      if (act === "up") return nudge(li, -1);
      if (act === "down") return nudge(li, 1);
      if (act === "edit") return openEditor(li, it);

      if (act === "remove") {
        if (btn.disabled) return;
        if (!btn.classList.contains("ao-armed")) {
          btn.classList.add("ao-armed");
          btn.innerHTML = "Remove?";
          setTimeout(() => {
            if (btn.isConnected) {
              btn.classList.remove("ao-armed");
              btn.innerHTML = icon("trash");
            }
          }, 3000);
          return;
        }
        state.items = state.items.filter((x) => x !== it);
        li.remove();
        renumber();
        refreshFooter();
        return;
      }

      if (act === "cats-show" || act === "cats-hide") {
        const hide = act === "cats-hide";
        (it.manifest.catalogs || []).forEach((c) => (c.hidden = hide));
        li.querySelectorAll("[data-cat-vis]").forEach((cb) => (cb.checked = !hide));
        return markEdited(it);
      }

      if (act === "reset") {
        it.manifest = clone(it.base);
        it.edited = false;
        it.resetPending = true;
        refreshRow(li, it);
        li.querySelector(".ao-edit").innerHTML = editHTML(it);
        refreshFooter();
        toast("Reset. Save to apply.");
      }
    });

    ul.addEventListener("input", (e) => {
      const li = e.target.closest(".ao-row");
      if (!li) return;
      const it = itemOf(li);
      if (e.target.matches('[data-field="name"]')) {
        it.manifest.name = e.target.value;
        li.querySelector(".ao-name").textContent = e.target.value || "Untitled";
        markEdited(it);
      } else if (e.target.matches("[data-cat-name]")) {
        const idx = parseInt(e.target.closest(".ao-cat").dataset.idx, 10);
        it.manifest.catalogs[idx].name = e.target.value;
        markEdited(it);
      }
    });

    ul.addEventListener("change", (e) => {
      if (!e.target.matches("[data-cat-vis]")) return;
      const li = e.target.closest(".ao-row");
      const it = itemOf(li);
      const idx = parseInt(e.target.closest(".ao-cat").dataset.idx, 10);
      it.manifest.catalogs[idx].hidden = !e.target.checked;
      markEdited(it);
    });

    // Broken logo images fall back to the first letter of the name.
    ul.addEventListener(
      "error",
      (e) => {
        if (e.target.tagName !== "IMG") return;
        const li = e.target.closest(".ao-row");
        const it = li && itemOf(li);
        const letter = esc(((it && it.manifest.name) || "?").trim().charAt(0).toUpperCase());
        e.target.parentElement.innerHTML = `<span class="ao-initial">${letter}</span>`;
      },
      true
    );
  }

  // ---------------------------------------------------------------------------
  // Launcher button (only shown on the Addons page)
  // ---------------------------------------------------------------------------
  let launcher = null;

  function updateLauncher() {
    if (!launcher) return;
    const onAddons = /^#\/addons/.test(location.hash);
    launcher.classList.toggle("ao-show", onAddons && !state.open);
  }

  function initLauncher() {
    ensureStyles();
    launcher = document.createElement("button");
    launcher.className = "ao-launcher";
    launcher.id = "ao-launcher";
    launcher.innerHTML = `${icon("reorder")}<span>Reorder addons</span>`;
    launcher.addEventListener("click", openModal);
    document.body.appendChild(launcher);
    window.addEventListener("hashchange", updateLauncher);
    window.addEventListener("popstate", updateLauncher);
    setInterval(updateLauncher, 1000); // safety net for route changes that skip hashchange
    updateLauncher();
  }

  if (document.body) initLauncher();
  else document.addEventListener("DOMContentLoaded", initLauncher);
})();
