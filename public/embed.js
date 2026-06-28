/**
 * illuxus event embed widget  v2
 *
 * Usage:
 *   <div id="my-events"></div>
 *   <script
 *     src="https://illuxus.com/embed.js"
 *     data-org="your-org-slug"
 *     data-fn="https://<project>.supabase.co/functions/v1/org-events"
 *     data-anon-key="<supabase-anon-key>"
 *     data-target="my-events"
 *     data-filter="upcoming"
 *     data-limit="9"
 *     data-theme="light"
 *   ></script>
 *
 * Responsive grid:
 *   Desktop (≥900px) → 3 cards per row
 *   Tablet  (≥540px) → 2 cards per row
 *   Mobile  (<540px) → 1 card per row
 */
(function () {
  "use strict";

  /* ─── config ──────────────────────────────────────────────── */
  var currentScript = document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();

  if (!currentScript) return;

  var apiBase    = currentScript.getAttribute("data-api") ||
                   currentScript.src.split("/embed.js")[0];
  var orgSlug    = currentScript.getAttribute("data-org");
  var filter     = currentScript.getAttribute("data-filter")   || "upcoming";
  var limit      = currentScript.getAttribute("data-limit")    || "9";
  var theme      = currentScript.getAttribute("data-theme")    || "light";
  var targetId   = currentScript.getAttribute("data-target");
  var supabaseFn = currentScript.getAttribute("data-fn");
  var anonKey    = currentScript.getAttribute("data-anon-key") || "";

  if (!orgSlug || !supabaseFn) {
    /* eslint-disable no-console */
    console.warn("[illuxus-embed] Missing data-org or data-fn attribute.");
    return;
  }

  /* ─── container ───────────────────────────────────────────── */
  var container = targetId ? document.getElementById(targetId) : null;
  if (!container) {
    container = document.createElement("div");
    currentScript.parentNode.insertBefore(container, currentScript);
  }
  container.setAttribute("data-illuxus-embed", "true");

  /* ─── styles ──────────────────────────────────────────────── */
  var STYLE_ID = "illuxus-embed-css-v2";
  if (!document.getElementById(STYLE_ID)) {
    var css = document.createElement("style");
    css.id = STYLE_ID;
    css.textContent = [
      /* reset & font */
      "[data-illuxus-embed]{",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;",
        "box-sizing:border-box;-webkit-font-smoothing:antialiased;",
      "}",
      "[data-illuxus-embed]*{box-sizing:border-box;margin:0;padding:0;}",

      /* responsive grid — container query polyfill via plain media query wrapping
         the container-level width using a CSS custom-property trick is not needed
         here; we rely on the viewport width which is standard and sufficient. */
      "[data-illuxus-embed] .ee-grid{",
        "display:grid;",
        "grid-template-columns:repeat(3,1fr);",   /* desktop: 3 col */
        "gap:20px;",
        "padding:4px 2px;",
      "}",
      "@media(max-width:899px){",
        "[data-illuxus-embed] .ee-grid{grid-template-columns:repeat(2,1fr);}",  /* tablet: 2 col */
      "}",
      "@media(max-width:539px){",
        "[data-illuxus-embed] .ee-grid{grid-template-columns:1fr;}",             /* mobile: 1 col */
      "}",

      /* card */
      "[data-illuxus-embed] .ee-card{",
        "display:flex;flex-direction:column;",
        "border-radius:12px;overflow:hidden;",
        "text-decoration:none;color:inherit;",
        "background:#ffffff;",
        "border:1px solid #e5e7eb;",
        "transition:transform .15s ease,box-shadow .15s ease;",
      "}",
      "[data-illuxus-embed] .ee-card:hover{",
        "transform:translateY(-3px);",
        "box-shadow:0 10px 30px rgba(0,0,0,.08);",
      "}",

      /* dark theme card */
      "[data-illuxus-embed][data-theme=dark] .ee-card{",
        "background:#1f2937;border-color:#374151;color:#f3f4f6;",
      "}",

      /* 16:9 thumbnail */
      "[data-illuxus-embed] .ee-thumb{",
        "position:relative;width:100%;",
        "padding-top:56.25%;",  /* 9/16 = 56.25% */
        "background:#f3f4f6;overflow:hidden;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .ee-thumb{background:#374151;}",
      "[data-illuxus-embed] .ee-thumb img{",
        "position:absolute;inset:0;width:100%;height:100%;",
        "object-fit:cover;display:block;",
      "}",
      "[data-illuxus-embed] .ee-thumb-placeholder{",
        "position:absolute;inset:0;",
        "display:flex;align-items:center;justify-content:center;",
      "}",
      "[data-illuxus-embed] .ee-thumb-placeholder svg{opacity:.3;}",

      /* card body */
      "[data-illuxus-embed] .ee-body{",
        "padding:14px 16px 16px;",
        "display:flex;flex-direction:column;flex:1;",
      "}",
      "[data-illuxus-embed] .ee-date{",
        "font-size:11px;font-weight:700;",
        "text-transform:uppercase;letter-spacing:.07em;",
        "color:#6366f1;margin-bottom:6px;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .ee-date{color:#818cf8;}",
      "[data-illuxus-embed] .ee-title{",
        "font-size:14px;font-weight:600;line-height:1.35;",
        "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;",
        "margin-bottom:8px;",
      "}",
      "[data-illuxus-embed] .ee-meta{",
        "font-size:12px;color:#6b7280;",
        "display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;",
        "margin-top:auto;padding-top:6px;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .ee-meta{color:#9ca3af;}",

      /* price badge */
      "[data-illuxus-embed] .ee-price{",
        "display:inline-block;margin-top:8px;",
        "font-size:11px;font-weight:700;",
        "padding:2px 8px;border-radius:999px;",
        "background:#f3f4f6;color:#374151;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .ee-price{background:#374151;color:#e5e7eb;}",
      "[data-illuxus-embed] .ee-price.free{background:#d1fae5;color:#065f46;}",
      "[data-illuxus-embed][data-theme=dark] .ee-price.free{background:#064e3b;color:#6ee7b7;}",

      /* states */
      "[data-illuxus-embed] .ee-loading,",
      "[data-illuxus-embed] .ee-empty{",
        "padding:36px 24px;text-align:center;",
        "font-size:13px;color:#6b7280;",
        "border:1px dashed #e5e7eb;border-radius:12px;",
      "}",
      "[data-illuxus-embed][data-theme=dark] .ee-loading,",
      "[data-illuxus-embed][data-theme=dark] .ee-empty{",
        "color:#9ca3af;border-color:#374151;",
      "}",

      /* branded footer */
      "[data-illuxus-embed] .ee-footer{",
        "margin-top:14px;text-align:right;",
        "font-size:10px;color:#9ca3af;",
      "}",
      "[data-illuxus-embed] .ee-footer a{color:inherit;text-decoration:none;}",
      "[data-illuxus-embed] .ee-footer a:hover{text-decoration:underline;}",
    ].join("");
    document.head.appendChild(css);
  }

  /* ─── apply theme ─────────────────────────────────────────── */
  container.setAttribute("data-theme", theme);

  /* ─── loading state ───────────────────────────────────────── */
  container.innerHTML = '<div class="ee-loading">Loading events…</div>';

  /* ─── fetch ───────────────────────────────────────────────── */
  var endpoint = supabaseFn +
    "?org="    + encodeURIComponent(orgSlug) +
    "&filter=" + encodeURIComponent(filter) +
    "&limit="  + encodeURIComponent(limit);

  var fetchInit = { method: "GET" };
  if (anonKey) {
    fetchInit.headers = {
      "Authorization": "Bearer " + anonKey,
      "apikey": anonKey,
    };
  }

  fetch(endpoint, fetchInit)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.events) || data.events.length === 0) {
        container.innerHTML =
          '<div class="ee-empty">No ' + escH(filter) + ' events found.</div>';
        return;
      }

      var orgPathSlug = (data.org && (data.org.subdomain || data.org.slug)) || orgSlug;

      /* ── build HTML ── */
      var cards = data.events.map(function (e) {
        /* date label */
        var dateLabel = "";
        try {
          dateLabel = new Date(e.date).toLocaleDateString(undefined, {
            weekday: "short", month: "short", day: "numeric", year: "numeric",
          });
        } catch (_) { dateLabel = e.date || ""; }

        /* location */
        var loc = [e.venue, e.location].filter(Boolean).join(" · ");

        /* price badge */
        var price = Number(e.price) || 0;
        var priceBadge = price > 0
          ? '<span class="ee-price">₹' + price.toLocaleString() + '</span>'
          : '<span class="ee-price free">Free</span>';

        /* thumbnail — prefer banner_landscape_url (16:9) then image_url */
        var imgSrc = e.banner_landscape_url || e.image_url || "";
        var thumb = imgSrc
          ? '<div class="ee-thumb"><img src="' + escH(imgSrc) + '" alt="" loading="lazy"/></div>'
          : '<div class="ee-thumb"><div class="ee-thumb-placeholder">' +
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">' +
            '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
            '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>' +
            '<line x1="3" y1="10" x2="21" y2="10"/>' +
            '</svg></div></div>';

        /* card URL */
        var id = e.slug || e.id;
        var url = (orgPathSlug
          ? (apiBase || "") + "/org/" + encodeURIComponent(orgPathSlug) + "/events/" + encodeURIComponent(id)
          : (apiBase || "") + "/events/" + encodeURIComponent(id));

        return [
          '<a class="ee-card" href="' + escH(url) + '" target="_blank" rel="noopener noreferrer">',
            thumb,
            '<div class="ee-body">',
              '<div class="ee-date">' + escH(dateLabel) + '</div>',
              '<div class="ee-title">' + escH(e.title) + '</div>',
              priceBadge,
              (loc ? '<div class="ee-meta">📍 ' + escH(loc) + '</div>' : ''),
            '</div>',
          '</a>',
        ].join("");
      }).join("");

      container.innerHTML =
        '<div class="ee-grid">' + cards + '</div>' +
        '<div class="ee-footer">Powered by <a href="https://illuxus.com" target="_blank" rel="noopener">illuxus</a></div>';
    })
    .catch(function (err) {
      container.innerHTML = '<div class="ee-empty">Could not load events. Please try again later.</div>';
      console.warn("[illuxus-embed] fetch error:", err);
    });

  /* ─── helpers ─────────────────────────────────────────────── */
  function escH(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
