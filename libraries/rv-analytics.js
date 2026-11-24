/* rameshverse.com: analytics consent + Google tag
 *
 * Load this ONCE in the <head> of every page, in place of the pasted Google tag:
 *   <script src="/libraries/rv-analytics.js"></script>
 *
 * - Google Analytics is NOT loaded until the visitor presses Accept.
 * - The choice (accepted / declined + date) is kept in this browser only (localStorage "rvConsent").
 *   It is asked again after about a year.
 * - Until Accept, window.gtag() is an empty function, so page code that calls
 *   gtag('event', ...) is safe and nothing is recorded.
 * - Any link with the attribute data-rv-cookie-settings reopens the banner.
 * - Adds a small "Privacy Policy · Cookie settings" line at the bottom of every page except / and /privacy/.
 */
(function () {
  "use strict";

  var GA_ID = "G-DZMEQ7NQCD";
  var KEY = "rvConsent";
  var MAX_AGE = 365 * 24 * 60 * 60 * 1000;   // ask again after about a year

  function noop() {}
  var realGtag = null;     // the real gtag, created only after Accept
  var scriptAdded = false;

  // Safe default: page code may call gtag() at any time
  window.gtag = noop;

  // ---------- remembered choice ----------
  function read() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY));
      if (o && (o.v === "granted" || o.v === "denied") && typeof o.t === "number" &&
          Date.now() - o.t < MAX_AGE) return o.v;
    } catch (e) { /* storage blocked or damaged: treated as "not asked yet" */ }
    return null;
  }
  function save(v) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: v, t: Date.now() })); } catch (e) {}
  }

  // ---------- Google Analytics on / off ----------
  function start() {
    window["ga-disable-" + GA_ID] = false;
    if (realGtag) { window.gtag = realGtag; return; }   // was switched off earlier on this page
    window.dataLayer = window.dataLayer || [];
    realGtag = function () { window.dataLayer.push(arguments); };
    window.gtag = realGtag;
    if (!scriptAdded) {
      scriptAdded = true;
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
      document.head.appendChild(s);
    }
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {
      allow_google_signals: false,              // no Google advertising features
      allow_ad_personalization_signals: false
    });
  }

  function clearGaCookies() {
    try {
      var names = document.cookie.split(";").map(function (c) { return c.split("=")[0].trim(); })
        .filter(function (n) { return /^(_ga|_gid|_gat)/.test(n); });
      if (!names.length) return;
      var host = location.hostname, parts = host.split("."), domains = [""];
      for (var i = 0; i <= parts.length - 2; i++) {          // host and each parent domain (at least two labels)
        var d = parts.slice(i).join(".");
        domains.push(d, "." + d);
      }
      names.forEach(function (n) {
        domains.forEach(function (d) {
          document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + (d ? "; domain=" + d : "");
        });
      });
    } catch (e) {}
  }

  function stop() {
    window["ga-disable-" + GA_ID] = true;
    window.gtag = noop;
    clearGaCookies();
  }

  // ---------- banner ----------
  var CSS =
    ".rvc{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(560px,calc(100% - 24px));" +
    "z-index:2147483000;box-sizing:border-box;background:#111315;border:1px solid #1e2226;color:#c8ccd0;" +
    "font:12px/1.6 'Space Mono',ui-monospace,Menlo,Consolas,monospace;padding:14px 16px;text-align:left;" +
    "box-shadow:0 8px 30px rgba(0,0,0,.55)}" +
    ".rvc::before,.rvc::after{content:'';position:absolute;width:10px;height:10px;border:solid #e21f1f}" +
    ".rvc::before{top:-1px;left:-1px;border-width:2px 0 0 2px}" +
    ".rvc::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0}" +
    ".rvc .rvc-title{margin:0 0 6px;color:#e21f1f;font-size:11px;letter-spacing:2px;text-transform:uppercase}" +
    ".rvc .rvc-text{margin:0 0 10px;font-size:12px;line-height:1.6;color:#c8ccd0}" +
    ".rvc .rvc-text a{color:#e21f1f;text-decoration:none;border-bottom:1px solid #7a1414}" +
    ".rvc .rvc-cur{margin:0 0 10px;font-size:11px;color:#6b7278}" +
    ".rvc .rvc-btns{display:flex;gap:8px}" +
    ".rvc .rvc-btn{flex:1;box-sizing:border-box;margin:0;border:1px solid #e21f1f;border-radius:0;cursor:pointer;" +
    "font:700 11px 'Space Mono',ui-monospace,Menlo,Consolas,monospace;letter-spacing:2px;text-transform:uppercase;" +
    "padding:10px 8px;transform:none}" +
    ".rvc .rvc-yes,.rvc .rvc-yes:hover{background:#e21f1f;color:#0a0a0a}" +
    ".rvc .rvc-no,.rvc .rvc-no:hover{background:transparent;color:#e21f1f}" +
    ".rvc .rvc-btn:hover{opacity:.85}" +
    ".rvc .rvc-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}";

  function choose(v) {
    save(v);
    if (v === "granted") start(); else stop();
    var b = document.getElementById("rvConsentBanner");
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function showBanner() {
    if (document.getElementById("rvConsentBanner") || !document.body) return;
    if (!document.getElementById("rvConsentStyle")) {
      var st = document.createElement("style");
      st.id = "rvConsentStyle";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var cur = read();
    var el = document.createElement("div");
    el.id = "rvConsentBanner";
    el.className = "rvc";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Analytics cookies");
    el.innerHTML =
      '<p class="rvc-title">// Analytics cookies</p>' +
      '<p class="rvc-text">RameshVerse uses Google Analytics to count visits and see which tools are popular. ' +
      'It sets cookies only if you accept. Your tool data stays in your browser either way. ' +
      '<a href="/privacy/">Privacy Policy</a></p>' +
      (cur ? '<p class="rvc-cur">Current choice: ' + (cur === "granted" ? "accepted" : "declined") + '</p>' : "") +
      '<div class="rvc-btns">' +
      '<button type="button" class="rvc-btn rvc-yes" data-c="granted">Accept</button>' +
      '<button type="button" class="rvc-btn rvc-no" data-c="denied">Decline</button>' +
      '</div>';
    el.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button[data-c]") : null;
      if (btn) choose(btn.getAttribute("data-c"));
    });
    document.body.appendChild(el);
  }

  // ---------- start-up ----------
  var choice = read();
  if (choice === "granted") start();
  else clearGaCookies();   // not accepted: remove any analytics cookie left from before the banner existed

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  ready(function () {
    if (!choice) showBanner();
    footerLink();
    // "Cookie settings" links reopen the banner
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("[data-rv-cookie-settings]") : null;
      if (a) { e.preventDefault(); showBanner(); }
    });
  });

  // ---------- footer link on tool pages ----------
  // A small fixed line "Privacy Policy · Cookie settings" at the bottom of every page that
  // does not already have one (the home page and the privacy page have their own).
  function footerLink() {
    var path = location.pathname.replace(/index\.html$/, "");
    if (path === "/" || path === "" || /^\/privacy\/?$/.test(path)) return;
    if (document.getElementById("rvFootLink") || !document.body) return;
    if (!document.getElementById("rvFootStyle")) {
      var st = document.createElement("style");
      st.id = "rvFootStyle";
      st.textContent =
        "#rvFootLink{position:fixed;left:0;right:0;bottom:0;text-align:center;z-index:82;margin:0;" +
        "background:rgba(5,6,8,.92);padding:3px 8px;font:10px/1.4 'Space Mono',ui-monospace,Menlo,Consolas,monospace;letter-spacing:1px;" +
        "color:#6b7278;white-space:nowrap}" +
        "#rvFootLink a{color:#6b7278;text-decoration:none;padding:2px}" +
        "#rvFootLink a:hover{color:#e21f1f}";
      document.head.appendChild(st);
    }
    var f = document.createElement("div");
    f.id = "rvFootLink";
    f.innerHTML = '<a href="/privacy/">Privacy Policy</a> &middot; <a href="#" data-rv-cookie-settings>Cookie settings</a>';
    document.body.appendChild(f);
    // on pages that scroll, leave room so the line never covers the last bit of content
    function room() {
      var d = document.documentElement;
      d.style.paddingBottom = "";
      if (d.scrollHeight > window.innerHeight + 2) d.style.paddingBottom = "26px";
    }
    room();
    window.addEventListener("load", room);
    window.addEventListener("resize", room);
  }

  window.rvConsent = { open: showBanner, status: read };
})();
