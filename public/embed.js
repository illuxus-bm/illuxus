/**
 * illuxus event embed widget  v2.1
 *
 * Usage — put config on the script tag OR on the target div:
 *
 *   <!-- Option A: config on script tag (standard) -->
 *   <div id="my-events"></div>
 *   <script
 *     src="https://illuxus.com/embed.js"
 *     data-org="bm"
 *     data-fn="https://PROJ.supabase.co/functions/v1/org-events"
 *     data-anon-key="YOUR_ANON_KEY"
 *     data-target="my-events"
 *     data-filter="upcoming"
 *     data-limit="9"
 *     data-theme="light"
 *   ></script>
 *
 *   <!-- Option B: config on the target div (works in sandboxed iframes) -->
 *   <div
 *     id="my-events"
 *     data-org="bm"
 *     data-fn="https://PROJ.supabase.co/functions/v1/org-events"
 *     data-anon-key="YOUR_ANON_KEY"
 *     data-filter="upcoming"
 *     data-limit="9"
 *     data-theme="light"
 *   ></div>
 *   <script src="https://illuxus.com/embed.js"></script>
 *
 * Responsive grid:
 *   Desktop (≥900px) → 3 cards per row
 *   Tablet  (≥540px) → 2 cards per row
 *   Mobile  (<540px) → 1 card per row
 */
(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────────
     1. Find the script tag that loaded us.
     document.currentScript is null in sandboxed iframes and when
     the script runs via defer — so we fall back to finding the
     <script src="…/embed.js"> tag by src pattern.
  ────────────────────────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────────────────────────
     2. Read config — from script tag first, then from the target
        div, then from a window.IlluxusEmbed global (last resort).
        This makes the widget work in sandboxed online editors where
        the script's data-* attributes are readable on the div.
  ────────────────────────────────────────────────────────────── */
  function attr(el, name, fallback) {
    return (el && el.getAttribute(name)) || fallback || "";
  }

  var targetId = attr(scriptEl, "data-target", "");
  /* Find the target div:
     1. explicit data-target id
     2. first div with data-org (new clean snippet format)             */
  var targetDiv = (targetId ? document.getElementById(targetId) : null) ||
                  document.querySelector("[data-org]");

  var cfg = window.IlluxusEmbed || {};
  function getConf(key, def) {
    return attr(scriptEl, "data-" + key, "") ||
           attr(targetDiv, "data-" + key, "") ||
           (cfg[key] || def || "");
  }

  /* apiBase is the only server config needed — everything else is handled
     server-side. Defaults to the origin the script was served from so
     self-hosted deployments work without any extra config.              */
  var apiBase = getConf("api", scriptEl
    ? scriptEl.src.replace(/\/embed\.js.*$/, "")
    : "https://illuxus.com");

  var orgSlug = getConf("org",    "");
  var filter  = getConf("filter", "upcoming");
  var limit   = getConf("limit",  "9");
  var theme   = getConf("theme",  "light");

  if (!orgSlug) {
    console.warn(
      "[illuxus-embed] Missing data-org attribute.\n" +
      "Add data-org=\"your-org-slug\" to your <div>."
    );
    return;
  }

  /* ──────────────────────────────────────────────────────────────
     3. Container — use targetDiv if found, else create one before
        the script tag, else append to body.
  ────────────────────────────────────────────────────────────── */
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
  container.setAttribute("data-theme", theme);

  /* ──────────────────────────────────────────────────────────────
     4. Styles — injected once per page.
  ────────────────────────────────────────────────────────────── */
  if (!document.getElementById("illuxus-embed-css")) {
    var s = document.createElement("style");
    s.id = "illuxus-embed-css";
    s.textContent = [
      /* base */
      "[data-illuxus-embed]{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;box-sizing:border-box;-webkit-font-smoothing:antialiased;}",
      "[data-illuxus-embed]*{box-sizing:border-box;margin:0;padding:0;}",

      /* ── responsive grid ── */
      /* desktop: 3 columns */
      "[data-illuxus-embed] .ee-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:4px 0;}",
      /* tablet: 2 columns */
      "@media(max-width:899px){[data-illuxus-embed] .ee-grid{grid-template-columns:repeat(2,1fr);}}",
      /* mobile: 1 column */
      "@media(max-width:539px){[data-illuxus-embed] .ee-grid{grid-template-columns:1fr;}}",

      /* card */
      "[data-illuxus-embed] .ee-card{display:flex;flex-direction:column;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;background:#ffffff;border:1px solid #e5e7eb;transition:transform .15s ease,box-shadow .15s ease;}",
      "[data-illuxus-embed] .ee-card:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,0,0,.1);}",
      "[data-illuxus-embed][data-theme=dark] .ee-card{background:#1f2937;border-color:#374151;color:#f3f4f6;}",

      /* 16:9 thumbnail */
      "[data-illuxus-embed] .ee-thumb{position:relative;width:100%;padding-top:56.25%;background:#f3f4f6;overflow:hidden;}",
      "[data-illuxus-embed][data-theme=dark] .ee-thumb{background:#374151;}",
      "[data-illuxus-embed] .ee-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;}",
      "[data-illuxus-embed] .ee-thumb-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}",
      "[data-illuxus-embed] .ee-thumb-ph svg{opacity:.25;}",

      /* body */
      "[data-illuxus-embed] .ee-body{padding:14px 16px 16px;display:flex;flex-direction:column;flex:1;}",
      "[data-illuxus-embed] .ee-date{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6366f1;margin-bottom:6px;}",
      "[data-illuxus-embed][data-theme=dark] .ee-date{color:#818cf8;}",
      "[data-illuxus-embed] .ee-title{font-size:14px;font-weight:600;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin-bottom:8px;}",
      "[data-illuxus-embed] .ee-price{display:inline-block;margin-top:4px;font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;background:#f3f4f6;color:#374151;}",
      "[data-illuxus-embed] .ee-price.free{background:#d1fae5;color:#065f46;}",
      "[data-illuxus-embed][data-theme=dark] .ee-price{background:#374151;color:#e5e7eb;}",
      "[data-illuxus-embed][data-theme=dark] .ee-price.free{background:#064e3b;color:#6ee7b7;}",
      "[data-illuxus-embed] .ee-meta{font-size:12px;color:#6b7280;margin-top:auto;padding-top:8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}",
      "[data-illuxus-embed][data-theme=dark] .ee-meta{color:#9ca3af;}",

      /* states */
      "[data-illuxus-embed] .ee-msg{padding:32px 20px;text-align:center;font-size:13px;color:#6b7280;border:1px dashed #e5e7eb;border-radius:12px;}",
      "[data-illuxus-embed][data-theme=dark] .ee-msg{color:#9ca3af;border-color:#374151;}",

      /* footer */
      "[data-illuxus-embed] .ee-foot{margin-top:12px;text-align:right;font-size:10px;color:#9ca3af;}",
      "[data-illuxus-embed] .ee-foot a{color:inherit;text-decoration:none;}",
      "[data-illuxus-embed] .ee-foot a:hover{text-decoration:underline;}",
    ].join("");
    document.head.appendChild(s);
  }

  /* ──────────────────────────────────────────────────────────────
     5. Fetch events and render.
  ────────────────────────────────────────────────────────────── */
  container.innerHTML = '<div class="ee-msg">Loading events…</div>';

  /* Always call our own API proxy — no Supabase URL or anon key exposed. */
  var url = apiBase + "/api/widget" +
    "?org="    + encodeURIComponent(orgSlug) +
    "&filter=" + encodeURIComponent(filter) +
    "&limit="  + encodeURIComponent(limit);

  fetch(url, { method: "GET" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " from org-events function");
      return r.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.events) || data.events.length === 0) {
        container.innerHTML = '<div class="ee-msg">No ' + h(filter) + ' events found.</div>';
        return;
      }

      var orgHandle = (data.org && (data.org.subdomain || data.org.slug)) || orgSlug;

      var cards = data.events.map(function (e) {
        /* date */
        var dl = "";
        try { dl = new Date(e.date).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric", year:"numeric" }); }
        catch(_) { dl = e.date || ""; }

        /* location */
        var loc = [e.venue, e.location].filter(Boolean).join(" · ");

        /* price */
        var price = Number(e.price) || 0;
        var badge = price > 0
          ? '<span class="ee-price">₹' + price.toLocaleString() + '</span>'
          : '<span class="ee-price free">Free</span>';

        /* thumbnail */
        var img = e.banner_landscape_url || e.image_url || "";
        var thumb = img
          ? '<div class="ee-thumb"><img src="' + h(img) + '" alt="" loading="lazy"/></div>'
          : '<div class="ee-thumb"><div class="ee-thumb-ph"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div></div>';

        /* event URL */
        var id  = e.slug || e.id;
        var href = apiBase + "/org/" + encodeURIComponent(orgHandle) + "/events/" + encodeURIComponent(id);

        return '<a class="ee-card" href="' + h(href) + '" target="_blank" rel="noopener noreferrer">' +
          thumb +
          '<div class="ee-body">' +
            '<div class="ee-date">' + h(dl) + '</div>' +
            '<div class="ee-title">' + h(e.title) + '</div>' +
            badge +
            (loc ? '<div class="ee-meta">📍 ' + h(loc) + '</div>' : '') +
          '</div></a>';
      }).join("");

      container.innerHTML =
        '<div class="ee-grid">' + cards + '</div>' +
        '<div class="ee-foot">Powered by <a href="https://illuxus.com" target="_blank" rel="noopener">illuxus</a></div>';
    })
    .catch(function (err) {
      container.innerHTML = '<div class="ee-msg">Could not load events. Check the browser console for details.</div>';
      console.error("[illuxus-embed] Error:", err.message || err);
    });

  function h(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
})();
