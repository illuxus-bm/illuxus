/**
 * illuxus event embed widget  v3.0
 *
 * Usage:
 *   <div
 *     id="my-events"
 *     data-org="your-org-slug"
 *     data-filter="upcoming"
 *     data-theme="auto"
 *   ></div>
 *   <script src="https://illuxus.com/embed.js"></script>
 *
 * data-* attributes (all optional except data-org):
 *   data-org      — org slug (required)
 *   data-filter   — "upcoming" | "past" | "all"  (default: "upcoming")
 *   data-theme    — "auto" | "light" | "dark"     (default: "auto")
 *   data-api      — override API base URL          (default: script origin)
 *
 * Responsive grid:
 *   Desktop (≥900px) → 3 columns
 *   Tablet  (≥540px) → 2 columns
 *   Mobile  (<540px) → 1 column
 */
(function () {
  "use strict";

  /* ─────────────────────────────────────────────────────────────────────────
     1. Locate the script element that loaded this file.
     document.currentScript is null in sandboxed iframes and some defer/async
     scenarios, so we fall back to scanning by src pattern.
  ───────────────────────────────────────────────────────────────────────── */
  var scriptEl = null;
  try { scriptEl = document.currentScript; } catch (_) {}
  if (!scriptEl) {
    var allScripts = document.getElementsByTagName("script");
    for (var si = 0; si < allScripts.length; si++) {
      if ((allScripts[si].src || "").indexOf("embed.js") !== -1) {
        scriptEl = allScripts[si];
        break;
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     2. Read configuration — from script tag attrs, then from the target div.
  ───────────────────────────────────────────────────────────────────────── */
  function attr(el, name, fallback) {
    return (el && el.getAttribute(name)) || fallback || "";
  }

  var targetId  = attr(scriptEl, "data-target", "");
  var targetDiv = (targetId ? document.getElementById(targetId) : null)
               || document.querySelector("[data-org]");

  function getConf(key, def) {
    return attr(scriptEl, "data-" + key, "")
        || attr(targetDiv, "data-" + key, "")
        || def || "";
  }

  /* Derive API base from the script's own src so self-hosted deployments
     work without any extra config. Falls back to the canonical origin.    */
  var apiBase = getConf("api",
    scriptEl
      ? scriptEl.src.replace(/\/embed\.js.*$/, "")
      : "https://illuxus.com"
  );

  var orgSlug   = getConf("org",    "");
  var filter    = getConf("filter", "upcoming");
  var limit     = getConf("limit",  "100");
  var themePref = getConf("theme",  "auto");

  if (!orgSlug) {
    console.warn(
      "[illuxus-embed] Missing data-org attribute.\n" +
      "Add data-org=\"your-org-slug\" to your <div>."
    );
    return;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     3. Resolve (or create) the container element.
  ───────────────────────────────────────────────────────────────────────── */
  var container = targetDiv;
  if (!container) {
    container = document.createElement("div");
    if (scriptEl && scriptEl.parentNode) {
      scriptEl.parentNode.insertBefore(container, scriptEl);
    } else {
      document.body.appendChild(container);
    }
  }
  container.setAttribute("data-illuxus-embed", "true");

  /* ─────────────────────────────────────────────────────────────────────────
     4. Theme — OS auto-detection, respects data-theme override, live updates.
  ───────────────────────────────────────────────────────────────────────── */
  var mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme() {
    var resolved = themePref === "auto"
      ? (mq && mq.matches ? "dark" : "light")
      : themePref;
    container.setAttribute("data-theme", resolved);
  }

  applyTheme();

  if (themePref === "auto" && mq && mq.addEventListener) {
    mq.addEventListener("change", applyTheme);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     5. Styles — injected once per page under a versioned id so multiple
        embeds on the same page share a single <style> block.
  ───────────────────────────────────────────────────────────────────────── */
  if (!document.getElementById("illuxus-embed-css-v3")) {
    var style = document.createElement("style");
    style.id = "illuxus-embed-css-v3";
    style.textContent = [

      /* ── Design tokens ────────────────────────────────────────── */
      "[data-illuxus-embed]{",
        "--bg:#ffffff;",
        "--bg-card:#ffffff;",
        "--border:#e5e7eb;",
        "--text:#111827;",
        "--text-muted:#6b7280;",
        "--accent:#6366f1;",
        "--free-bg:#dcfce7;",
        "--free-text:#15803d;",
        "--radius:16px;",
        "--shadow-hover:0 16px 40px rgba(0,0,0,.12);",
      "}",

      "[data-illuxus-embed][data-theme=dark]{",
        "--bg:#0f1117;",
        "--bg-card:#1e2433;",
        "--border:#2d3748;",
        "--text:#f1f5f9;",
        "--text-muted:#94a3b8;",
        "--accent:#818cf8;",
        "--free-bg:#14532d;",
        "--free-text:#86efac;",
        "--shadow-hover:0 16px 40px rgba(0,0,0,.5);",
      "}",

      /* ── Base reset ───────────────────────────────────────────── */
      "[data-illuxus-embed]{",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;",
        "box-sizing:border-box;",
        "-webkit-font-smoothing:antialiased;",
        "background:var(--bg);",
        "color:var(--text);",
      "}",
      "[data-illuxus-embed] *{box-sizing:border-box;margin:0;padding:0;}",

      /* ── Wrapper (needed for pinned footer) ───────────────────── */
      "[data-illuxus-embed] .eix-wrap{position:relative;padding-bottom:28px;}",

      /* ── Responsive grid ──────────────────────────────────────── */
      "[data-illuxus-embed] .eix-grid{",
        "display:grid;",
        "grid-template-columns:repeat(3,1fr);",
        "gap:20px;",
        "padding:4px 0;",
      "}",
      "@media(max-width:899px){[data-illuxus-embed] .eix-grid{grid-template-columns:repeat(2,1fr);}}",
      "@media(max-width:539px){[data-illuxus-embed] .eix-grid{grid-template-columns:1fr;}}",

      /* ── Card entrance animation ──────────────────────────────── */
      "@keyframes eix-rise{",
        "from{opacity:0;transform:translateY(18px);}",
        "to{opacity:1;transform:translateY(0);}",
      "}",

      /* ── Card ─────────────────────────────────────────────────── */
      "[data-illuxus-embed] .eix-card{",
        "display:flex;",
        "flex-direction:column;",
        "border-radius:var(--radius);",
        "overflow:hidden;",
        "text-decoration:none;",
        "color:var(--text);",
        "background:var(--bg-card);",
        "border:1px solid var(--border);",
        "transition:transform .2s ease,box-shadow .2s ease;",
        "opacity:0;",
        "animation:eix-rise .45s ease forwards;",
      "}",
      "[data-illuxus-embed] .eix-card:hover{",
        "transform:translateY(-4px);",
        "box-shadow:var(--shadow-hover);",
      "}",
      "[data-illuxus-embed] .eix-card:focus-visible{",
        "outline:2px solid var(--accent);",
        "outline-offset:3px;",
      "}",

      /* ── 16:9 thumbnail ───────────────────────────────────────── */
      "[data-illuxus-embed] .eix-thumb{",
        "position:relative;",
        "width:100%;",
        "padding-top:56.25%;",
        "background:#e5e7eb;",
        "overflow:hidden;",
        "flex-shrink:0;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .eix-thumb{background:#2d3748;}",

      /* Image: starts invisible, fades in on load */
      "[data-illuxus-embed] .eix-thumb img{",
        "position:absolute;",
        "inset:0;",
        "width:100%;",
        "height:100%;",
        "object-fit:cover;",
        "display:block;",
        "opacity:0;",
        "transition:opacity .35s ease,transform .2s ease;",
      "}",
      "[data-illuxus-embed] .eix-thumb img.eix-loaded{opacity:1;}",
      "[data-illuxus-embed] .eix-card:hover .eix-thumb img{transform:scale(1.05);}",

      /* Placeholder icon when no banner */
      "[data-illuxus-embed] .eix-thumb-ph{",
        "position:absolute;",
        "inset:0;",
        "display:flex;",
        "align-items:center;",
        "justify-content:center;",
      "}",
      "[data-illuxus-embed] .eix-thumb-ph svg{opacity:.2;}",

      /* ── Date badge (top-left, frosted glass) ─────────────────── */
      "[data-illuxus-embed] .eix-date-badge{",
        "position:absolute;",
        "top:10px;",
        "left:10px;",
        "background:rgba(255,255,255,0.88);",
        "backdrop-filter:blur(6px);",
        "-webkit-backdrop-filter:blur(6px);",
        "border-radius:999px;",
        "padding:3px 10px;",
        "font-size:11px;",
        "font-weight:700;",
        "color:#111827;",
        "letter-spacing:.02em;",
        "white-space:nowrap;",
        "line-height:1.6;",
        "z-index:1;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .eix-date-badge{",
        "background:rgba(0,0,0,0.62);",
        "color:#f1f5f9;",
      "}",

      /* ── Card body ────────────────────────────────────────────── */
      "[data-illuxus-embed] .eix-body{",
        "padding:14px 16px 16px;",
        "display:flex;",
        "flex-direction:column;",
        "flex:1;",
        "gap:6px;",
      "}",

      /* Title — 2-line clamp */
      "[data-illuxus-embed] .eix-title{",
        "font-size:14px;",
        "font-weight:600;",
        "line-height:1.4;",
        "color:var(--text);",
        "overflow:hidden;",
        "display:-webkit-box;",
        "-webkit-line-clamp:2;",
        "-webkit-box-orient:vertical;",
      "}",

      /* Price badge row */
      "[data-illuxus-embed] .eix-price{",
        "display:inline-block;",
        "width:fit-content;",
        "font-size:11px;",
        "font-weight:700;",
        "padding:2px 10px;",
        "border-radius:999px;",
        "background:var(--accent);",
        "color:#ffffff;",
      "}",
      "[data-illuxus-embed] .eix-price.eix-free{",
        "background:var(--free-bg);",
        "color:var(--free-text);",
      "}",

      /* Location row */
      "[data-illuxus-embed] .eix-loc{",
        "display:flex;",
        "align-items:center;",
        "gap:4px;",
        "font-size:12px;",
        "color:var(--text-muted);",
        "margin-top:auto;",
        "overflow:hidden;",
        "white-space:nowrap;",
        "text-overflow:ellipsis;",
      "}",
      "[data-illuxus-embed] .eix-loc svg{",
        "flex-shrink:0;",
        "opacity:.7;",
      "}",
      "[data-illuxus-embed] .eix-loc span{",
        "overflow:hidden;",
        "text-overflow:ellipsis;",
        "white-space:nowrap;",
      "}",

      /* ── Skeleton loading cards ───────────────────────────────── */
      "@keyframes eix-pulse{",
        "0%,100%{opacity:1;}",
        "50%{opacity:.4;}",
      "}",
      "[data-illuxus-embed] .eix-skeleton{",
        "border-radius:var(--radius);",
        "overflow:hidden;",
        "border:1px solid var(--border);",
        "background:var(--bg-card);",
        "animation:eix-pulse 1.6s ease-in-out infinite;",
      "}",
      "[data-illuxus-embed] .eix-skel-thumb{",
        "width:100%;",
        "padding-top:56.25%;",
        "background:#e5e7eb;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .eix-skel-thumb{background:#2d3748;}",
      "[data-illuxus-embed] .eix-skel-body{padding:14px 16px 18px;display:flex;flex-direction:column;gap:10px;}",
      "[data-illuxus-embed] .eix-skel-line{",
        "height:12px;",
        "border-radius:6px;",
        "background:#e5e7eb;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .eix-skel-line{background:#2d3748;}",
      "[data-illuxus-embed] .eix-skel-line.w80{width:80%;}",
      "[data-illuxus-embed] .eix-skel-line.w55{width:55%;}",
      "[data-illuxus-embed] .eix-skel-line.w40{width:40%;}",

      /* ── Empty / error states ─────────────────────────────────── */
      "[data-illuxus-embed] .eix-state{",
        "padding:48px 24px;",
        "text-align:center;",
        "border:1.5px dashed var(--border);",
        "border-radius:var(--radius);",
        "display:flex;",
        "flex-direction:column;",
        "align-items:center;",
        "gap:12px;",
      "}",
      "[data-illuxus-embed] .eix-state svg{opacity:.35;}",
      "[data-illuxus-embed] .eix-state-title{",
        "font-size:14px;",
        "font-weight:600;",
        "color:var(--text);",
      "}",
      "[data-illuxus-embed] .eix-state-sub{",
        "font-size:12px;",
        "color:var(--text-muted);",
        "max-width:280px;",
      "}",

      /* ── Powered-by footer ────────────────────────────────────── */
      "[data-illuxus-embed] .eix-foot{",
        "position:absolute;",
        "bottom:0;",
        "right:0;",
        "display:flex;",
        "align-items:center;",
        "gap:3px;",
        "font-size:10px;",
        "color:var(--text-muted);",
        "user-select:none;",
      "}",
      "[data-illuxus-embed] .eix-foot a{",
        "color:var(--text-muted);",
        "text-decoration:none;",
        "font-weight:700;",
      "}",
      "[data-illuxus-embed] .eix-foot a:hover{text-decoration:underline;}",

    ].join("");
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     6. HTML helpers.
  ───────────────────────────────────────────────────────────────────────── */

  /* HTML-escape a value so it's safe to embed in attributes or text nodes. */
  function h(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Format a date string as "Jun 30" or "Dec 1". */
  function fmtDate(raw) {
    if (!raw) return "";
    try {
      return new Date(raw).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (_) {
      return raw;
    }
  }

  /* Pin icon SVG (inline, no external request). */
  var PIN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  /* Calendar icon SVG for empty/error states. */
  var CAL_SVG = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

  /* Powered-by footer markup (shared between all states). */
  var FOOT_HTML = '<div class="eix-foot">Powered by\u00a0<a href="https://illuxus.com" target="_blank" rel="noopener noreferrer">illuxus</a></div>';

  /* ─────────────────────────────────────────────────────────────────────────
     7. Skeleton placeholder (shown while fetching).
  ───────────────────────────────────────────────────────────────────────── */
  function skeletonCard() {
    return '<div class="eix-skeleton" role="presentation" aria-hidden="true">' +
      '<div class="eix-skel-thumb"></div>' +
      '<div class="eix-skel-body">' +
        '<div class="eix-skel-line w80"></div>' +
        '<div class="eix-skel-line w55"></div>' +
        '<div class="eix-skel-line w40"></div>' +
      '</div></div>';
  }

  container.innerHTML =
    '<div class="eix-wrap" role="status" aria-label="Loading events">' +
      '<div class="eix-grid">' +
        skeletonCard() + skeletonCard() + skeletonCard() +
      '</div>' +
      FOOT_HTML +
    '</div>';

  /* ─────────────────────────────────────────────────────────────────────────
     8. Fetch events and render.
  ───────────────────────────────────────────────────────────────────────── */
  var url = apiBase + "/api/widget" +
    "?org="    + encodeURIComponent(orgSlug) +
    "&filter=" + encodeURIComponent(filter)  +
    "&limit="  + encodeURIComponent(limit);

  fetch(url, { method: "GET" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      /* ── Empty state ────────────────────────────────────────── */
      if (!data || !Array.isArray(data.events) || data.events.length === 0) {
        container.innerHTML =
          '<div class="eix-wrap">' +
            '<div class="eix-state" role="status">' +
              CAL_SVG +
              '<div class="eix-state-title">No events found</div>' +
              '<div class="eix-state-sub">There are no ' + h(filter) + ' events right now. Check back soon.</div>' +
            '</div>' +
            FOOT_HTML +
          '</div>';
        return;
      }

      var orgHandle = (data.org && (data.org.subdomain || data.org.slug)) || orgSlug;

      /* ── Build card HTML ────────────────────────────────────── */
      var cards = data.events.map(function (ev, idx) {
        /* Date badge label */
        var dateBadge = fmtDate(ev.date || ev.start_date || ev.starts_at || "");

        /* Thumbnail */
        var imgSrc = ev.banner_landscape_url || ev.image_url || "";
        var thumbContent = imgSrc
          ? '<img src="' + h(imgSrc) + '" alt="" loading="lazy" />'
          : '<div class="eix-thumb-ph">' + CAL_SVG + '</div>';

        /* Price badge */
        var price = Number(ev.price);
        var priceBadge = (!price || price <= 0)
          ? '<span class="eix-price eix-free">Free</span>'
          : '<span class="eix-price">&#8377;' + price.toLocaleString() + '</span>';

        /* Location */
        var loc = [ev.venue, ev.location].filter(Boolean).join(" \u00b7 ");
        var locRow = loc
          ? '<div class="eix-loc">' + PIN_SVG + '<span>' + h(loc) + '</span></div>'
          : '';

        /* Event URL */
        var evSlug = ev.slug || ev.id || "";
        var href = apiBase + "/org/" + encodeURIComponent(orgHandle) + "/events/" + encodeURIComponent(evSlug);

        /* Staggered entrance: each card delayed by 60ms × index */
        var delay = (idx * 60) + "ms";

        return '<a class="eix-card" href="' + h(href) + '" target="_blank" rel="noopener noreferrer" style="animation-delay:' + delay + '">' +
          '<div class="eix-thumb">' +
            thumbContent +
            (dateBadge ? '<div class="eix-date-badge">' + h(dateBadge) + '</div>' : '') +
          '</div>' +
          '<div class="eix-body">' +
            '<div class="eix-title">' + h(ev.title) + '</div>' +
            priceBadge +
            locRow +
          '</div>' +
        '</a>';
      }).join("");

      container.innerHTML =
        '<div class="eix-wrap">' +
          '<div class="eix-grid" role="list" aria-label="Events">' + cards + '</div>' +
          FOOT_HTML +
        '</div>';

      /* Fade-in images after the DOM is ready */
      var imgs = container.querySelectorAll(".eix-thumb img");
      for (var i = 0; i < imgs.length; i++) {
        (function (img) {
          if (img.complete && img.naturalWidth > 0) {
            img.classList.add("eix-loaded");
          } else {
            img.addEventListener("load",  function () { img.classList.add("eix-loaded"); });
            img.addEventListener("error", function () { img.style.display = "none"; });
          }
        })(imgs[i]);
      }
    })
    .catch(function (err) {
      container.innerHTML =
        '<div class="eix-wrap">' +
          '<div class="eix-state" role="alert">' +
            CAL_SVG +
            '<div class="eix-state-title">Could not load events</div>' +
            '<div class="eix-state-sub">Something went wrong. Please try refreshing the page.</div>' +
          '</div>' +
          FOOT_HTML +
        '</div>';
      console.error("[illuxus-embed] Fetch error:", err.message || err);
    });

})();
