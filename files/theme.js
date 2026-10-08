  /* ---- Theme: palettes, mode, wallpaper, shapes, fonts ---- */
  const PRESETS = { cherry: ["Cherry", "#d62839", "#f8f1ee"], sage: ["Sage", "#6b8f71", "#eef1e8"], latte: ["Latte", "#a47551", "#f4ece3"],
    peach: ["Peach", "#e8836b", "#fbeee6"], rose: ["Rose", "#b5667a", "#f6ecee"], haze: ["Haze", "#5f8a9e", "#e9eff1"] };
  const FONTS = { clean: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', editorial: '"Iowan Old Style","Palatino Linotype",Georgia,serif',
    rounded: 'ui-rounded,"SF Pro Rounded",Nunito,"Trebuchet MS",sans-serif', mono: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace' };
  const WALLS = { plain: ["none", "auto"], dots: ["radial-gradient(var(--dot) 1.4px, transparent 1.7px)", "20px 20px"],
    lines: ["repeating-linear-gradient(to bottom, transparent 0 29px, var(--dot) 29px 30px)", "auto"], wash: ["linear-gradient(165deg, var(--soft), transparent 65%)", "auto"] };
  const OPTS = { mode: [["light", "Light"], ["dark", "Dark"], ["auto", "Match device"]], wall: [["plain", "Plain"], ["dots", "Dots"], ["lines", "Lines"], ["wash", "Wash"]],
    bubble: [["soft", "Soft"], ["pill", "Pill"], ["square", "Square"]], font: [["clean", "Clean"], ["editorial", "Editorial"], ["rounded", "Rounded"], ["mono", "Mono"]], size: [["s", "Small"], ["m", "Medium"], ["l", "Large"]] };
  const DEFAULTS = { mode: "light", theme: "cherry", accent: "", wall: "plain", bubble: "soft", font: "clean", size: "m", sound: true, desktop: false, preview: true, stamps: true };
  const loadPrefs = (k) => { try { return { ...DEFAULTS, ...JSON.parse(store.get("prefs:" + k) || "{}") }; } catch { return { ...DEFAULTS }; } };
  let prefs = loadPrefs("last");
  const savePrefs = () => { const j = JSON.stringify(prefs); store.set("prefs:last", j); if (myId) store.set("prefs:" + myId, j); };

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return "#" + A.map((v, i) => Math.round(v * (1 - t) + B[i] * t).toString(16).padStart(2, "0")).join(""); };
  const lum = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255); return .2126 * r + .7152 * g + .0722 * b; };
  function applyTheme() {
    const dark = prefs.mode === "dark" || (prefs.mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    const [, base, tint] = PRESETS[prefs.theme] || PRESETS.cherry, a = prefs.accent || base;
    const bg = dark ? mix("#131110", a, .06) : tint, card = dark ? mix("#1c1917", a, .06) : mix(tint, "#ffffff", .6), text = dark ? "#f3eee9" : "#2a2522";
    const v = { "--bg": bg, "--card": card, "--text": text, "--muted": mix(text, card, .5), "--brand": a, "--onbrand": lum(a) > .62 ? "#1a1a1a" : "#ffffff",
      "--soft": mix(a, card, dark ? .2 : .14), "--idtext": dark ? mix(a, "#ffffff", .45) : mix(a, "#000000", .35), "--border": mix(text, card, .8), "--line": mix(text, card, .9),
      "--bubble": mix(text, card, .9), "--chatbg": mix(bg, card, .5), "--dot": mix(text, bg, .86), "--warnbg": mix(a, card, .12), "--warnb": mix(a, card, .45),
      "--r": { soft: "16px", pill: "24px", square: "6px" }[prefs.bubble], "--fs": { s: "14px", m: "15px", l: "17px" }[prefs.size], "--font": FONTS[prefs.font],
      "--wall": WALLS[prefs.wall][0], "--wallsize": WALLS[prefs.wall][1] };
    for (const k in v) document.documentElement.style.setProperty(k, v[k]);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => prefs.mode === "auto" && applyTheme()); } catch {}
  function setPref(k, val) { prefs[k] = val; if (k === "theme") prefs.accent = ""; savePrefs(); applyTheme(); syncSettings(); }
  applyTheme();

  const ICONS = { ...MORE_ICONS, chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 5l-7 7 7 7"/>',
    sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    send: '<path d="M4 12l16-8-6 16-3-7-7-1z"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>' };
  document.querySelectorAll("[data-icon]").forEach((el) => {
    for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })) el.setAttribute(k, v);
    el.innerHTML = ICONS[el.dataset.icon];
  });
