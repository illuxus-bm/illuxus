(function () {
  "use strict";

  // Find script tag and read configuration via data attributes
  var currentScript = document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  if (!currentScript) return;

  var apiBase = currentScript.getAttribute("data-api") ||
    (currentScript.src.split("/embed.js")[0]);
  var orgSlug = currentScript.getAttribute("data-org");
  var filter = currentScript.getAttribute("data-filter") || "upcoming";
  var limit = currentScript.getAttribute("data-limit") || "10";
  var theme = currentScript.getAttribute("data-theme") || "light";
  var targetId = currentScript.getAttribute("data-target");
  var supabaseFn = currentScript.getAttribute("data-fn");

  if (!orgSlug || !supabaseFn) {
    console.error("[event-embed] Missing data-org or data-fn attribute");
    return;
  }

  // Find or create container
  var container;
  if (targetId) {
    container = document.getElementById(targetId);
  }
  if (!container) {
    container = document.createElement("div");
    currentScript.parentNode.insertBefore(container, currentScript);
  }

  container.setAttribute("data-event-embed", "");

  // Inject styles once
  if (!document.getElementById("event-embed-styles")) {
    var style = document.createElement("style");
    style.id = "event-embed-styles";
    style.textContent =
      "[data-event-embed]{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#111}" +
      "[data-event-embed].ee-dark{color:#f3f4f6}" +
      "[data-event-embed] .ee-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}" +
      "[data-event-embed] .ee-card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff;text-decoration:none;color:inherit;display:flex;flex-direction:column;transition:transform .15s,box-shadow .15s}" +
      "[data-event-embed].ee-dark .ee-card{background:#1f2937;border-color:#374151}" +
      "[data-event-embed] .ee-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.06)}" +
      "[data-event-embed] .ee-img{height:140px;background:#f3f4f6;background-size:cover;background-position:center}" +
      "[data-event-embed] .ee-body{padding:14px}" +
      "[data-event-embed] .ee-date{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;color:#6366f1;margin-bottom:6px}" +
      "[data-event-embed] .ee-title{font-size:15px;font-weight:600;margin:0 0 6px 0;line-height:1.3}" +
      "[data-event-embed] .ee-meta{font-size:12px;color:#6b7280;margin:0}" +
      "[data-event-embed].ee-dark .ee-meta{color:#9ca3af}" +
      "[data-event-embed] .ee-empty{padding:32px;text-align:center;color:#6b7280;font-size:13px;border:1px dashed #e5e7eb;border-radius:12px}" +
      "[data-event-embed] .ee-loading{padding:24px;text-align:center;color:#6b7280;font-size:13px}";
    document.head.appendChild(style);
  }

  if (theme === "dark") container.classList.add("ee-dark");

  container.innerHTML = '<div class="ee-loading">Loading events…</div>';

  var endpoint = supabaseFn + "?org=" + encodeURIComponent(orgSlug) +
    "&filter=" + encodeURIComponent(filter) +
    "&limit=" + encodeURIComponent(limit);

  fetch(endpoint)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.events || data.events.length === 0) {
        container.innerHTML = '<div class="ee-empty">No ' + filter + ' events.</div>';
        return;
      }
      // Public-URL handle for the org. Embed needs this to build
      // /org/<orgSlug>/events/<eventSlug> links that match Lovable hosting.
      var orgPathSlug = (data.org && data.org.slug) || orgSlug;
      var html = '<div class="ee-grid">';
      data.events.forEach(function (e) {
        var dateStr = new Date(e.date).toLocaleDateString(undefined, {
          month: "short", day: "numeric", year: "numeric",
        });
        var loc = [e.venue, e.location].filter(Boolean).join(" · ");
        var img = e.image_url
          ? '<div class="ee-img" style="background-image:url(\'' + e.image_url.replace(/'/g, "%27") + '\')"></div>'
          : '<div class="ee-img"></div>';
        // Luma-style path: <host>/org/<orgSlug>/events/<eventSlug>.
        // Falls back to the legacy /events/<id> route when slug is missing.
        var identifier = e.slug || e.id;
        var url = orgPathSlug
          ? (apiBase || "") + "/org/" + orgPathSlug + "/events/" + identifier
          : (apiBase || "") + "/events/" + identifier;
        html += '<a class="ee-card" href="' + url + '" target="_blank" rel="noopener">' +
          img +
          '<div class="ee-body">' +
          '<div class="ee-date">' + dateStr + '</div>' +
          '<h3 class="ee-title">' + escapeHtml(e.title) + '</h3>' +
          (loc ? '<p class="ee-meta">' + escapeHtml(loc) + '</p>' : '') +
          '</div></a>';
      });
      html += "</div>";
      container.innerHTML = html;
    })
    .catch(function (err) {
      container.innerHTML = '<div class="ee-empty">Could not load events.</div>';
      console.error("[event-embed]", err);
    });

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();