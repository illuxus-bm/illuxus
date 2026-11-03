#!/usr/bin/env node
// Loads key pages in Chromium against a server that sends the vercel.json
// security headers, and fails on any Content-Security-Policy violation or if
// the inline boot scripts (theme, splash) / app stylesheet stop working.
//
//   node scripts/csp-smoke.mjs http://localhost:4140 [/extra/path ...]
import { chromium } from "playwright";

const [base, ...extra] = process.argv.slice(2);
if (!base) {
  console.error("usage: node scripts/csp-smoke.mjs <base-url> [paths...]");
  process.exit(2);
}
const paths = ["/", "/events", "/login", "/about", "/pricing", "/features", "/contact", ...extra];

// Playwright's own Chromium if installed, else the system Chrome.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
let failures = 0;
for (const path of paths) {
  const page = await browser.newPage();
  const violations = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (execute|load|frame|connect|apply)/i.test(m.text())) violations.push(m.text().slice(0, 220));
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window).__csp = (window).__csp || [];
      (window).__csp.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForFunction(() => !document.getElementById("illuxus-splash"), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({
    splashGone: !document.getElementById("illuxus-splash"),
    themeRan: !!document.documentElement.style.colorScheme,
    appCss: !!document.querySelector('link[data-app-css][rel="stylesheet"]')?.sheet,
    domViolations: (window).__csp || [],
  }));
  // A javascript: link must not run.
  const jsLinkRan = await page.evaluate(async () => {
    const a = document.createElement("a");
    a.href = "javascript:window.__pwned=1";
    a.textContent = "x";
    document.body.appendChild(a);
    a.click();
    await new Promise((r) => setTimeout(r, 300));
    return (window).__pwned === 1;
  });
  // The javascript: link above is blocked on purpose; anything else is a real violation.
  const isProbe = (v) => /Running the JavaScript URL|__pwned/.test(v) || /^script-src(-elem)? inline$/.test(v);
  const unexpected = [...new Set([...violations, ...state.domViolations])].filter((v) => !isProbe(v));
  const ok = state.splashGone && state.themeRan && state.appCss && !jsLinkRan && unexpected.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${path.padEnd(28)} splash-gone:${state.splashGone} theme:${state.themeRan} app-css:${state.appCss} javascript:-link-blocked:${!jsLinkRan} violations:${unexpected.length}`);
  for (const v of unexpected) console.log("        " + v);
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
