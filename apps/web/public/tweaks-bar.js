/*
 * Anti-Slop Tweaks Bar — live, in-browser design tuning for dev servers.
 * -------------------------------------------------------------------------
 * Injecteer dit op je dev-server zodat je fonts, kleuren, gewichten en
 * hero-overgangen VISUEEL kunt tunen zonder nieuwe terminal-prompt.
 *
 * MOUNT (kies één):
 *   1) Next.js / React (alleen dev):
 *        if (process.env.NODE_ENV !== 'production') {
 *          const s = document.createElement('script');
 *          s.src = '/tweaks-bar.js';           // kopieer dit bestand naar /public
 *          document.body.appendChild(s);
 *        }
 *   2) Vite / statische HTML:
 *        <script src="/tweaks-bar.js" data-antislop-tweaks></script>
 *   3) Console/bookmarklet: plak de inhoud, of `import()` de URL.
 *
 * CONFIG (optioneel) — zet vóór het script:
 *   window.AntiSlopTweaks = {
 *     enabled: true,                 // default: true, maar auto-uit op *.prod-hosts
 *     vars: {
 *       fonts:   ['--font-display', '--font-body'],
 *       weights: ['--weight-display', '--weight-body'],
 *       colors:  ['--color-bg', '--color-fg', '--color-accent'],
 *       hero:    { duration: '--hero-duration', easing: '--hero-easing' }
 *     }
 *   };
 *   Geen config? Dan wordt :root automatisch afgetast (font-/weight-/kleur-/duration-/ease-vars).
 *
 * Toggle: Cmd/Ctrl + Shift + .   ·   Waarden persisteren in localStorage.
 * "Copy CSS" exporteert alleen de GEWIJZIGDE vars → plak in je token-bestand.
 */
(function () {
  "use strict";
  if (window.__antiSlopTweaksMounted) return;

  var cfg = window.AntiSlopTweaks || {};
  // Prod-guard: niet tonen op echte hosts, tenzij expliciet enabled.
  var host = location.hostname;
  var looksProd =
    !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local)$/.test(host) &&
    !/^(dev|staging|preview)\./.test(host);
  if (cfg.enabled === false) return;
  if (cfg.enabled !== true && looksProd) return;
  window.__antiSlopTweaksMounted = true;

  var STORE_KEY = "antislop-tweaks:" + location.pathname;
  var root = document.documentElement;
  var GOOGLE_FONT_PRESETS = [
    "Syne",
    "Space Grotesk",
    "Fraunces",
    "Instrument Serif",
    "Bricolage Grotesque",
    "Unbounded",
    "Sohne",
    "Neue Montreal",
    "PP Editorial",
    "Ivar",
    "Redaction",
    "IBM Plex Mono",
    "Departure Mono",
    "JetBrains Mono",
    "Public Sans",
    "Newsreader",
  ];
  var EASING_PRESETS = [
    "cubic-bezier(0.16, 1, 0.3, 1)",
    "cubic-bezier(0.22, 1, 0.36, 1)",
    "cubic-bezier(0.83, 0, 0.17, 1)",
    "cubic-bezier(0.65, 0, 0.35, 1)",
    "cubic-bezier(0.34, 1.56, 0.64, 1)",
    "ease",
    "ease-in-out",
    "linear",
  ];

  // ---- helpers ----------------------------------------------------------
  function getVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }
  function setVar(name, value) {
    root.style.setProperty(name, value);
  }

  function readAllRootVars() {
    var found = {};
    // inline vars op :root
    for (var i = 0; i < root.style.length; i++) {
      var p = root.style[i];
      if (p.indexOf("--") === 0) found[p] = getVar(p);
    }
    // same-origin stylesheets
    try {
      for (var s = 0; s < document.styleSheets.length; s++) {
        var rules;
        try {
          rules = document.styleSheets[s].cssRules;
        } catch {
          continue;
        } // CORS
        if (!rules) continue;
        for (var r = 0; r < rules.length; r++) {
          var rule = rules[r];
          if (
            !rule.selectorText ||
            !/(^|,)\s*:root\s*(,|$)/.test(rule.selectorText)
          )
            continue;
          for (var d = 0; d < rule.style.length; d++) {
            var prop = rule.style[d];
            if (prop.indexOf("--") === 0 && !(prop in found))
              found[prop] = getVar(prop);
          }
        }
      }
    } catch {}
    return found;
  }

  function classify(name, value) {
    var n = name.toLowerCase();
    if (/font(?!-?(size|weight))|typeface|family/.test(n)) return "font";
    if (/weight/.test(n)) return "weight";
    if (/duration|-dur$|speed|-ms$/.test(n)) return "duration";
    if (/eas(e|ing)|bezier|curve/.test(n)) return "easing";
    if (
      /color|colour|bg|background|fg|foreground|accent|ink|paper|line|border|fill|surface|text/.test(
        n,
      )
    ) {
      if (isColor(value)) return "color";
    }
    return isColor(value) ? "color" : null;
  }

  var _probe = document.createElement("span");
  function isColor(v) {
    if (!v) return false;
    _probe.style.color = "";
    _probe.style.color = v;
    return _probe.style.color !== "";
  }
  function toHex(v) {
    if (!v) return "#000000";
    if (/^#([0-9a-f]{6})$/i.test(v)) return v;
    _probe.style.color = "";
    _probe.style.color = v;
    document.body.appendChild(_probe);
    var rgb = getComputedStyle(_probe).color;
    document.body.removeChild(_probe);
    var m = rgb.match(/\d+/g);
    if (!m) return "#000000";
    return (
      "#" +
      m
        .slice(0, 3)
        .map(function (x) {
          return ("0" + parseInt(x, 10).toString(16)).slice(-2);
        })
        .join("")
    );
  }

  // ---- config resolution ------------------------------------------------
  function buildFields() {
    var fields = []; // {name, type}
    var seen = {};
    function push(name, type) {
      if (!name || seen[name]) return;
      seen[name] = 1;
      fields.push({ name: name, type: type });
    }
    if (cfg.vars) {
      (cfg.vars.fonts || []).forEach(function (n) {
        push(n, "font");
      });
      (cfg.vars.weights || []).forEach(function (n) {
        push(n, "weight");
      });
      (cfg.vars.colors || []).forEach(function (n) {
        push(n, "color");
      });
      if (cfg.vars.hero) {
        if (cfg.vars.hero.duration) push(cfg.vars.hero.duration, "duration");
        if (cfg.vars.hero.easing) push(cfg.vars.hero.easing, "easing");
      }
    } else {
      var all = readAllRootVars();
      Object.keys(all)
        .sort()
        .forEach(function (name) {
          var t = classify(name, all[name]);
          if (t) push(name, t);
        });
    }
    return fields;
  }

  // ---- persistence ------------------------------------------------------
  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function save(map) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(map));
    } catch {}
  }
  var changed = loadSaved();
  Object.keys(changed).forEach(function (n) {
    setVar(n, changed[n]);
  }); // restore

  // ---- UI (Shadow DOM zodat page-CSS ons niet raakt) --------------------
  var hostEl = document.createElement("div");
  hostEl.setAttribute("data-antislop-tweaks-root", "");
  hostEl.style.cssText =
    "all:initial;position:fixed;z-index:2147483647;bottom:16px;right:16px;";
  document.body.appendChild(hostEl);
  var shadow = hostEl.attachShadow({ mode: "open" });

  var css = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}",
    ".panel{width:300px;max-height:78vh;overflow:auto;background:#0e0e10;color:#e9e9ec;",
    "  border:1px solid #2a2a30;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);",
    "  font-size:12px;line-height:1.4}",
    ".hd{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;",
    "  position:sticky;top:0;background:#0e0e10;border-bottom:1px solid #1f1f24;cursor:default}",
    ".hd b{font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:11px}",
    ".hd .dot{color:#6ee7a8}",
    ".body{padding:10px 12px;display:flex;flex-direction:column;gap:12px}",
    ".row label{display:block;margin-bottom:4px;color:#a7a7b0;font-size:10px;",
    "  letter-spacing:.05em;text-transform:uppercase;word-break:break-all}",
    ".ctl{display:flex;gap:6px;align-items:center}",
    "input[type=text],select{flex:1;min-width:0;background:#17171b;color:#e9e9ec;",
    "  border:1px solid #2a2a30;border-radius:6px;padding:5px 7px;font-size:12px}",
    "input[type=color]{width:30px;height:28px;padding:0;border:1px solid #2a2a30;",
    "  border-radius:6px;background:#17171b}",
    "input[type=range]{flex:1;accent-color:#6ee7a8}",
    ".val{color:#8a8a93;font-size:11px;min-width:44px;text-align:right}",
    ".actions{display:flex;gap:6px;padding-top:4px}",
    "button{flex:1;background:#17171b;color:#e9e9ec;border:1px solid #2a2a30;border-radius:6px;",
    "  padding:7px;cursor:pointer;font-size:11px;letter-spacing:.03em}",
    "button:hover{background:#202027;border-color:#3a3a42}",
    "button.pri{background:#6ee7a8;color:#08130d;border-color:#6ee7a8;font-weight:600}",
    ".iconbtn{background:none;border:none;color:#a7a7b0;cursor:pointer;font-size:14px;",
    "  padding:2px 6px;flex:none;width:auto}",
    ".collapsed .body,.collapsed .actions-wrap{display:none}",
    ".fab{width:44px;height:44px;border-radius:50%;background:#0e0e10;border:1px solid #2a2a30;",
    "  color:#6ee7a8;font-size:18px;display:flex;align-items:center;justify-content:center;",
    "  cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.5)}",
    ".hint{color:#5a5a63;font-size:10px;padding:0 12px 10px}",
  ].join("");

  var wrap = document.createElement("div");
  var style = document.createElement("style");
  style.textContent = css;
  shadow.appendChild(style);
  shadow.appendChild(wrap);

  var open = true;
  function render() {
    var fields = buildFields();
    if (!open) {
      wrap.innerHTML = "";
      var fab = document.createElement("div");
      fab.className = "fab";
      fab.title = "Tweaks Bar (Cmd/Ctrl+Shift+.)";
      fab.textContent = "✦";
      fab.onclick = function () {
        open = true;
        render();
      };
      wrap.appendChild(fab);
      return;
    }
    var panel = document.createElement("div");
    panel.className = "panel";

    var hd = document.createElement("div");
    hd.className = "hd";
    hd.innerHTML = '<b><span class="dot">✦</span> Anti-Slop Tweaks</b>';
    var close = document.createElement("button");
    close.className = "iconbtn";
    close.textContent = "–";
    close.title = "Inklappen";
    close.onclick = function () {
      open = false;
      render();
    };
    hd.appendChild(close);
    panel.appendChild(hd);

    var body = document.createElement("div");
    body.className = "body";
    if (!fields.length) {
      var empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent =
        "Geen tunebare CSS-vars gevonden op :root. Definieer --font-*, --color-*, " +
        "--weight-*, --hero-duration/--hero-easing, of geef window.AntiSlopTweaks.vars op.";
      body.appendChild(empty);
    }
    fields.forEach(function (f) {
      body.appendChild(controlFor(f));
    });
    panel.appendChild(body);

    var actionsWrap = document.createElement("div");
    actionsWrap.className = "actions-wrap";
    var actions = document.createElement("div");
    actions.className = "actions";
    actions.style.padding = "0 12px 12px";
    var copy = document.createElement("button");
    copy.className = "pri";
    copy.textContent = "Copy CSS";
    copy.onclick = exportCss;
    var reset = document.createElement("button");
    reset.textContent = "Reset";
    reset.onclick = function () {
      Object.keys(changed).forEach(function (n) {
        root.style.removeProperty(n);
      });
      changed = {};
      save(changed);
      render();
    };
    actions.appendChild(copy);
    actions.appendChild(reset);
    actionsWrap.appendChild(actions);
    panel.appendChild(actionsWrap);

    var hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = Object.keys(changed).length
      ? Object.keys(changed).length +
        " var(s) gewijzigd — Copy CSS om vast te leggen."
      : "Cmd/Ctrl+Shift+.  om te togglen.";
    panel.appendChild(hint);

    wrap.innerHTML = "";
    wrap.appendChild(panel);
  }

  function applyChange(name, value) {
    setVar(name, value);
    changed[name] = value;
    save(changed);
  }

  function controlFor(f) {
    var row = document.createElement("div");
    row.className = "row";
    var lab = document.createElement("label");
    lab.textContent = f.name;
    row.appendChild(lab);
    var ctl = document.createElement("div");
    ctl.className = "ctl";
    var cur = getVar(f.name);

    if (f.type === "color") {
      var pick = document.createElement("input");
      pick.type = "color";
      pick.value = toHex(cur);
      var tx = document.createElement("input");
      tx.type = "text";
      tx.value = cur;
      pick.oninput = function () {
        tx.value = pick.value;
        applyChange(f.name, pick.value);
        refreshHint();
      };
      tx.onchange = function () {
        if (isColor(tx.value)) {
          pick.value = toHex(tx.value);
          applyChange(f.name, tx.value);
          refreshHint();
        }
      };
      ctl.appendChild(pick);
      ctl.appendChild(tx);
    } else if (f.type === "font") {
      var sel = document.createElement("input");
      sel.type = "text";
      sel.value = cur;
      sel.setAttribute("list", "antislop-fonts");
      sel.onchange = function () {
        applyChange(f.name, sel.value);
        refreshHint();
      };
      if (!shadow.getElementById("antislop-fonts")) {
        var dl = document.createElement("datalist");
        dl.id = "antislop-fonts";
        GOOGLE_FONT_PRESETS.forEach(function (n) {
          var o = document.createElement("option");
          o.value = n;
          dl.appendChild(o);
        });
        shadow.appendChild(dl);
      }
      ctl.appendChild(sel);
    } else if (f.type === "weight") {
      var rng = document.createElement("input");
      rng.type = "range";
      rng.min = 100;
      rng.max = 900;
      rng.step = 100;
      rng.value = parseInt(cur, 10) || 400;
      var v = document.createElement("span");
      v.className = "val";
      v.textContent = rng.value;
      rng.oninput = function () {
        v.textContent = rng.value;
        applyChange(f.name, rng.value);
        refreshHint();
      };
      ctl.appendChild(rng);
      ctl.appendChild(v);
    } else if (f.type === "duration") {
      var ms = parseFloat(cur) * (cur.endsWith("ms") ? 1 : 1000) || 600;
      var dr = document.createElement("input");
      dr.type = "range";
      dr.min = 0;
      dr.max = 2000;
      dr.step = 50;
      dr.value = ms;
      var dv = document.createElement("span");
      dv.className = "val";
      dv.textContent = ms + "ms";
      dr.oninput = function () {
        dv.textContent = dr.value + "ms";
        applyChange(f.name, dr.value + "ms");
        refreshHint();
      };
      ctl.appendChild(dr);
      ctl.appendChild(dv);
    } else if (f.type === "easing") {
      var es = document.createElement("select");
      var opts = EASING_PRESETS.slice();
      if (cur && opts.indexOf(cur) === -1) opts.unshift(cur);
      opts.forEach(function (e) {
        var o = document.createElement("option");
        o.value = e;
        o.textContent = e;
        if (e === cur) o.selected = true;
        es.appendChild(o);
      });
      es.onchange = function () {
        applyChange(f.name, es.value);
        refreshHint();
      };
      ctl.appendChild(es);
    } else {
      var t2 = document.createElement("input");
      t2.type = "text";
      t2.value = cur;
      t2.onchange = function () {
        applyChange(f.name, t2.value);
        refreshHint();
      };
      ctl.appendChild(t2);
    }
    row.appendChild(ctl);
    return row;
  }

  function refreshHint() {
    var h = shadow.querySelector(".hint");
    if (h)
      h.textContent =
        Object.keys(changed).length +
        " var(s) gewijzigd — Copy CSS om vast te leggen.";
  }

  function exportCss() {
    var names = Object.keys(changed);
    if (!names.length) {
      toast("Niks gewijzigd.");
      return;
    }
    var out =
      ":root {\n" +
      names
        .map(function (n) {
          return "  " + n + ": " + changed[n] + ";";
        })
        .join("\n") +
      "\n}";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(out).then(
        function () {
          toast("CSS gekopieerd ✓");
        },
        function () {
          fallbackCopy(out);
        },
      );
    } else {
      fallbackCopy(out);
    }
  }
  function fallbackCopy(txt) {
    var ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("CSS gekopieerd ✓");
    } catch {
      console.log(txt);
      toast("Zie console");
    }
    document.body.removeChild(ta);
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;bottom:70px;right:16px;background:#6ee7a8;color:#08130d;" +
      "padding:8px 12px;border-radius:8px;font:600 12px ui-monospace,monospace;z-index:2147483647";
    document.body.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 1400);
  }

  // toggle-shortcut
  window.addEventListener("keydown", function (e) {
    if (
      (e.metaKey || e.ctrlKey) &&
      e.shiftKey &&
      (e.key === "." || e.code === "Period")
    ) {
      e.preventDefault();
      open = !open;
      render();
    }
  });

  render();
  console.log(
    "[anti-slop] Tweaks Bar actief — Cmd/Ctrl+Shift+. om te togglen.",
  );
})();
