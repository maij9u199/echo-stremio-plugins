/**
 * @name Lumen
 * @description A cinematic redesign for Stremio in the style of modern TV apps: a labeled glass sidebar, a rotating hero billboard, landscape Continue Watching, ranked Top rows and refined detail, Discover, Addons and Settings pages.
 * @version 1.1.0
 * @author Echo
 */
(function () {
  "use strict";
  if (window.__lumenLoaded) return; // never run twice
  window.__lumenLoaded = true;

  // ---------------------------------------------------------------------------
  // Options (edit these to taste)
  // ---------------------------------------------------------------------------
  const CONFIG = {
    hero: true, // rotating billboard at the top of Home
    heroSlides: 6, // how many titles the billboard rotates through
    heroInterval: 9000, // ms per slide
    continueWatchingBackdrops: true, // landscape art for Continue Watching
    rankNumbers: false, // big numbers on "Top ..." rows
    homeLabel: "Home", // sidebar label for Stremio's "Board"
  };

  const META_API = "https://v3-cinemeta.strem.io/meta/";
  const CACHE_KEY = "lumen.meta.v1";
  const HIT_TTL = 12 * 60 * 60 * 1000;
  const MISS_TTL = 2 * 60 * 60 * 1000;
  const html = document.documentElement;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.6v14.8c0 .8.9 1.3 1.6.9l12-7.4c.6-.4.6-1.4 0-1.8l-12-7.4C7.9 3.3 7 3.8 7 4.6z"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const CSS = `
  html.lumen {
    --lm-sidebar: 14.5rem;
    --lm-topbar: 4.5rem;
    --lm-page: #141416;
    --lm-raised: #1c1c1e;
    --lm-glass: rgba(38, 38, 42, 0.58);
    --lm-glass-strong: rgba(28, 28, 31, 0.82);
    --lm-stroke: rgba(255, 255, 255, 0.08);
    --lm-stroke-strong: rgba(255, 255, 255, 0.14);
    --lm-text: #f5f5f7;
    --lm-text-2: rgba(235, 235, 245, 0.62);
    --lm-text-3: rgba(235, 235, 245, 0.36);
    --lm-fill: rgba(255, 255, 255, 0.08);
    --lm-fill-hover: rgba(255, 255, 255, 0.13);
    --lm-select: rgba(255, 255, 255, 0.14);
    --lm-focus: #0a84ff;
    --lm-font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
    --lm-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --primary-background-color: #141416;
    --secondary-background-color: #19191c;
  }

  /* Our own elements: undo Stremio's global "* { font-size: 1rem }" style resets. Must stay first. */
  html.lumen [data-lm-own], html.lumen [data-lm-own] * {
    font-size: inherit; line-height: inherit; font-family: inherit; color: inherit; box-sizing: border-box;
  }

  html.lumen, html.lumen body, html.lumen #app { font-family: var(--lm-font) !important; -webkit-font-smoothing: antialiased; }
  html.lumen body {
    background: radial-gradient(1400px 700px at 70% -20%, rgba(120, 130, 170, 0.10), transparent 60%), var(--lm-page) !important;
    color: var(--lm-text);
  }
  html.lumen ::-webkit-scrollbar { width: 12px; height: 12px; }
  html.lumen ::-webkit-scrollbar-track { background: transparent; }
  html.lumen ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.14); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
  html.lumen ::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.24); }

  /* ---------------- Shell: sidebar, floating top bar, content ---------------- */
  html.lumen [class*="main-nav-bars-container-"] { position: relative !important; height: 100% !important; }

  html.lumen [class*="main-nav-bars-container-"] > nav[class*="vertical-nav-bar-container-"] {
    position: absolute !important; top: 0 !important; left: 0 !important; bottom: 0 !important;
    width: var(--lm-sidebar) !important; height: auto !important; z-index: 6 !important;
    display: flex !important; flex-direction: column !important; align-items: stretch !important; justify-content: flex-start !important;
    gap: 0.2rem !important; padding: calc(var(--lm-topbar) + 0.5rem) 0.75rem 1rem !important; margin: 0 !important;
    overflow-x: hidden !important; overflow-y: auto !important;
    background: rgba(24, 24, 27, 0.72) !important;
    -webkit-backdrop-filter: blur(40px) saturate(170%); backdrop-filter: blur(40px) saturate(170%);
    border-right: 1px solid var(--lm-stroke) !important; box-shadow: none !important;
  }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"],
  html.lumen nav[class*="vertical-nav-bar-container-"] > .lm-search-tab {
    display: flex !important; flex-direction: row !important; align-items: center !important; justify-content: flex-start !important;
    gap: 0.75rem !important; width: auto !important; height: 2.5rem !important; min-height: 2.5rem !important;
    padding: 0 0.8rem !important; margin: 0 !important; border-radius: 0.6rem !important;
    background: transparent !important; color: var(--lm-text) !important; text-decoration: none !important;
    cursor: pointer; transition: background 0.18s ease; flex: none !important; opacity: 1 !important;
  }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"]::before,
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"]::after { display: none !important; }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"]:hover,
  html.lumen nav[class*="vertical-nav-bar-container-"] > .lm-search-tab:hover { background: var(--lm-fill) !important; }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"].selected,
  html.lumen nav[class*="vertical-nav-bar-container-"] > .lm-search-tab.lm-on { background: var(--lm-select) !important; }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"] > svg,
  html.lumen nav[class*="vertical-nav-bar-container-"] > .lm-search-tab > svg {
    flex: none !important; width: 1.2rem !important; height: 1.2rem !important; margin: 0 !important; opacity: 0.7;
  }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"].selected > svg {
    opacity: 1; filter: grayscale(1) brightness(2.4);
  }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"] > [class*="label-"] {
    display: block !important; position: static !important; visibility: visible !important; opacity: 1 !important;
    flex: 1 1 auto !important; min-width: 0; margin: 0 !important; padding: 0 !important; max-height: none !important;
    font-size: 0.95rem !important; font-weight: 500 !important; line-height: 1.2 !important; letter-spacing: -0.005em;
    color: var(--lm-text) !important; text-align: left !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"] > [data-lm-text] { font-size: 0 !important; }
  html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"] > [data-lm-text]::after {
    content: attr(data-lm-text); font-size: 0.95rem; font-weight: 500; letter-spacing: -0.005em;
  }
  html.lumen .lm-search-tab { border: none; font-size: 0.95rem; font-weight: 500; }
  html.lumen .lm-search-tab svg { color: var(--lm-text); }
  html.lumen .lm-sidebar-gap { flex: none; height: 0.6rem; }

  html.lumen [class*="main-nav-bars-container-"] > nav[class*="horizontal-nav-bar-container-"] {
    position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important;
    height: var(--lm-topbar) !important; z-index: 8 !important; margin: 0 !important;
    display: flex !important; align-items: center !important; gap: 1rem !important; padding: 0 1.25rem 0 0 !important;
    background: transparent !important; box-shadow: none !important; border: none !important; pointer-events: none;
  }
  html.lumen [class*="main-nav-bars-container-"] > nav[class*="horizontal-nav-bar-container-"] > * { pointer-events: auto; }
  html.lumen [class*="main-nav-bars-container-"] > nav[class*="horizontal-nav-bar-container-"]::before {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0;
    background: rgba(22, 22, 25, 0.84); border-bottom: 1px solid var(--lm-stroke);
    -webkit-backdrop-filter: blur(30px) saturate(170%); backdrop-filter: blur(30px) saturate(170%);
    transition: opacity 0.25s ease;
  }
  html.lumen[data-lm-scrolled] [class*="main-nav-bars-container-"] > nav[class*="horizontal-nav-bar-container-"]::before { opacity: 1; }
  html.lumen nav[class*="horizontal-nav-bar-container-"] > [class*="logo-container-"] {
    flex: none !important; width: var(--lm-sidebar) !important; height: 100% !important; margin: 0 !important;
    display: flex !important; align-items: center !important; justify-content: flex-start !important; padding: 0 0 0 1.5rem !important;
  }
  html.lumen nav[class*="horizontal-nav-bar-container-"] > [class*="logo-container-"] img { height: 2rem !important; width: auto !important; }
  html.lumen nav[class*="horizontal-nav-bar-container-"] > [class*="search-bar-container-"] {
    flex: 0 1 30rem !important; max-width: 30rem !important; height: 2.6rem !important; margin: 0 auto !important;
    border-radius: 999px !important; background: rgba(40, 40, 44, 0.55) !important;
    -webkit-backdrop-filter: blur(30px) saturate(170%); backdrop-filter: blur(30px) saturate(170%);
    border: 1px solid var(--lm-stroke-strong) !important; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25) !important;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  html.lumen nav[class*="horizontal-nav-bar-container-"] > [class*="search-bar-container-"]:hover { background: rgba(52, 52, 58, 0.66) !important; }
  html.lumen nav[class*="horizontal-nav-bar-container-"] [class*="placeholder-label-"] { color: var(--lm-text-2) !important; font-size: 0.92rem !important; }
  html.lumen nav[class*="horizontal-nav-bar-container-"] > [class*="buttons-container-"] { margin-left: auto !important; gap: 0.5rem !important; }
  html.lumen nav[class*="horizontal-nav-bar-container-"] > [class*="buttons-container-"] > [class*="button-container-"] {
    border-radius: 999px !important; background: rgba(40, 40, 44, 0.5) !important;
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); border: 1px solid var(--lm-stroke) !important;
  }

  html.lumen [class*="main-nav-bars-container-"] > [class*="nav-content-container-"] {
    position: absolute !important; top: 0 !important; left: var(--lm-sidebar) !important; right: 0 !important; bottom: 0 !important;
    width: auto !important; height: auto !important; margin: 0 !important; z-index: 1 !important;
  }
  /* Every page except Home starts below the floating top bar. Home's hero sits under it on purpose. */
  html.lumen [class*="nav-content-container-"] > :not([class*="board-content-"]:not([class*="board-content-container-"])) { padding-top: var(--lm-topbar) !important; }

  /* ---------------- Home rows and cards ---------------- */
  html.lumen [class*="board-content-"]:not([class*="board-content-container-"]) { padding: var(--lm-topbar) 0 3rem !important; scroll-behavior: smooth; }
  html.lumen [class*="board-content-"]:not([class*="board-content-container-"])[data-lm-hero] { padding-top: 0 !important; }
  html.lumen [class*="board-content-"]:not([class*="board-content-container-"]) > [class*="board-row-"] { padding: 0 2.75rem !important; margin: 0 0 2.25rem !important; }
  html.lumen [class*="board-row-"] [class*="header-container-"] { margin: 0 0 0.9rem !important; padding: 0 !important; align-items: baseline !important; }
  html.lumen [class*="board-row-"] [class*="header-container-"] [class*="title-container-"],
  html.lumen [class*="board-row-"] [class*="header-container-"] [class*="title-container-"] > * {
    font-size: 1.32rem !important; font-weight: 700 !important; letter-spacing: -0.015em !important; color: var(--lm-text) !important;
  }
  html.lumen [class*="see-all-container-"] { color: var(--lm-text-2) !important; border-radius: 999px !important; padding: 0.3rem 0.4rem 0.3rem 0.75rem !important; }
  html.lumen [class*="see-all-container-"] [class*="label-"] { font-size: 0.88rem !important; font-weight: 600 !important; color: inherit !important; }
  html.lumen [class*="see-all-container-"]:hover { background: var(--lm-fill) !important; color: var(--lm-text) !important; }

  html.lumen [class*="meta-item-container-"] [class*="poster-container-"] {
    position: relative; border-radius: 0.8rem !important; overflow: hidden !important;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); transition: transform 0.35s var(--lm-ease), box-shadow 0.35s var(--lm-ease);
    will-change: transform;
  }
  html.lumen a[class*="meta-item-link-"]:hover [class*="poster-container-"],
  html.lumen a[class*="meta-item-link-"]:focus-visible [class*="poster-container-"] {
    transform: scale(1.045); box-shadow: 0 22px 44px rgba(0, 0, 0, 0.55);
  }
  html.lumen a[class*="meta-item-link-"]:focus-visible { outline: none !important; }
  html.lumen a[class*="meta-item-link-"]:focus-visible [class*="poster-container-"] { outline: 3px solid var(--lm-focus); outline-offset: 3px; }
  html.lumen [class*="meta-item-container-"] [class*="title-bar-container-"] { padding: 0.6rem 0.15rem 0 !important; }
  html.lumen [class*="meta-item-container-"] [class*="title-label-"] {
    font-size: 0.86rem !important; font-weight: 500 !important; color: var(--lm-text-2) !important; text-align: left !important;
  }
  html.lumen a[class*="meta-item-link-"]:hover [class*="title-label-"] { color: var(--lm-text) !important; }

  /* Continue watching: wide landscape cards */
  html.lumen [class*="continue-watching-row-"] [class*="meta-items-container-"] {
    display: flex !important; flex-wrap: nowrap !important; gap: 1.1rem !important; overflow-x: auto !important; overflow-y: visible !important;
    padding: 0.5rem 0.25rem 1rem !important; margin: -0.5rem -0.25rem 0 !important; scrollbar-width: none;
  }
  html.lumen [class*="continue-watching-row-"] [class*="meta-items-container-"]::-webkit-scrollbar { display: none; }
  html.lumen [class*="continue-watching-row-"] [class*="meta-items-container-"] > :not([class*="meta-item-container-"]) { display: none !important; }
  html.lumen [class*="continue-watching-row-"] [class*="meta-item-container-"] {
    flex: 0 0 clamp(15rem, 22vw, 23rem) !important; width: auto !important; max-width: none !important; min-width: 0 !important; margin: 0 !important;
  }
  html.lumen [class*="continue-watching-row-"] [class*="poster-container-"] {
    aspect-ratio: 16 / 9 !important; padding-top: 0 !important; height: auto !important; width: 100% !important;
  }
  html.lumen [class*="continue-watching-row-"] [class*="poster-image-layer-"] { position: absolute !important; inset: 0 !important; }
  html.lumen [class*="continue-watching-row-"] [class*="poster-image-layer-"] img { width: 100% !important; height: 100% !important; object-fit: cover !important; }
  html.lumen [class*="continue-watching-row-"] [class*="progress-bar-layer-"] { z-index: 3 !important; }
  html.lumen [class*="continue-watching-row-"] [class*="dismiss-icon-layer-"] { z-index: 4 !important; }
  html.lumen .lm-cw-art {
    position: absolute; inset: 0; z-index: 1; background-size: cover; background-position: center 25%; background-color: #222;
    transition: opacity 0.4s ease;
  }
  html.lumen .lm-cw-art::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.12) 45%, rgba(0, 0, 0, 0) 70%);
  }
  html.lumen .lm-cw-art.lm-poster { filter: saturate(1.05); }
  html.lumen .lm-cw-logo {
    position: absolute; left: 0.9rem; bottom: 1.35rem; z-index: 2; max-width: 52%; max-height: 38%;
    object-fit: contain; object-position: left bottom; filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.55)); pointer-events: none;
  }

  /* Ranked rows */
  html.lumen .lm-rank {
    position: absolute; left: 0.45rem; top: 0.1rem; z-index: 4; pointer-events: none;
    font-size: clamp(2.3rem, 3.3vw, 3.4rem); font-weight: 800; line-height: 1; letter-spacing: -0.05em;
    color: #fff; font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(0, 0, 0, 0.6);
  }

  /* ---------------- Hero billboard ---------------- */
  html.lumen .lm-hero {
    position: relative; width: 100%; height: clamp(26rem, 74vh, 50rem); margin: 0 0 1.5rem; overflow: hidden; isolation: isolate;
    background: transparent; color: var(--lm-text); font-size: 1rem; line-height: 1.4;
    -webkit-mask-image: linear-gradient(180deg, #000 82%, transparent 100%); mask-image: linear-gradient(180deg, #000 82%, transparent 100%);
  }
  html.lumen .lm-hero-bg {
    position: absolute; inset: 0; background-size: cover; background-position: center 22%;
    opacity: 0; transform: scale(1.06); transition: opacity 1.1s ease;
  }
  html.lumen .lm-hero-bg.lm-on { opacity: 1; animation: lm-drift var(--lm-hero-ms, 9000ms) linear forwards; }
  @keyframes lm-drift { from { transform: scale(1.07); } to { transform: scale(1.0); } }
  html.lumen .lm-hero-shade {
    position: absolute; inset: 0; pointer-events: none;
    background:
      linear-gradient(90deg, rgba(10, 10, 12, 0.88) 0%, rgba(10, 10, 12, 0.6) 30%, rgba(10, 10, 12, 0) 62%),
      linear-gradient(0deg, var(--lm-page) 0%, rgba(20, 20, 22, 0.55) 16%, rgba(20, 20, 22, 0) 42%),
      linear-gradient(180deg, rgba(10, 10, 12, 0.5) 0%, rgba(10, 10, 12, 0) 20%);
  }
  html.lumen .lm-hero-content {
    position: absolute; left: 2.75rem; bottom: 4.5rem; z-index: 2; width: min(34rem, 46%);
    transition: opacity 0.35s ease, transform 0.35s var(--lm-ease);
  }
  html.lumen .lm-hero-content.lm-swap { opacity: 0; transform: translateY(0.5rem); }
  html.lumen .lm-hero-kicker {
    display: inline-flex; align-items: center; height: 1.6rem; padding: 0 0.65rem; margin: 0 0 1rem;
    border-radius: 0.45rem; border: 1px solid rgba(255, 255, 255, 0.55);
    font-size: 0.78rem; font-weight: 700; letter-spacing: 0.005em; color: #fff;
  }
  html.lumen .lm-hero-kicker:empty { display: none; }
  html.lumen .lm-hero-logo {
    display: block; max-width: min(26rem, 100%); max-height: 9.5rem; margin: 0 0 1.1rem;
    object-fit: contain; object-position: left bottom; filter: drop-shadow(0 6px 28px rgba(0, 0, 0, 0.5));
  }
  html.lumen .lm-hero-title {
    margin: 0 0 1rem; font-size: clamp(2.3rem, 4.2vw, 3.8rem); font-weight: 800; line-height: 1.02; letter-spacing: -0.025em;
    text-shadow: 0 4px 30px rgba(0, 0, 0, 0.45);
  }
  html.lumen .lm-hero-meta {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.15rem 0.5rem; margin: 0 0 0.8rem;
    font-size: 0.92rem; font-weight: 600; color: rgba(245, 245, 247, 0.78);
  }
  html.lumen .lm-hero-meta .lm-sep { opacity: 0.45; }
  html.lumen .lm-imdb { display: inline-flex; align-items: center; gap: 0.35rem; }
  html.lumen .lm-imdb b {
    font-size: 0.62rem; font-weight: 800; line-height: 1; color: #000; background: #f5c518; padding: 0.18rem 0.32rem; border-radius: 0.22rem;
  }
  html.lumen .lm-hero-desc {
    margin: 0 0 1.5rem; max-width: 32rem; font-size: 0.98rem; font-weight: 400; line-height: 1.5; color: rgba(245, 245, 247, 0.8);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  html.lumen .lm-hero-actions { display: flex; align-items: center; gap: 0.75rem; }
  html.lumen .lm-btn {
    display: inline-flex; align-items: center; gap: 0.55rem; height: 2.85rem; padding: 0 1.65rem 0 1.35rem;
    border-radius: 999px; border: none; font-size: 1rem; font-weight: 700; text-decoration: none; cursor: pointer;
    transition: transform 0.18s var(--lm-ease), background 0.2s ease;
  }
  html.lumen .lm-btn svg { width: 1.05rem; height: 1.05rem; }
  html.lumen .lm-btn-primary { background: #f5f5f7; color: #000; }
  html.lumen .lm-btn-primary:hover { background: #fff; transform: scale(1.035); }
  html.lumen .lm-btn:focus-visible, html.lumen .lm-hero-arrow:focus-visible, html.lumen .lm-hero-dot:focus-visible {
    outline: 3px solid var(--lm-focus); outline-offset: 3px;
  }
  html.lumen .lm-hero-arrow {
    position: absolute; top: 50%; z-index: 3; width: 2.9rem; height: 2.9rem; margin-top: -1.45rem; padding: 0;
    display: flex; align-items: center; justify-content: center; border-radius: 50%; cursor: pointer;
    color: #fff; background: rgba(30, 30, 34, 0.45); border: 1px solid rgba(255, 255, 255, 0.14);
    -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    opacity: 0; transition: opacity 0.25s ease, background 0.2s ease;
  }
  html.lumen .lm-hero-arrow svg { width: 1.2rem; height: 1.2rem; }
  html.lumen .lm-hero:hover .lm-hero-arrow, html.lumen .lm-hero-arrow:focus-visible { opacity: 1; }
  html.lumen .lm-hero-arrow:hover { background: rgba(60, 60, 66, 0.6); }
  html.lumen .lm-prev { left: 1rem; }
  html.lumen .lm-next { right: 1rem; }
  html.lumen .lm-hero-dots { position: absolute; left: 50%; bottom: 1.6rem; z-index: 3; display: flex; gap: 0.45rem; transform: translateX(-50%); }
  html.lumen .lm-hero-dot {
    position: relative; width: 0.45rem; height: 0.45rem; padding: 0; border: none; border-radius: 999px; overflow: hidden;
    background: rgba(255, 255, 255, 0.35); cursor: pointer; transition: width 0.35s var(--lm-ease), background 0.2s ease;
  }
  html.lumen .lm-hero-dot:hover { background: rgba(255, 255, 255, 0.6); }
  html.lumen .lm-hero-dot.lm-active { width: 1.7rem; background: rgba(255, 255, 255, 0.3); }
  html.lumen .lm-hero-dot.lm-active::after {
    content: ""; position: absolute; inset: 0; background: #fff; border-radius: inherit; transform-origin: left center;
    animation: lm-progress var(--lm-hero-ms, 9000ms) linear forwards;
  }
  html.lumen .lm-hero.lm-paused .lm-hero-dot.lm-active::after { animation: none; transform: scaleX(1); }
  @keyframes lm-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  /* ---------------- Detail page ---------------- */
  html.lumen [class*="metadetails-container-"] > [class*="background-image-layer-"] { background: #000 !important; }
  html.lumen [class*="metadetails-container-"] > [class*="background-image-layer-"] img { opacity: 0.92 !important; filter: none !important; object-fit: cover !important; }
  html.lumen [class*="metadetails-container-"] > [class*="background-image-layer-"]::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1;
    background:
      linear-gradient(90deg, rgba(10, 10, 12, 0.92) 0%, rgba(10, 10, 12, 0.7) 32%, rgba(10, 10, 12, 0.18) 62%, rgba(10, 10, 12, 0.35) 100%),
      linear-gradient(0deg, rgba(10, 10, 12, 0.85) 0%, rgba(10, 10, 12, 0) 45%);
  }
  html.lumen [class*="metadetails-container-"] > nav[class*="nav-bar-"] { background: transparent !important; box-shadow: none !important; }
  html.lumen [class*="metadetails-container-"] > nav [class*="back-button-container-"],
  html.lumen [class*="metadetails-container-"] > nav [class*="buttons-container-"] > [class*="button-container-"] {
    border-radius: 999px !important; background: rgba(40, 40, 44, 0.5) !important; border: 1px solid var(--lm-stroke) !important;
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px);
  }

  html.lumen [class*="meta-info-container-"] > img[class*="logo-"] {
    max-height: 9rem !important; max-width: min(28rem, 90%) !important; height: auto !important; width: auto !important;
    object-fit: contain !important; object-position: left center !important; filter: drop-shadow(0 6px 28px rgba(0, 0, 0, 0.5));
  }
  html.lumen [class*="runtime-release-info-container-"] { gap: 1.1rem !important; }
  html.lumen [class*="runtime-release-info-container-"] > div { font-size: 0.95rem !important; font-weight: 600 !important; color: rgba(245, 245, 247, 0.85) !important; }
  html.lumen [class*="meta-links-container-"] > [class*="label-container-"],
  html.lumen [class*="description-container-"] > [class*="label-container-"] {
    font-size: 0.8rem !important; font-weight: 600 !important; letter-spacing: 0 !important; text-transform: none !important;
    color: var(--lm-text-3) !important; margin-bottom: 0.45rem !important;
  }
  html.lumen [class*="links-container-"] > a[class*="link-container-"] {
    background: var(--lm-fill) !important; border: 1px solid var(--lm-stroke) !important; border-radius: 999px !important;
    padding: 0.35rem 0.95rem !important; font-size: 0.86rem !important; font-weight: 500 !important; color: var(--lm-text) !important;
    -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); transition: background 0.18s ease;
  }
  html.lumen [class*="links-container-"] > a[class*="link-container-"]:hover { background: var(--lm-fill-hover) !important; }
  html.lumen [class*="meta-info-container-"] > [class*="description-container-"] {
    max-width: 46rem !important; font-size: 0.98rem !important; line-height: 1.55 !important; color: rgba(245, 245, 247, 0.82) !important;
  }

  html.lumen [class*="action-buttons-container-"] { gap: 0.75rem !important; }
  html.lumen [class*="action-buttons-container-"] > a[class*="action-button-container-"],
  html.lumen [class*="action-buttons-container-"] > [class*="group-container-"] {
    border-radius: 999px !important; background: rgba(44, 44, 48, 0.55) !important; border: 1px solid var(--lm-stroke-strong) !important;
    -webkit-backdrop-filter: blur(24px) saturate(160%); backdrop-filter: blur(24px) saturate(160%);
    transition: background 0.2s ease, transform 0.18s var(--lm-ease);
  }
  html.lumen [class*="action-buttons-container-"] > a[class*="action-button-container-"]:hover,
  html.lumen [class*="action-buttons-container-"] > [class*="group-container-"]:hover { background: rgba(70, 70, 76, 0.6) !important; }
  /* The main wide button (Trailer on detail pages, Show on Discover) becomes the white primary pill */
  html.lumen [class*="action-buttons-container-"] > a[class*="action-button-container-"][class*="wide-"] {
    background: #f5f5f7 !important; border-color: transparent !important; color: #000 !important;
  }
  html.lumen [class*="action-buttons-container-"] > a[class*="action-button-container-"][class*="wide-"]:hover { background: #fff !important; transform: scale(1.03); }
  html.lumen [class*="action-buttons-container-"] > a[class*="action-button-container-"][class*="wide-"] svg { fill: #000 !important; color: #000 !important; }
  html.lumen [class*="action-buttons-container-"] > a[class*="action-button-container-"][class*="wide-"] [class*="label-"] { color: #000 !important; font-weight: 700 !important; }

  /* Streams panel and episode list: frosted glass */
  html.lumen [class*="streams-list-container-"],
  html.lumen [class*="videos-list-container-"] {
    background: var(--lm-glass-strong) !important; border-left: 1px solid var(--lm-stroke) !important;
    -webkit-backdrop-filter: blur(44px) saturate(160%); backdrop-filter: blur(44px) saturate(160%);
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.35) !important;
  }
  html.lumen [class*="streams-container-"] > [class*="stream-container-"] {
    border-radius: 0.8rem !important; margin: 0 0.5rem 0.35rem !important; transition: background 0.16s ease;
  }
  html.lumen [class*="streams-container-"] > [class*="stream-container-"]:hover { background: var(--lm-fill) !important; }
  html.lumen [class*="stream-container-"] [class*="addon-name-"] { font-size: 0.86rem !important; font-weight: 600 !important; color: var(--lm-text) !important; }
  html.lumen [class*="stream-container-"] [class*="description-container-"] { font-size: 0.84rem !important; color: var(--lm-text-2) !important; }
  html.lumen [class*="streams-list-container-"] > [class*="select-choices-wrapper-"] [class*="episode-title-"] { font-size: 1rem !important; font-weight: 700 !important; }

  html.lumen [class*="seasons-bar-container-"] { padding: 0.75rem 1rem !important; }
  html.lumen [class*="seasons-bar-container-"] [class*="button-container-"] { border-radius: 999px !important; }
  html.lumen [class*="seasons-popup-label-container-"] > [class*="button-container-"] {
    background: var(--lm-fill) !important; border: 1px solid var(--lm-stroke) !important; border-radius: 999px !important;
  }
  html.lumen [class*="videos-container-"] > [class*="video-container-"] {
    border-radius: 0.8rem !important; margin: 0 0.5rem 0.4rem !important; transition: background 0.16s ease;
  }
  html.lumen [class*="videos-container-"] > [class*="video-container-"]:hover { background: var(--lm-fill) !important; }
  html.lumen [class*="videos-container-"] > [class*="video-container-"][class*="selected-"] { background: var(--lm-select) !important; }
  html.lumen [class*="video-container-"] [class*="thumbnail-container-"] { border-radius: 0.55rem !important; overflow: hidden !important; }
  html.lumen [class*="video-container-"] [class*="info-container-"] [class*="title-container-"] { font-size: 0.92rem !important; font-weight: 600 !important; color: var(--lm-text) !important; }
  html.lumen [class*="video-container-"] [class*="released-container-"] { font-size: 0.8rem !important; color: var(--lm-text-3) !important; }

  html.lumen label[class*="search-bar-container-"] {
    border-radius: 999px !important; background: var(--lm-fill) !important; border: 1px solid var(--lm-stroke) !important;
  }


  /* ---------------- Detail page: Apple TV layout ----------------
     Full-bleed backdrop, title block anchored bottom-left, streams as a floating glass sheet,
     and for series an episode strip along the bottom. */
  html.lumen [class*="metadetails-container-"] > [class*="metadetails-content-"] {
    position: absolute !important; inset: 0 !important; z-index: 1 !important;
    display: flex !important; flex-direction: row !important; align-items: stretch !important;
    padding: 5rem 1.25rem 1.25rem 0 !important; margin: 0 !important; gap: 0 !important;
  }
  html.lumen [class*="metadetails-container-"] > nav[class*="nav-bar-"] { z-index: 3 !important; }
  html.lumen [class*="metadetails-content-"] > [class*="spacing-"] { flex: 0 0 1.25rem !important; width: auto !important; }
  html.lumen [class*="metadetails-content-"] > [class*="meta-preview-container-"] {
    position: relative !important; flex: 1 1 auto !important; min-width: 0 !important; min-height: 0 !important;
    display: flex !important; flex-direction: column !important; justify-content: flex-end !important; align-items: flex-start !important;
    gap: 1.5rem !important; padding: 0 2.5rem 2rem 3.5rem !important; margin: 0 !important;
    overflow: visible !important; background: none !important;
  }
  html.lumen [class*="metadetails-content-"] > [class*="meta-preview-container-"] > [class*="meta-info-container-"] {
    flex: 0 1 auto !important; display: flex !important; flex-direction: column !important; align-items: flex-start !important;
    gap: 0.85rem !important; width: 100% !important; max-width: 42rem !important; min-height: 0 !important;
    overflow: visible !important; padding: 0 !important; margin: 0 !important;
  }
  html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > img[class*="logo-"] {
    order: 0; max-height: 10rem !important; max-width: min(30rem, 100%) !important; margin: 0 0 0.6rem !important;
  }
  /* Order like Apple: genres line, summary, release info, then the people */
  html.lumen [class*="metadetails-content-"] [data-lm-kind="genres"] { order: 1; }
  html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > [class*="description-container-"] { order: 2; }
  html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > [class*="runtime-release-info-container-"] { order: 3; }
  html.lumen [class*="metadetails-content-"] [data-lm-kind="cast"] { order: 4; }
  html.lumen [class*="metadetails-content-"] [data-lm-kind="directors"] { order: 5; }
  html.lumen [class*="metadetails-content-"] [data-lm-kind="writers"],
  html.lumen [class*="metadetails-content-"] [data-lm-kind="other"] { order: 6; }

  /* Genres as one quiet line: Crime · Drama */
  html.lumen [class*="metadetails-content-"] [data-lm-kind="genres"] > [class*="label-container-"] { display: none !important; }
  html.lumen [class*="metadetails-content-"] [data-lm-kind="genres"] > [class*="links-container-"] {
    display: flex !important; flex-wrap: wrap !important; gap: 0 0.45rem !important; margin: 0 !important;
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind="genres"] > [class*="links-container-"] > a[class*="link-container-"] {
    background: none !important; border: none !important; padding: 0 !important; border-radius: 0 !important;
    -webkit-backdrop-filter: none; backdrop-filter: none;
    font-size: 0.98rem !important; font-weight: 600 !important; color: rgba(245, 245, 247, 0.82) !important;
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind="genres"] > [class*="links-container-"] > a[class*="link-container-"] + a::before {
    content: "·"; margin-right: 0.45rem; opacity: 0.5;
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind="genres"] > [class*="links-container-"] > a[class*="link-container-"]:hover { color: #fff !important; }

  /* Summary: no label, comfortable measure, clamped */
  html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > [class*="description-container-"] {
    max-width: 38rem !important; font-size: 1rem !important; line-height: 1.55 !important; color: rgba(245, 245, 247, 0.86) !important;
    display: -webkit-box !important; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden !important;
  }
  html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > [class*="description-container-"] > [class*="label-container-"] { display: none !important; }

  /* Release line: 1999-2007 · 9.2 IMDb */
  html.lumen [class*="metadetails-content-"] [class*="runtime-release-info-container-"] { gap: 0 0.55rem !important; flex-wrap: wrap !important; }
  html.lumen [class*="metadetails-content-"] [class*="runtime-release-info-container-"] > * + *::before {
    content: "·"; margin-right: 0.55rem; opacity: 0.5; color: var(--lm-text);
  }
  html.lumen [class*="metadetails-content-"] [class*="runtime-release-info-container-"] > div,
  html.lumen [class*="metadetails-content-"] [class*="runtime-release-info-container-"] [class*="label-"] {
    font-size: 0.9rem !important; font-weight: 600 !important; color: var(--lm-text-2) !important;
  }

  /* People: "Starring A, B, C" and "Director D" as compact lines */
  html.lumen [class*="metadetails-content-"] [data-lm-kind="cast"],
  html.lumen [class*="metadetails-content-"] [data-lm-kind="directors"],
  html.lumen [class*="metadetails-content-"] [data-lm-kind="writers"],
  html.lumen [class*="metadetails-content-"] [data-lm-kind="other"] {
    display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden !important;
    max-width: 38rem !important; font-size: 0.86rem !important; line-height: 1.5 !important; margin: 0 !important;
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind] > [class*="label-container-"][data-lm-text] {
    display: inline !important; font-size: 0 !important; margin: 0 !important;
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind] > [class*="label-container-"][data-lm-text]::after {
    content: attr(data-lm-text); font-size: 0.86rem; font-weight: 600; color: var(--lm-text-3); margin-right: 0.4rem;
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind]:not([data-lm-kind="genres"]) > [class*="links-container-"] {
    display: inline !important; margin: 0 !important;
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind]:not([data-lm-kind="genres"]) > [class*="links-container-"] > a[class*="link-container-"] {
    display: inline !important; background: none !important; border: none !important; padding: 0 !important; border-radius: 0 !important;
    -webkit-backdrop-filter: none; backdrop-filter: none;
    font-size: 0.86rem !important; font-weight: 500 !important; color: rgba(245, 245, 247, 0.8) !important;
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind]:not([data-lm-kind="genres"]) > [class*="links-container-"] > a[class*="link-container-"] + a::before {
    content: ", "; color: var(--lm-text-3);
  }
  html.lumen [class*="metadetails-content-"] [data-lm-kind]:not([data-lm-kind="genres"]) > [class*="links-container-"] > a[class*="link-container-"]:hover { color: #fff !important; text-decoration: underline; }
  html.lumen [class*="metadetails-content-"] [data-lm-kind="cast"]:not([data-lm-kind="genres"]) > [class*="links-container-"] > a[class*="link-container-"]:nth-of-type(n+6) { display: none !important; }

  /* Buttons row */
  html.lumen [class*="metadetails-content-"] > [class*="meta-preview-container-"] > [class*="action-buttons-container-"] {
    flex: none !important; margin: 0.25rem 0 0 !important; padding: 0 !important;
  }

  /* Streams: floating glass sheet */
  html.lumen [class*="metadetails-content-"] > [class*="streams-list-container-"] {
    border-radius: 1.25rem !important; overflow: hidden !important; border: 1px solid var(--lm-stroke-strong) !important;
    background: rgba(22, 22, 25, 0.68) !important; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5) !important;
  }

  /* Series: episode strip along the bottom */
  html.lumen [class*="metadetails-content-"][data-lm-mode="episodes"] {
    flex-direction: column !important; padding: 5rem 1.25rem 1.25rem !important;
  }
  html.lumen [class*="metadetails-content-"][data-lm-mode="episodes"] > [class*="spacing-"] { display: none !important; }
  html.lumen [class*="metadetails-content-"][data-lm-mode="episodes"] > [class*="meta-preview-container-"] {
    flex: 1 1 auto !important; padding: 0 2.5rem 1.5rem 2.25rem !important;
  }
  html.lumen [class*="metadetails-content-"][data-lm-mode="episodes"] [class*="meta-info-container-"] > [class*="description-container-"] { -webkit-line-clamp: 3; }
  html.lumen [class*="metadetails-content-"][data-lm-mode="episodes"] > [class*="videos-list-container-"] {
    flex: 0 0 auto !important; width: auto !important; max-width: none !important; height: auto !important; min-height: 0 !important;
    display: flex !important; flex-direction: row !important; flex-wrap: wrap !important; align-items: center !important;
    gap: 0.5rem 1rem !important; padding: 0.85rem 1rem 0.75rem !important; margin: 0 !important;
    border-radius: 1.25rem !important; border: 1px solid var(--lm-stroke) !important;
    background: rgba(18, 18, 21, 0.6) !important; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45) !important;
  }
  html.lumen [data-lm-mode="episodes"] > [class*="videos-list-container-"] > [class*="seasons-bar-container-"] {
    flex: 0 0 auto !important; width: auto !important; gap: 0.5rem !important; padding: 0 !important; margin: 0 !important;
  }
  html.lumen [data-lm-mode="episodes"] > [class*="videos-list-container-"] > label[class*="search-bar-container-"] {
    flex: 0 1 18rem !important; width: auto !important; height: 2.4rem !important; margin: 0 0 0 auto !important;
  }
  html.lumen [data-lm-mode="episodes"] > [class*="videos-list-container-"] > [class*="videos-container-"] {
    flex: 0 0 100% !important; width: 100% !important; height: auto !important; max-height: none !important;
    display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; gap: 0.85rem !important;
    overflow-x: auto !important; overflow-y: hidden !important; padding: 0.35rem 0.1rem 0.5rem !important; margin: 0 !important;
  }
  html.lumen [data-lm-mode="episodes"] [class*="videos-container-"] > [class*="video-container-"] {
    flex: 0 0 clamp(12.5rem, 16vw, 16rem) !important; width: auto !important; height: auto !important;
    display: flex !important; flex-direction: column !important; align-items: stretch !important; gap: 0.55rem !important;
    padding: 0.45rem !important; margin: 0 !important; border-radius: 0.95rem !important;
  }
  html.lumen [data-lm-mode="episodes"] [class*="video-container-"] [class*="thumbnail-container-"] {
    flex: none !important; width: 100% !important; height: auto !important; aspect-ratio: 16 / 9; margin: 0 !important; border-radius: 0.65rem !important;
  }
  html.lumen [data-lm-mode="episodes"] [class*="video-container-"] [class*="thumbnail-container-"] img { width: 100% !important; height: 100% !important; object-fit: cover !important; }
  html.lumen [data-lm-mode="episodes"] [class*="video-container-"] [class*="info-container-"] {
    padding: 0 0.2rem 0.15rem !important; margin: 0 !important; width: 100% !important; min-width: 0 !important;
  }
  html.lumen [data-lm-mode="episodes"] [class*="video-container-"] [class*="title-container-"] {
    white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
  }

  /* Never squash a line: drop lower-priority lines on short windows instead */
  html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > * { flex-shrink: 0 !important; }
  @media (max-height: 900px) {
    html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > img[class*="logo-"] { max-height: 7.5rem !important; }
    html.lumen [data-lm-mode="episodes"] [data-lm-kind]:not([data-lm-kind="genres"]) { display: none !important; }
    html.lumen [data-lm-mode="episodes"] [class*="meta-info-container-"] > [class*="description-container-"] { -webkit-line-clamp: 2; }
    html.lumen [data-lm-mode="episodes"] [class*="videos-container-"] > [class*="video-container-"] { flex-basis: clamp(11rem, 14vw, 14rem) !important; }
    html.lumen [class*="metadetails-content-"] > [class*="meta-preview-container-"] { gap: 1.1rem !important; padding-bottom: 1.5rem !important; }
  }
  @media (max-height: 760px) {
    html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > img[class*="logo-"] { max-height: 6rem !important; margin-bottom: 0.2rem !important; }
    html.lumen [data-lm-mode="episodes"] [class*="meta-info-container-"] > img[class*="logo-"] { max-height: 4.75rem !important; }
    html.lumen [class*="metadetails-content-"] [data-lm-kind="directors"],
    html.lumen [class*="metadetails-content-"] [data-lm-kind="writers"],
    html.lumen [class*="metadetails-content-"] [data-lm-kind="other"] { display: none !important; }
    html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > [class*="description-container-"] { -webkit-line-clamp: 3; }
    html.lumen [data-lm-mode="episodes"] [class*="meta-info-container-"] > [class*="description-container-"] { -webkit-line-clamp: 2; }
    html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] { gap: 0.6rem !important; }
    html.lumen [data-lm-mode="episodes"] > [class*="videos-list-container-"] { padding: 0.6rem 0.85rem 0.5rem !important; }
    html.lumen [data-lm-mode="episodes"] [class*="video-container-"] [class*="released-container-"] { display: none !important; }
  }

  @media (max-width: 1000px) {
    html.lumen [class*="metadetails-content-"] > [class*="meta-preview-container-"] { padding: 0 1.5rem 1.5rem 1.75rem !important; }
    html.lumen [class*="metadetails-content-"] [class*="meta-info-container-"] > img[class*="logo-"] { max-height: 7rem !important; }
  }

  /* ---------------- Discover ---------------- */
  html.lumen [class*="selectable-inputs-container-"] [class*="multiselect-menu-"] > [class*="button-container-"],
  html.lumen [class*="selectable-inputs-container-"] [class*="filter-button-"] {
    border-radius: 999px !important; background: var(--lm-glass) !important; border: 1px solid var(--lm-stroke-strong) !important;
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); transition: background 0.18s ease;
  }
  html.lumen [class*="selectable-inputs-container-"] [class*="multiselect-menu-"] > [class*="button-container-"]:hover,
  html.lumen [class*="selectable-inputs-container-"] [class*="filter-button-"]:hover { background: rgba(60, 60, 66, 0.65) !important; }
  html.lumen [class*="discover-content-"] > [class*="meta-preview-container-"] {
    background: var(--lm-glass-strong) !important; border-left: 1px solid var(--lm-stroke) !important;
    -webkit-backdrop-filter: blur(44px) saturate(160%); backdrop-filter: blur(44px) saturate(160%);
  }

  /* ---------------- Addons ---------------- */
  html.lumen [class*="addons-list-container-"] > [class*="addon-container-"],
  html.lumen [class*="section-"] [class*="addon-container-"] {
    border-radius: 1rem !important; background: var(--lm-glass) !important; border: 1px solid var(--lm-stroke) !important;
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); transition: background 0.18s ease, border-color 0.18s ease;
  }
  html.lumen [class*="addons-list-container-"] > [class*="addon-container-"]:hover { background: rgba(52, 52, 58, 0.62) !important; border-color: var(--lm-stroke-strong) !important; }
  html.lumen [class*="addon-container-"] [class*="logo-container-"] { border-radius: 0.8rem !important; overflow: hidden !important; }
  html.lumen [class*="add-button-container-"] { border-radius: 999px !important; background: #f5f5f7 !important; color: #000 !important; }
  html.lumen [class*="add-button-container-"] svg { fill: #000 !important; color: #000 !important; }
  html.lumen [class*="add-button-container-"] [class*="label-"] { color: #000 !important; font-weight: 700 !important; }
  html.lumen [class*="add-button-container-"]:hover { background: #fff !important; }
  /* Match the Addon Organizer plugin's launcher to this look when both are installed */
  html.lumen #ao-launcher { background: #f5f5f7 !important; color: #000 !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45) !important; }
  html.lumen #ao-launcher:hover { background: #fff !important; }

  /* ---------------- Settings ---------------- */
  html.lumen [class*="settings-content-"] > [class*="menu-"] [class*="button-"] {
    border-radius: 0.6rem !important; font-size: 0.95rem !important; font-weight: 500 !important;
  }
  html.lumen [class*="settings-content-"] > [class*="menu-"] [class*="button-"][class*="selected-"] { background: var(--lm-select) !important; }

  /* ---------------- Narrow windows: icon-only sidebar ---------------- */
  @media (max-width: 1000px) {
    html.lumen { --lm-sidebar: 4.75rem; }
    html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"],
    html.lumen nav[class*="vertical-nav-bar-container-"] > .lm-search-tab { justify-content: center !important; padding: 0 !important; }
    html.lumen nav[class*="vertical-nav-bar-container-"] > [class*="nav-tab-button-container-"] > [class*="label-"],
    html.lumen nav[class*="vertical-nav-bar-container-"] > .lm-search-tab > span { display: none !important; }
    html.lumen nav[class*="horizontal-nav-bar-container-"] > [class*="logo-container-"] { justify-content: center !important; padding: 0 !important; }
    html.lumen [class*="board-content-"]:not([class*="board-content-container-"]) > [class*="board-row-"] { padding: 0 1.5rem !important; }
    html.lumen .lm-hero-content { left: 1.5rem; width: min(30rem, 80%); }
  }

  @media (prefers-reduced-motion: reduce) {
    html.lumen .lm-hero-bg.lm-on { animation: none; transform: none; }
    html.lumen .lm-hero-content, html.lumen [class*="poster-container-"] { transition: none !important; }
  }
  `;

  function addStyles() {
    if (document.getElementById("lumen-styles")) return;
    const style = document.createElement("style");
    style.id = "lumen-styles";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
    html.classList.add("lumen");
  }

  // ---------------------------------------------------------------------------
  // Metadata (Cinemeta) with a small persistent cache and a 4-request limit
  // ---------------------------------------------------------------------------
  let store = {};
  try {
    store = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch (e) {
    store = {};
  }
  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const keys = Object.keys(store);
        if (keys.length > 300) {
          keys.sort((a, b) => store[a].t - store[b].t).slice(0, keys.length - 300).forEach((k) => delete store[k]);
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(store));
      } catch (e) {}
    }, 600);
  }

  let active = 0;
  const waiting = [];
  function limited(task) {
    return new Promise((resolve) => {
      const run = () => {
        active++;
        task()
          .then(resolve, () => resolve(null))
          .finally(() => {
            active--;
            const next = waiting.shift();
            if (next) next();
          });
      };
      if (active < 4) run();
      else waiting.push(run);
    });
  }

  const inflight = new Map();
  function getMeta(type, id) {
    if (!/^(movie|series)$/.test(type || "") || !/^tt\d+$/.test(id || "")) return Promise.resolve(null);
    const key = type + ":" + id;
    const hit = store[key];
    if (hit && Date.now() - hit.t < (hit.d ? HIT_TTL : MISS_TTL)) return Promise.resolve(hit.d);
    if (inflight.has(key)) return inflight.get(key);
    const p = limited(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const resp = await fetch(META_API + type + "/" + id + ".json", { signal: ctrl.signal });
        if (!resp.ok) {
          store[key] = { t: Date.now(), d: null };
          persist();
          return null;
        }
        const json = await resp.json();
        const m = json && json.meta;
        const d = m
          ? {
              name: m.name || "",
              background: m.background || "",
              logo: m.logo || "",
              description: m.description || "",
              genres: Array.isArray(m.genres) ? m.genres.slice(0, 2) : [],
              releaseInfo: String(m.releaseInfo || m.year || ""),
              runtime: String(m.runtime || ""),
              imdbRating: String(m.imdbRating || ""),
            }
          : null;
        store[key] = { t: Date.now(), d };
        persist();
        return d;
      } finally {
        clearTimeout(timer);
      }
    }).then((d) => {
      inflight.delete(key);
      return d;
    });
    inflight.set(key, p);
    return p;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(false);
      const img = new Image();
      const timer = setTimeout(() => resolve(false), 10000);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img.naturalWidth > 0);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      img.src = src;
    });
  }

  // ---------------------------------------------------------------------------
  // Reading Stremio's board
  // ---------------------------------------------------------------------------
  const cssUrl = (u) => 'url("' + String(u).replace(/["\\\n]/g, encodeURIComponent) + '")';
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function rowTitle(row) {
    const t = row && row.querySelector('[class*="title-container-"]');
    return t ? t.textContent.trim() : "";
  }
  const cleanRowTitle = (t) => t.replace(/\s+-\s+(movie|series|channel|tv|anime)s?$/i, "").trim();

  function parseLink(a, row) {
    if (!a) return null;
    const href = a.getAttribute("href") || "";
    let type = "";
    let id = "";
    const m = href.match(/#\/(?:detail|metadetails)\/([^/?#]+)\/([^/?#]+)/);
    if (m) {
      try {
        type = decodeURIComponent(m[1]);
        id = decodeURIComponent(m[2]);
      } catch (e) {}
    }
    if (!id && a.id) id = a.id;
    if (!type && row) {
      const t = rowTitle(row).toLowerCase();
      if (/\bseries\b|\bshows?\b|\banime\b/.test(t)) type = "series";
      else if (/\bmovies?\b/.test(t)) type = "movie";
    }
    const img = a.querySelector("img");
    const label = a.querySelector('[class*="title-label-"]');
    return {
      type,
      id,
      href: m ? href : type && id ? "#/detail/" + type + "/" + encodeURIComponent(id) : "",
      poster: img ? img.currentSrc || img.src : "",
      name: label ? label.textContent.trim() : "",
    };
  }

  // ---------------------------------------------------------------------------
  // Sidebar: labels, "Home", and a Search item
  // ---------------------------------------------------------------------------
  function decorateNav() {
    document.querySelectorAll('nav[class*="vertical-nav-bar-container-"]').forEach((nav) => {
      nav.querySelectorAll('[class*="nav-tab-button-container-"] > [class*="label-"]').forEach((label) => {
        if (label.textContent.trim() === "Board" && label.getAttribute("data-lm-text") !== CONFIG.homeLabel) {
          label.setAttribute("data-lm-text", CONFIG.homeLabel);
        }
      });
      if (!nav.querySelector(":scope > .lm-search-tab")) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lm-search-tab";
        btn.setAttribute("data-lm-own", "");
        btn.innerHTML = ICONS.search + "<span>Search</span>";
        btn.addEventListener("click", openSearch);
        nav.insertBefore(btn, nav.firstChild);
      }
      const tab = nav.querySelector(":scope > .lm-search-tab");
      tab.classList.toggle("lm-on", /^#\/search/.test(location.hash));
    });
  }

  function openSearch() {
    const field = document.querySelector('nav[class*="horizontal-nav-bar-container-"] [class*="search-bar-container-"] [class*="search-input-"]');
    if (field) {
      field.click();
      const input = field.querySelector("input") || (field.tagName === "INPUT" ? field : null);
      if (input) input.focus();
      return;
    }
    location.hash = "#/search";
  }

  // ---------------------------------------------------------------------------
  // Hero billboard
  // ---------------------------------------------------------------------------
  let hero = null;
  let slides = [];
  let current = 0;
  let flip = 0;
  let timer = 0;
  let building = false;
  let lastBuild = 0;
  let paused = false;

  async function buildSlides(board) {
    building = true;
    lastBuild = Date.now();
    try {
      const rows = [...board.querySelectorAll('[class*="board-row-"]')].filter(
        (r) => !/continue-watching-row-/.test(r.className) && r.querySelector('a[class*="meta-item-link-"]')
      );
      const priority = (r) => (/trending|popular|top|featured/i.test(rowTitle(r)) ? 0 : 1);
      rows.sort((a, b) => priority(a) - priority(b));
      const lists = rows.map((r) =>
        [...r.querySelectorAll('a[class*="meta-item-link-"]')].slice(0, 4).map((a) => {
          const item = parseLink(a, r);
          item.kicker = cleanRowTitle(rowTitle(r));
          return item;
        })
      );
      // Take one title from each row in turn, so the billboard mixes rows.
      const picks = [];
      const seen = new Set();
      for (let i = 0; i < 4; i++) {
        lists.forEach((list) => {
          const c = list[i];
          if (c && c.id && c.href && !seen.has(c.id)) {
            seen.add(c.id);
            picks.push(c);
          }
        });
      }
      const pool = picks.slice(0, 14);
      const metas = await Promise.all(pool.map((c) => getMeta(c.type, c.id)));
      const withArt = [];
      metas.forEach((m, i) => {
        if (m && m.background && withArt.length < CONFIG.heroSlides + 2) withArt.push(Object.assign({}, pool[i], { meta: m }));
      });
      const loaded = await Promise.all(withArt.map((s) => loadImage(s.meta.background)));
      slides = withArt.filter((_, i) => loaded[i]).slice(0, CONFIG.heroSlides);
    } catch (e) {
      console.warn("[Lumen] hero build failed", e);
      slides = [];
    } finally {
      building = false;
    }
    schedule();
  }

  function createHero() {
    const el = document.createElement("section");
    el.className = "lm-hero";
    el.setAttribute("data-lm-own", "");
    el.setAttribute("aria-roledescription", "carousel");
    el.setAttribute("aria-label", "Featured");
    el.style.setProperty("--lm-hero-ms", CONFIG.heroInterval + "ms");
    el.innerHTML = `
      <div class="lm-hero-bg"></div><div class="lm-hero-bg"></div>
      <div class="lm-hero-shade"></div>
      <div class="lm-hero-content">
        <div class="lm-hero-kicker"></div>
        <div class="lm-hero-brand"></div>
        <div class="lm-hero-meta"></div>
        <p class="lm-hero-desc"></p>
        <div class="lm-hero-actions"><a class="lm-btn lm-btn-primary" data-lm-play>${ICONS.play}<span>Play</span></a></div>
      </div>
      <button type="button" class="lm-hero-arrow lm-prev" aria-label="Previous title">${ICONS.left}</button>
      <button type="button" class="lm-hero-arrow lm-next" aria-label="Next title">${ICONS.right}</button>
      <div class="lm-hero-dots" role="tablist"></div>`;

    const dots = el.querySelector(".lm-hero-dots");
    slides.forEach((s, i) => {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "lm-hero-dot";
      d.setAttribute("role", "tab");
      d.setAttribute("aria-label", "Show " + (s.meta.name || s.name || "title " + (i + 1)));
      d.addEventListener("click", () => show(i));
      dots.appendChild(d);
    });
    if (slides.length < 2) {
      dots.style.display = "none";
      el.querySelectorAll(".lm-hero-arrow").forEach((b) => (b.style.display = "none"));
    }

    el.querySelector(".lm-prev").addEventListener("click", () => show(current - 1));
    el.querySelector(".lm-next").addEventListener("click", () => show(current + 1));
    el.addEventListener("mouseenter", () => {
      paused = true;
      el.classList.add("lm-paused");
      clearTimeout(timer);
    });
    el.addEventListener("mouseleave", () => {
      paused = false;
      el.classList.remove("lm-paused");
      restartDot();
      queueNext();
    });
    hero = el;
    show(0, true);
    return el;
  }

  function restartDot() {
    if (!hero) return;
    const dot = hero.querySelectorAll(".lm-hero-dot")[current];
    if (!dot) return;
    dot.classList.remove("lm-active");
    void dot.offsetWidth;
    dot.classList.add("lm-active");
  }

  function show(index, instant) {
    if (!hero || !slides.length) return;
    current = (index + slides.length) % slides.length;
    const s = slides[current];
    const m = s.meta;

    const layers = hero.querySelectorAll(".lm-hero-bg");
    flip = instant ? 0 : 1 - flip;
    const next = layers[flip];
    const prev = layers[1 - flip];
    next.style.backgroundImage = cssUrl(m.background);
    next.classList.remove("lm-on");
    void next.offsetWidth;
    next.classList.add("lm-on");
    prev.classList.remove("lm-on");

    hero.querySelectorAll(".lm-hero-dot").forEach((d, i) => {
      d.classList.toggle("lm-active", i === current);
      d.setAttribute("aria-selected", i === current ? "true" : "false");
    });
    restartDot();

    const content = hero.querySelector(".lm-hero-content");
    const fill = () => {
      hero.querySelector(".lm-hero-kicker").textContent = s.kicker || "";
      const brand = hero.querySelector(".lm-hero-brand");
      const name = m.name || s.name || "";
      if (m.logo) {
        brand.innerHTML = `<img class="lm-hero-logo" alt="${esc(name)}" src="${esc(m.logo)}">`;
        const img = brand.querySelector("img");
        img.addEventListener("error", () => {
          brand.innerHTML = `<h1 class="lm-hero-title">${esc(name)}</h1>`;
        });
      } else {
        brand.innerHTML = `<h1 class="lm-hero-title">${esc(name)}</h1>`;
      }
      const bits = [];
      bits.push(s.type === "series" ? "Series" : "Movie");
      if (m.genres && m.genres.length) bits.push(esc(m.genres.join(", ")));
      if (m.releaseInfo) bits.push(esc(m.releaseInfo));
      if (m.runtime) bits.push(esc(m.runtime));
      let meta = bits.map((b) => "<span>" + b + "</span>").join('<span class="lm-sep">·</span>');
      if (m.imdbRating) meta += '<span class="lm-sep">·</span><span class="lm-imdb"><b>IMDb</b>' + esc(m.imdbRating) + "</span>";
      hero.querySelector(".lm-hero-meta").innerHTML = meta;
      hero.querySelector(".lm-hero-desc").textContent = m.description || "";
      const play = hero.querySelector("[data-lm-play]");
      play.setAttribute("href", s.href);
      play.setAttribute("aria-label", "Play " + name);
    };

    if (instant) {
      fill();
    } else {
      content.classList.add("lm-swap");
      setTimeout(() => {
        fill();
        content.classList.remove("lm-swap");
      }, 260);
    }
    queueNext();
  }

  function queueNext() {
    clearTimeout(timer);
    if (paused || slides.length < 2 || document.hidden) return;
    timer = setTimeout(() => {
      if (!hero || !hero.isConnected) return; // left Home: stop until we come back
      show(current + 1);
    }, CONFIG.heroInterval);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else if (hero && hero.isConnected) {
      restartDot();
      queueNext();
    }
  });

  function ensureHero() {
    if (!CONFIG.hero) return;
    const board = document.querySelector('[class*="board-content-"]:not([class*="board-content-container-"])');
    if (!board) return;
    if (!slides.length) {
      board.removeAttribute("data-lm-hero");
      const ready = board.querySelector('[class*="board-row-"] a[class*="meta-item-link-"]');
      if (ready && !building && Date.now() - lastBuild > 60000) buildSlides(board);
      return;
    }
    const fresh = !hero;
    if (!hero) createHero();
    if (board.firstElementChild !== hero) {
      board.insertBefore(hero, board.firstChild);
      if (!fresh) {
        restartDot();
        queueNext();
      }
    }
    if (!board.hasAttribute("data-lm-hero")) board.setAttribute("data-lm-hero", "");
  }

  // ---------------------------------------------------------------------------
  // Continue watching backdrops
  // ---------------------------------------------------------------------------
  function decorateContinueWatching() {
    if (!CONFIG.continueWatchingBackdrops) return;
    document.querySelectorAll('[class*="continue-watching-row-"] [class*="meta-item-container-"]').forEach((item) => {
      const poster = item.querySelector('[class*="poster-container-"]');
      if (!poster || poster.querySelector(":scope > .lm-cw-art")) return;
      const link = item.querySelector('a[class*="meta-item-link-"]');
      const info = parseLink(link, item.closest('[class*="board-row-"]'));
      const art = document.createElement("div");
      art.className = "lm-cw-art lm-poster";
      art.setAttribute("data-lm-own", "");
      if (info && info.poster) art.style.backgroundImage = cssUrl(info.poster);
      poster.appendChild(art);
      if (!info) return;
      getMeta(info.type, info.id).then((m) => {
        if (!m || !m.background || !art.isConnected) return;
        loadImage(m.background).then((ok) => {
          if (!ok || !art.isConnected) return;
          art.style.backgroundImage = cssUrl(m.background);
          art.classList.remove("lm-poster");
          if (m.logo && !art.querySelector(".lm-cw-logo")) {
            const logo = document.createElement("img");
            logo.className = "lm-cw-logo";
            logo.alt = "";
            logo.src = m.logo;
            logo.addEventListener("error", () => logo.remove());
            art.appendChild(logo);
          }
        });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Rank numbers on "Top ..." rows
  // ---------------------------------------------------------------------------
  function decorateRanks() {
    if (!CONFIG.rankNumbers) return;
    document.querySelectorAll('[class*="board-row-"]').forEach((row) => {
      if (/continue-watching-row-/.test(row.className) || !/^top\s*\d+/i.test(rowTitle(row))) return;
      row.querySelectorAll('[class*="meta-item-container-"]').forEach((item, i) => {
        const poster = item.querySelector('[class*="poster-container-"]');
        if (!poster) return;
        let rank = poster.querySelector(":scope > .lm-rank");
        if (!rank) {
          rank = document.createElement("span");
          rank.className = "lm-rank";
          rank.setAttribute("data-lm-own", "");
          rank.setAttribute("aria-hidden", "true");
          poster.appendChild(rank);
        }
        const n = String(i + 1);
        if (rank.textContent !== n) rank.textContent = n;
      });
    });
  }


  // ---------------------------------------------------------------------------
  // Detail page: tag blocks so the Apple TV layout can arrange them
  // ---------------------------------------------------------------------------
  function decorateDetail() {
    document.querySelectorAll('[class*="metadetails-content-"]').forEach((content) => {
      const mode = content.querySelector(':scope > [class*="videos-list-container-"]')
        ? "episodes"
        : content.querySelector(':scope > [class*="streams-list-container-"]')
          ? "streams"
          : "info";
      if (content.getAttribute("data-lm-mode") !== mode) content.setAttribute("data-lm-mode", mode);

      content.querySelectorAll('[class*="meta-info-container-"] > [class*="meta-links-container-"]').forEach((block) => {
        const label = block.querySelector(':scope > [class*="label-container-"]');
        const text = label ? label.textContent.trim().toLowerCase() : "";
        const kind = /genre/.test(text) ? "genres" : /cast|starring/.test(text) ? "cast" : /director/.test(text) ? "directors" : /writer/.test(text) ? "writers" : "other";
        if (block.getAttribute("data-lm-kind") !== kind) block.setAttribute("data-lm-kind", kind);
        if (!label) return;
        const count = block.querySelectorAll('a[class*="link-container-"]').length;
        const nice = { cast: "Starring", directors: count > 1 ? "Directors" : "Director", writers: count > 1 ? "Writers" : "Writer" }[kind];
        if (nice && label.getAttribute("data-lm-text") !== nice) label.setAttribute("data-lm-text", nice);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Main loop: react to Stremio re-rendering, but ignore our own changes
  // ---------------------------------------------------------------------------
  let queued = false;
  function tick() {
    queued = false;
    try {
      decorateNav();
      ensureHero();
      decorateContinueWatching();
      decorateRanks();
      decorateDetail();
    } catch (e) {
      console.error("[Lumen]", e);
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(tick);
  }

  const isOurs = (node) => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest && el.closest("[data-lm-own]"));
  };

  // Frost the top bar once the page under it scrolls.
  function onScroll(e) {
    const el = e.target;
    if (!el || el.nodeType !== 1 || !el.closest('[class*="nav-content-container-"]')) return;
    const scrolled = el.scrollTop > 8;
    if (scrolled !== html.hasAttribute("data-lm-scrolled")) html.toggleAttribute("data-lm-scrolled", scrolled);
  }

  function start() {
    addStyles();
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("hashchange", () => html.removeAttribute("data-lm-scrolled"));
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (isOurs(m.target)) continue;
        const added = [...m.addedNodes].some((n) => !isOurs(n));
        const removed = [...m.removedNodes].some((n) => !(n.nodeType === 1 && n.hasAttribute && n.hasAttribute("data-lm-own")));
        if (added || removed) return schedule();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hashchange", schedule);
    schedule();
    console.log("[Lumen] v1.1.0 loaded");
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
