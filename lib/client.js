// Browser half of the dual-face my-skin package.
// The web shell executes this bundle as a classic <script>: it only
// registers the factory; materialization (factory(require)) happens on the
// first import, and apply() runs when the entry fiber activates.
window.__ModuleLoader__.load({
  id: "my-skin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");
    var h = React.createElement;

    exports.name = "my-skin";
    exports.inject = ["theme", "slots"];

    // ---- Preset skins --------------------------------------------------
    var SKINS = [
      {
        id: "my-skin-violet",
        name: "紫夜 Violet",
        colorScheme: "dark",
        primary: "#a855f7"
      },
      {
        id: "my-skin-ocean",
        name: "深海 Ocean",
        colorScheme: "dark",
        primary: "#3b82f6"
      },
      {
        id: "my-skin-midnight",
        name: "午夜 Midnight",
        colorScheme: "dark",
        primary: "#22c55e"
      },
      {
        id: "my-skin-sakura",
        name: "樱花 Sakura",
        colorScheme: "light",
        primary: "#e11d48"
      },
      {
        id: "my-skin-paper",
        name: "纸张 Paper",
        colorScheme: "light",
        primary: "#f97316"
      }
    ];

    // ---- Color helpers --------------------------------------------------
    function hexToRgb(hex) {
      var value = String(hex).replace(/^#/, "");
      if (value.length === 3) {
        value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
      }
      var n = parseInt(value, 16);
      if (Number.isNaN(n)) return { r: 128, g: 128, b: 128 };
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    function rgbToHex(r, g, b) {
      return "#" + [r, g, b].map(function (v) {
        return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
      }).join("");
    }
    function mixColors(c1, c2, t) {
      var a = hexToRgb(c1);
      var b = hexToRgb(c2);
      return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    }
    function relativeLuminance(hex) {
      var rgb = hexToRgb(hex);
      // sRGB relative luminance (approx)
      function lin(c) {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      }
      return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
    }
    function contrastRatio(c1, c2) {
      var l1 = relativeLuminance(c1);
      var l2 = relativeLuminance(c2);
      var lighter = Math.max(l1, l2);
      var darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }
    // Ensure brand has enough contrast against a fixed foreground.
    function ensureBrandContrast(brand, foreground, minRatio) {
      minRatio = minRatio || 4.5;
      var result = brand;
      var guard = 0;
      while (contrastRatio(result, foreground) < minRatio && guard < 12) {
        // Push brand away from foreground luminance
        if (relativeLuminance(foreground) > 0.5) {
          result = mixColors(result, "#000000", 0.12);
        } else {
          result = mixColors(result, "#ffffff", 0.12);
        }
        guard += 1;
      }
      return result;
    }
    // Scale a color's saturation (0 = grayscale, 1 = original, >1 = boost).
    function adjustSaturation(hex, factor) {
      var rgb = hexToRgb(hex);
      var r = rgb.r / 255;
      var g = rgb.g / 255;
      var b = rgb.b / 255;
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var l = (max + min) / 2;
      var hue;
      if (max === min) {
        hue = 0;
      } else {
        var d = max - min;
        if (max === r) hue = 60 * (((g - b) / d) % 6);
        else if (max === g) hue = 60 * ((b - r) / d + 2);
        else hue = 60 * ((r - g) / d + 4);
        if (hue < 0) hue += 360;
      }
      var baseSat = max === min ? 0 : d / (1 - Math.abs(2 * l - 1));
      var s = Math.max(0, Math.min(1, baseSat * factor));
      var c = (1 - Math.abs(2 * l - 1)) * s;
      var x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
      var m = l - c / 2;
      var outR, outG, outB;
      if (hue < 60) { outR = c; outG = x; outB = 0; }
      else if (hue < 120) { outR = x; outG = c; outB = 0; }
      else if (hue < 180) { outR = 0; outG = c; outB = x; }
      else if (hue < 240) { outR = 0; outG = x; outB = c; }
      else if (hue < 300) { outR = x; outG = 0; outB = c; }
      else { outR = c; outG = 0; outB = x; }
      return rgbToHex((outR + m) * 255, (outG + m) * 255, (outB + m) * 255);
    }
    // Parse "#RRGGBB" / "RRGGBB" / "R,G,B" into a normalized hex, or null.
    function parseCustomColor(text) {
      var value = String(text).trim();
      var hex = /^#?([0-9a-fA-F]{6})$/.exec(value);
      if (hex !== null) return "#" + hex[1].toLowerCase();
      var rgb = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(value);
      if (rgb !== null) {
        var r = Number(rgb[1]);
        var g = Number(rgb[2]);
        var b = Number(rgb[3]);
        if (r <= 255 && g <= 255 && b <= 255) return rgbToHex(r, g, b);
      }
      return null;
    }

    // ---- Wallpaper smart color matching --------------------------------
    function extractPrimaryColor(imageDataUrl) {
      return new Promise((resolve, reject) => {
        var image = new Image();
        image.onload = () => {
          try {
            var size = 96;
            var canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            var context = canvas.getContext("2d");
            context.drawImage(image, 0, 0, size, size);
            var pixels = context.getImageData(0, 0, size, size).data;

            var samples = [];
            for (var i = 0; i < pixels.length; i += 4) {
              if (pixels[i + 3] < 125) continue;
              samples.push(pixels[i], pixels[i + 1], pixels[i + 2]);
            }
            var sampleCount = samples.length / 3;
            if (sampleCount < 24) {
              reject(new Error("no visible pixels"));
              return;
            }

            var points = [];
            var step = Math.max(1, Math.floor(sampleCount / 1600));
            for (var p = 0; p < sampleCount; p += step) {
              points.push(samples[p * 3], samples[p * 3 + 1], samples[p * 3 + 2]);
            }
            var pointCount = points.length / 3;

            var K = 5;
            var centers = [];
            for (var c = 0; c < K; c++) {
              var seed = Math.floor((pointCount - 1) * c / (K - 1)) * 3;
              centers.push([points[seed], points[seed + 1], points[seed + 2]]);
            }
            var assignments = new Array(pointCount);
            var sumR = new Array(K);
            var sumG = new Array(K);
            var sumB = new Array(K);
            var clusterCount = new Array(K);
            for (var iter = 0; iter < 12; iter++) {
              for (var k = 0; k < K; k++) {
                sumR[k] = 0;
                sumG[k] = 0;
                sumB[k] = 0;
                clusterCount[k] = 0;
              }
              var moved = false;
              for (var j = 0; j < pointCount; j++) {
                var r = points[j * 3];
                var g = points[j * 3 + 1];
                var b = points[j * 3 + 2];
                var bestK = 0;
                var bestDist = Infinity;
                for (var k2 = 0; k2 < K; k2++) {
                  var dr = r - centers[k2][0];
                  var dg = g - centers[k2][1];
                  var db = b - centers[k2][2];
                  var dist = dr * dr + dg * dg + db * db;
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestK = k2;
                  }
                }
                if (assignments[j] !== bestK) {
                  assignments[j] = bestK;
                  moved = true;
                }
                sumR[bestK] += r;
                sumG[bestK] += g;
                sumB[bestK] += b;
                clusterCount[bestK] += 1;
              }
              for (var k3 = 0; k3 < K; k3++) {
                if (clusterCount[k3] > 0) {
                  centers[k3] = [
                    sumR[k3] / clusterCount[k3],
                    sumG[k3] / clusterCount[k3],
                    sumB[k3] / clusterCount[k3]
                  ];
                }
              }
              if (!moved) break;
            }

            var bestCluster = 0;
            var bestScore = -1;
            for (var k4 = 0; k4 < K; k4++) {
              if (clusterCount[k4] === 0) continue;
              var cr = centers[k4][0];
              var cg = centers[k4][1];
              var cb = centers[k4][2];
              var max = Math.max(cr, cg, cb);
              var min = Math.min(cr, cg, cb);
              var saturation = max === 0 ? 0 : (max - min) / max;
              var score = clusterCount[k4] * (0.35 + saturation);
              if (score > bestScore) {
                bestScore = score;
                bestCluster = k4;
              }
            }
            resolve(rgbToHex(centers[bestCluster][0], centers[bestCluster][1], centers[bestCluster][2]));
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => reject(new Error("image decode failed"));
        image.src = imageDataUrl;
      });
    }

    // Build a complete token set tinted by the primary color.
    function tokensFromPrimaryColor(hex, scheme) {
      var value = String(hex).replace(/^#/, "");
      if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
      var color = "#" + value;
      var dark = scheme !== "light";

      var stateError = mixColors("#ef4444", color, 0.28);
      var stateErrorSec = mixColors("#fca5a5", color, 0.22);
      var stateSuccess = mixColors("#22c55e", color, 0.28);
      var stateSuccessSec = mixColors("#86efac", color, 0.22);
      var stateWarn = mixColors("#f59e0b", color, 0.28);
      var stateWarnSec = mixColors("#fcd34d", color, 0.22);
      var stateWarnLabel = mixColors("#d97706", color, 0.25);
      var stateBusiness = mixColors("#3b82f6", color, 0.35);

      if (!dark) {
        // Light scheme: solid primary buttons use dark-on-light or white-on-brand
        var fgOnBrand = "#ffffff";
        var brand = ensureBrandContrast(color, fgOnBrand, 4.5);
        if (relativeLuminance(brand) > 0.65) {
          // Very light brand → use dark text on brand instead
          fgOnBrand = "#0b0b10";
          brand = ensureBrandContrast(color, fgOnBrand, 4.5);
        }
        var label = relativeLuminance(color) > 0.5
          ? mixColors(color, "#0b0b10", 0.78)
          : mixColors("#0b0b10", color, 0.12);
        var label2 = mixColors(label, "#ffffff", 0.35);
        var label3 = mixColors(label, "#ffffff", 0.55);
        var bgBase = mixColors(color, "#ffffff", 0.92);
        var bg1 = mixColors(color, "#ffffff", 0.85);
        var bg2 = mixColors(color, "#ffffff", 0.78);
        var bg3 = mixColors(color, "#ffffff", 0.7);
        var border2 = mixColors(color, "#101014", 0.14);
        return {
          "--dsw-alias-bg-base": bgBase,
          "--dsw-alias-bg-layer-1": bg1,
          "--dsw-alias-bg-layer-2": bg2,
          "--dsw-alias-bg-layer-3": bg3,
          "--dsw-alias-bg-mask-1": "rgba(0,0,0,0.24)",
          "--dsw-alias-border-l1": mixColors(color, "#101014", 0.08),
          "--dsw-alias-border-l2": border2,
          "--dsw-alias-border-l3": mixColors(color, "#101014", 0.2),
          "--dsw-alias-border-l4": mixColors(color, "#101014", 0.28),
          "--dsw-alias-border-inverted": mixColors(label, "#ffffff", 0.05),
          "--dsw-alias-border-l2-darkmode-thin": border2,
          "--dsw-alias-button-contrast-fill": label,
          "--dsw-alias-button-floating-fill": mixColors(color, "#ffffff", 0.82),
          "--dsw-alias-button-floating-hover": mixColors(color, "#ffffff", 0.7),
          "--dsw-alias-button-ghost-active-border": mixColors(color, "#101014", 0.4),
          "--dsw-alias-button-ghost-active-fill": mixColors(color, "#ffffff", 0.72),
          "--dsw-alias-button-primary-fill": brand,
          "--dsw-alias-button-primary-hover": mixColors(brand, "#000000", 0.12),
          "--dsw-alias-button-tool-bar-fill": mixColors(color, "#101014", 0.06),
          "--dsw-alias-button-tool-bar-hover": mixColors(color, "#101014", 0.12),
          "--dsw-alias-interactive-bg-active": mixColors(color, "#101014", 0.1),
          "--dsw-alias-interactive-bg-hover": mixColors(color, "#101014", 0.06),
          "--dsw-alias-interactive-bg-hover-danger": "rgba(239,68,68,0.08)",
          "--dsw-alias-label-caption": mixColors(label, "#ffffff", 0.55),
          "--dsw-alias-label-dimmed": mixColors(label, "#ffffff", 0.78),
          "--dsw-alias-label-primary": label,
          "--dsw-alias-label-primary-foreground": fgOnBrand,
          "--dsw-alias-label-primary-inverted": "#ffffff",
          "--dsw-alias-label-secondary": label2,
          "--dsw-alias-label-tertiary": label3,
          "--dsw-alias-markdown-code-block": mixColors(color, "#ffffff", 0.72),
          "--dsw-alias-markdown-code-block-banner": mixColors(color, "#ffffff", 0.62),
          "--dsw-alias-markdown-inline-code": mixColors(color, "#ffffff", 0.62),
          "--dsw-alias-scrollbar-bg-l1": mixColors(color, "#ffffff", 0.82),
          "--dsw-alias-scrollbar-bg-l2": mixColors(color, "#ffffff", 0.76),
          "--dsw-alias-scrollbar-hover-l1": mixColors(color, "#101014", 0.2),
          "--dsw-alias-scrollbar-hover-l2": mixColors(color, "#101014", 0.16),
          "--dsw-alias-state-business-primary": stateBusiness,
          "--dsw-alias-state-error-primary": stateError,
          "--dsw-alias-state-error-secondary": stateErrorSec,
          "--dsw-alias-state-success-primary": stateSuccess,
          "--dsw-alias-state-success-secondary": stateSuccessSec,
          "--dsw-alias-state-warn-label": stateWarnLabel,
          "--dsw-alias-state-warn-primary": stateWarn,
          "--dsw-alias-state-warn-secondary": stateWarnSec,
          "--dsw-alias-tooltip-bg": mixColors(color, "#07070c", 0.9),
          "--dsw-specific-menu": bg3,
          "--dsw-specific-sidebar-fill": mixColors(color, "#ffffff", 0.88),
          "--dsw-alias-brand-primary": brand
        };
      }

      // Dark scheme: primary buttons use light text on brand
      var darkFgOnBrand = "#ffffff";
      var darkBrand = ensureBrandContrast(
        relativeLuminance(color) > 0.72 ? mixColors(color, "#000000", 0.28) : color,
        darkFgOnBrand,
        4.5
      );
      var labelPrimary = "#f4f6fb";
      var bgBase = mixColors(color, "#07070c", 0.84);
      var bg1 = mixColors(color, "#07070c", 0.74);
      var bg2 = mixColors(color, "#07070c", 0.66);
      var bg3 = mixColors(color, "#07070c", 0.58);
      var border2 = mixColors(color, "#ffffff", 0.18);
      return {
        "--dsw-alias-bg-base": bgBase,
        "--dsw-alias-bg-layer-1": bg1,
        "--dsw-alias-bg-layer-2": bg2,
        "--dsw-alias-bg-layer-3": bg3,
        "--dsw-alias-bg-mask-1": "rgba(0,0,0,0.5)",
        "--dsw-alias-border-l1": mixColors(color, "#ffffff", 0.1),
        "--dsw-alias-border-l2": border2,
        "--dsw-alias-border-l3": mixColors(color, "#ffffff", 0.26),
        "--dsw-alias-border-l4": mixColors(color, "#ffffff", 0.34),
        "--dsw-alias-border-inverted": mixColors(labelPrimary, color, 0.05),
        "--dsw-alias-border-l2-darkmode-thin": border2,
        "--dsw-alias-button-contrast-fill": labelPrimary,
        "--dsw-alias-button-floating-fill": mixColors(color, "#07070c", 0.7),
        "--dsw-alias-button-floating-hover": mixColors(color, "#07070c", 0.58),
        "--dsw-alias-button-ghost-active-border": mixColors(color, "#ffffff", 0.45),
        "--dsw-alias-button-ghost-active-fill": mixColors(color, "#07070c", 0.64),
        "--dsw-alias-button-primary-fill": darkBrand,
        "--dsw-alias-button-primary-hover": mixColors(darkBrand, "#ffffff", 0.2),
        "--dsw-alias-button-tool-bar-fill": mixColors(color, "#ffffff", 0.12),
        "--dsw-alias-button-tool-bar-hover": mixColors(color, "#ffffff", 0.2),
        "--dsw-alias-interactive-bg-active": mixColors(color, "#ffffff", 0.14),
        "--dsw-alias-interactive-bg-hover": mixColors(color, "#ffffff", 0.08),
        "--dsw-alias-interactive-bg-hover-danger": mixColors("#f87171", color, 0.35),
        "--dsw-alias-label-caption": mixColors(labelPrimary, color, 0.4),
        "--dsw-alias-label-dimmed": mixColors(labelPrimary, color, 0.6),
        "--dsw-alias-label-primary": labelPrimary,
        "--dsw-alias-label-primary-foreground": darkFgOnBrand,
        "--dsw-alias-label-primary-inverted": mixColors("#0b0b10", color, 0.15),
        "--dsw-alias-label-secondary": mixColors(labelPrimary, color, 0.25),
        "--dsw-alias-label-tertiary": mixColors(labelPrimary, color, 0.45),
        "--dsw-alias-markdown-code-block": mixColors(color, "#0a0a12", 0.8),
        "--dsw-alias-markdown-code-block-banner": mixColors(color, "#0a0a12", 0.7),
        "--dsw-alias-markdown-inline-code": mixColors(color, "#0a0a12", 0.7),
        "--dsw-alias-scrollbar-bg-l1": mixColors(color, "#07070c", 0.84),
        "--dsw-alias-scrollbar-bg-l2": mixColors(color, "#07070c", 0.78),
        "--dsw-alias-scrollbar-hover-l1": mixColors(color, "#ffffff", 0.3),
        "--dsw-alias-scrollbar-hover-l2": mixColors(color, "#ffffff", 0.22),
        "--dsw-alias-state-business-primary": stateBusiness,
        "--dsw-alias-state-error-primary": stateError,
        "--dsw-alias-state-error-secondary": stateErrorSec,
        "--dsw-alias-state-success-primary": stateSuccess,
        "--dsw-alias-state-success-secondary": stateSuccessSec,
        "--dsw-alias-state-warn-label": stateWarnLabel,
        "--dsw-alias-state-warn-primary": stateWarn,
        "--dsw-alias-state-warn-secondary": stateWarnSec,
        "--dsw-alias-tooltip-bg": mixColors(color, "#07070c", 0.9),
        "--dsw-specific-menu": bg3,
        "--dsw-specific-sidebar-fill": mixColors(color, "#040408", 0.9),
        "--dsw-alias-brand-primary": darkBrand
      };
    }

    // ---- Persistence keys ----------------------------------------------
    var STORAGE_ACTIVE = "my-skin:activeId";
    var STORAGE_WALLPAPER = "my-skin:wallpaper";
    var STORAGE_AUTO_PRIMARY = "my-skin:autoPrimary";
    var STORAGE_SATURATION = "my-skin:saturation";
    var STORAGE_CUSTOM_PRIMARY = "my-skin:customPrimary";
    var AUTO_SKIN_ID = "my-skin-wallpaper";
    var CUSTOM_SKIN_ID = "my-skin-custom";
    var MAX_WALLPAPER_BYTES = 10 * 1024 * 1024;

    function storageGet(key) {
      try { return localStorage.getItem(key); } catch (error) { return null; }
    }
    function storageSet(key, value) {
      try { localStorage.setItem(key, value); } catch (error) { /* ignore */ }
    }
    function storageRemove(key) {
      try { localStorage.removeItem(key); } catch (error) { /* ignore */ }
    }
    function loadSaturation() {
      var raw = storageGet(STORAGE_SATURATION);
      if (raw === null || raw === undefined) return 1;
      var value = Number(raw);
      if (!Number.isFinite(value)) return 1;
      return Math.max(0, Math.min(2, value));
    }

    // Grain layer: gray fractal noise, tiled, used only behind the UI.
    var NOISE_DATA_URL = "data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>"
      + "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>"
      + "<feColorMatrix type='saturate' values='0'/></filter>"
      + "<rect width='128' height='128' filter='url(#n)'/>"
      + "</svg>"
    );

    // Shared button styles that follow theme tokens (contrast-safe)
    function primaryButtonStyle(extra) {
      return Object.assign({
        padding: "5px 12px",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
        marginLeft: "6px",
        background: "var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #9b5dff))",
        color: "var(--dsw-alias-label-primary-foreground, #ffffff)"
      }, extra || {});
    }
    function secondaryButtonStyle(extra) {
      return Object.assign({
        padding: "5px 12px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
        marginLeft: "6px",
        background: "transparent",
        color: "var(--dsw-alias-label-primary, #e0e0e0)",
        border: "1px solid var(--dsw-alias-border-l2, #555)"
      }, extra || {});
    }
    function dangerButtonStyle(extra) {
      return Object.assign({
        padding: "5px 12px",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
        marginLeft: "0",
        marginTop: "8px",
        background: "var(--dsw-alias-state-error-primary, #c0392b)",
        color: "var(--dsw-alias-label-primary-foreground, #ffffff)"
      }, extra || {});
    }

    exports.apply = (ctx) => {
      // Global saturation factor (0–2, 1 = original) applied to every skin's
      // primary before token generation. Re-registering all skins on change
      // keeps the registry consistent, so any skin can be applied at any time.
      var saturationFactor = loadSaturation();
      var skinDisposers = {};
      function registerPreset(skin) {
        if (skinDisposers[skin.id] !== undefined) {
          skinDisposers[skin.id]();
          delete skinDisposers[skin.id];
        }
        skinDisposers[skin.id] = ctx.theme.register({
          id: skin.id,
          colorScheme: skin.colorScheme,
          tokens: tokensFromPrimaryColor(
            adjustSaturation(skin.primary, saturationFactor),
            skin.colorScheme
          )
        });
      }
      SKINS.forEach(registerPreset);

      // Per-row click timers so a double-click applies without a try-on flash.
      var rowClickTimers = {};

      // Small style sheet for hover / try-on emphasis (inline styles cannot
      // express :hover or attribute state).
      var skinStyleEl = document.createElement("style");
      skinStyleEl.id = "my-skin-styles";
      skinStyleEl.textContent = [
        '[data-my-skin="skin-row"] {',
        '  background: var(--dsw-alias-bg-layer-1, #16213e);',
        '  transition: background 0.15s ease;',
        '}',
        '[data-my-skin="skin-row"]:hover {',
        '  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.06));',
        '}',
        '[data-my-skin="skin-row"][data-row-state="trying"] {',
        '  background: var(--dsw-alias-interactive-bg-active, rgba(255,255,255,0.1));',
        '  outline: 1px solid var(--dsw-alias-state-warn-primary, #c98a00);',
        '}',
        '[data-my-skin="skin-row"][data-row-state="applied"] {',
        '  outline: 1px solid var(--dsw-alias-brand-primary, #9b5dff);',
        '}',
        '[data-my-skin="skin-bar"] {',
        '  width: 4px;',
        '  align-self: stretch;',
        '  border-radius: 2px;',
        '  transition: width 0.15s ease, filter 0.15s ease;',
        '}',
        '[data-my-skin="skin-row"]:hover [data-my-skin="skin-bar"],',
        '[data-my-skin="skin-row"][data-row-state="trying"] [data-my-skin="skin-bar"] {',
        '  width: 6px;',
        '  filter: brightness(1.12);',
        '}',
        '[data-my-skin="skin-row"][data-row-state="trying"] [data-my-skin="skin-badge"] {',
        '  box-shadow: 0 0 8px var(--dsw-alias-state-warn-primary, #c98a00);',
        '}',
        '[data-my-skin="saturation-slider"],',
        '[data-my-skin="noise-slider"],',
        '[data-my-skin="wallpaper-drop-zone"] input[type="range"] {',
        '  accent-color: #909090;',
        '  touch-action: none;',
        '}',
        '[data-my-skin="settings-panel"][data-sliding="true"] {',
        '  background: transparent;',
        '  border: none;',
        '  box-shadow: none;',
        '  backdrop-filter: none;',
        '  visibility: hidden;',
        '  pointer-events: none;',
        '}',
        '[data-my-skin="settings-panel"][data-sliding="true"] [data-active-slider="true"] {',
        '  visibility: visible;',
        '  pointer-events: auto;',
        '}',
        // Hide the whole settings modal (mask + panel + nav) while sliding so
        // the main interface behind is revealed. The overlay attribute is set
        // on the settings modal's fixed overlay layer by the sliding effect.
        '[data-my-skin-sliding="true"] {',
        '  visibility: hidden;',
        '  pointer-events: none;',
        '}'
      ].join("\n");
      document.head.appendChild(skinStyleEl);

      var autoSkin = null;
      var autoDisposer = null;
      var autoPrimaryHex = storageGet(STORAGE_AUTO_PRIMARY);
      var customSkin = null;
      var customDisposer = null;
      var customPrimaryHex = storageGet(STORAGE_CUSTOM_PRIMARY);
      if (customPrimaryHex !== null && customPrimaryHex !== undefined) {
        registerCustomSkin(ctx.theme.getTheme().active.colorScheme, customPrimaryHex);
      }

      function isValidSkinId(id) {
        if (id === null) return false;
        if (SKINS.some((skin) => skin.id === id)) return true;
        if (id === AUTO_SKIN_ID && autoSkin !== null) return true;
        return id === CUSTOM_SKIN_ID && customSkin !== null;
      }
      function registerAutoSkin(scheme, primaryHex) {
        // Disposing the active Auto theme resets the preference to the
        // built-in default and can flip the scheme mid-flight; guard so the
        // scheme listener cannot re-enter and register a second copy.
        reentrantThemeDance = true;
        try {
          if (autoDisposer !== null) {
            autoDisposer();
            autoDisposer = null;
            autoSkin = null;
          }
          if (primaryHex === null || primaryHex === undefined) return null;
          autoPrimaryHex = primaryHex;
          storageSet(STORAGE_AUTO_PRIMARY, primaryHex);
          var next = {
            id: AUTO_SKIN_ID,
            name: "壁纸配色 Auto",
            colorScheme: scheme,
            primary: primaryHex,
            tokens: tokensFromPrimaryColor(adjustSaturation(primaryHex, saturationFactor), scheme)
          };
          autoDisposer = ctx.theme.register(next);
          autoSkin = next;
          return next;
        } finally {
          reentrantThemeDance = false;
        }
      }
      function skinNameOf(id) {
        var preset = SKINS.find((skin) => skin.id === id);
        if (preset !== undefined) return preset.name;
        if (autoSkin !== null && autoSkin.id === id) return autoSkin.name;
        if (customSkin !== null && customSkin.id === id) return customSkin.name;
        return id;
      }
      function registerCustomSkin(scheme, primaryHex) {
        // Same re-entrancy guard as the Auto skin: disposing the active
        // custom theme resets the preference and can flip the scheme.
        reentrantThemeDance = true;
        try {
          if (customDisposer !== null) {
            customDisposer();
            customDisposer = null;
            customSkin = null;
          }
          if (primaryHex === null || primaryHex === undefined) return null;
          customPrimaryHex = primaryHex;
          storageSet(STORAGE_CUSTOM_PRIMARY, primaryHex);
          var next = {
            id: CUSTOM_SKIN_ID,
            name: "自定义主色",
            colorScheme: scheme,
            primary: primaryHex,
            tokens: tokensFromPrimaryColor(adjustSaturation(primaryHex, saturationFactor), scheme)
          };
          customDisposer = ctx.theme.register(next);
          customSkin = next;
          return next;
        } finally {
          reentrantThemeDance = false;
        }
      }

      // Re-tint Auto skin when light/dark scheme flips (built-in preference).
      var lastScheme = ctx.theme.getTheme().active.colorScheme;
      // Guards against the re-entrant theme/change publishes produced while a
      // saturation re-registration disposes and re-registers skins (disposing
      // the active theme resets the preference to the built-in default).
      var reentrantThemeDance = false;
      var schemeWatchOff = ctx.on("theme/change", (snapshot) => {
        var nextScheme = snapshot.active.colorScheme;
        // Ignore publishes produced by our own guarded re-registrations
        // entirely (including the lastScheme sync): their final setTheme
        // publish is observed with the correct scheme once the guard lifts.
        if (reentrantThemeDance) return;
        if (nextScheme === lastScheme) return;
        lastScheme = nextScheme;
        var wasAuto = snapshot.active.id === AUTO_SKIN_ID
          || storageGet(STORAGE_ACTIVE) === AUTO_SKIN_ID;
        var wasCustom = snapshot.active.id === CUSTOM_SKIN_ID
          || storageGet(STORAGE_ACTIVE) === CUSTOM_SKIN_ID;
        if (autoPrimaryHex !== null && autoPrimaryHex !== undefined) {
          registerAutoSkin(nextScheme, autoPrimaryHex);
          if (wasAuto && autoSkin !== null) {
            try { ctx.theme.setTheme(AUTO_SKIN_ID); } catch (error) { /* ignore */ }
          }
        }
        if (customPrimaryHex !== null && customPrimaryHex !== undefined) {
          registerCustomSkin(nextScheme, customPrimaryHex);
          if (wasCustom && customSkin !== null) {
            try { ctx.theme.setTheme(CUSTOM_SKIN_ID); } catch (error) { /* ignore */ }
          }
        }
      });

      var selfChange = false;
      var restoreArmed = true;
      var restoreDeadline = Date.now() + 5000;
      var restoreOff = ctx.on("theme/change", (snapshot) => {
        if (!restoreArmed || selfChange) return;
        if (Date.now() > restoreDeadline) { restoreArmed = false; return; }
        var stored = storageGet(STORAGE_ACTIVE);
        if (stored === AUTO_SKIN_ID && autoSkin === null) return;
        if (stored === null || !isValidSkinId(stored)) {
          if (stored !== null) storageRemove(STORAGE_ACTIVE);
          restoreArmed = false;
          return;
        }
        var preference = snapshot.preference;
        var isBuiltIn = preference === "light" || preference === "dark" || preference === "system";
        if (!isBuiltIn) return;
        if (snapshot.active.id !== stored) {
          selfChange = true;
          try { ctx.theme.setTheme(stored); } catch (error) { /* ignore */ }
          selfChange = false;
          restoreArmed = false;
        }
      });
      (function restoreImmediately() {
        var stored = storageGet(STORAGE_ACTIVE);
        if (stored === null || stored === AUTO_SKIN_ID) return;
        if (stored === CUSTOM_SKIN_ID) {
          if (customSkin === null) {
            storageRemove(STORAGE_ACTIVE);
            return;
          }
          selfChange = true;
          try { ctx.theme.setTheme(CUSTOM_SKIN_ID); } catch (error) { /* ignore */ }
          selfChange = false;
          return;
        }
        if (!SKINS.some((skin) => skin.id === stored)) {
          storageRemove(STORAGE_ACTIVE);
          return;
        }
        selfChange = true;
        try { ctx.theme.setTheme(stored); } catch (error) { /* ignore */ }
        selfChange = false;
      })();

      // Wallpaper layer
      var wallpaperLayer = document.createElement("div");
      wallpaperLayer.setAttribute("data-my-skin", "wallpaper-layer");
      wallpaperLayer.style.cssText = [
        "position: fixed",
        "inset: 0",
        "z-index: -1",
        "pointer-events: none",
        "background-size: cover",
        "background-position: center",
        "background-repeat: no-repeat",
        "display: none"
      ].join("; ") + ";";
      document.body.appendChild(wallpaperLayer);
      var wallpaperOverride = null;

      // Grain layer: tiled SVG noise, fixed behind the UI, only visible over
      // the wallpaper. pointer-events never reaches it.
      var wallpaperNoiseLayer = document.createElement("div");
      wallpaperNoiseLayer.setAttribute("data-my-skin", "wallpaper-noise");
      wallpaperNoiseLayer.style.cssText = [
        "position: fixed",
        "inset: 0",
        "z-index: -1",
        "pointer-events: none",
        "background-image: url(\"" + NOISE_DATA_URL + "\")",
        "background-size: 128px 128px",
        "background-repeat: repeat",
        "opacity: 0",
        "display: none"
      ].join("; ") + ";";
      document.body.appendChild(wallpaperNoiseLayer);

      function renderWallpaper(wallpaper) {
        if (wallpaper === null || wallpaper === undefined || !wallpaper.dataUrl) {
          wallpaperLayer.style.display = "none";
          wallpaperLayer.style.backgroundImage = "";
          wallpaperLayer.style.opacity = "";
          wallpaperLayer.style.filter = "";
          wallpaperNoiseLayer.style.display = "none";
          wallpaperNoiseLayer.style.opacity = "0";
          if (wallpaperOverride !== null) {
            wallpaperOverride();
            wallpaperOverride = null;
          }
          return;
        }
        wallpaperLayer.style.display = "block";
        wallpaperLayer.style.backgroundImage = "url(\"" + wallpaper.dataUrl + "\")";
        wallpaperLayer.style.opacity = String(wallpaper.opacity);
        wallpaperLayer.style.filter = "blur(" + wallpaper.blur + "px)";
        var noise = typeof wallpaper.noise === "number" ? wallpaper.noise : 0;
        wallpaperNoiseLayer.style.display = noise > 0 ? "block" : "none";
        wallpaperNoiseLayer.style.opacity = String(noise);
        if (wallpaperOverride === null) {
          wallpaperOverride = ctx.theme.overrideTokens("my-skin:wallpaper", {
            "--dsw-alias-bg-base": {
              light: "rgba(255,255,255,0.1)",
              dark: "rgba(16,16,24,0.1)"
            },
            "--dsw-alias-bg-layer-1": {
              light: "rgba(255,255,255,0.55)",
              dark: "rgba(24,24,34,0.55)"
            },
            "--dsw-specific-sidebar-fill": {
              light: "rgba(255,255,255,0.5)",
              dark: "rgba(20,20,30,0.5)"
            }
          });
        }
      }

      function loadWallpaper() {
        var raw = storageGet(STORAGE_WALLPAPER);
        if (raw === null) return null;
        try {
          var parsed = JSON.parse(raw);
          if (parsed !== null && typeof parsed === "object"
            && typeof parsed.dataUrl === "string" && parsed.dataUrl.length > 0) {
            return {
              dataUrl: parsed.dataUrl,
              opacity: typeof parsed.opacity === "number" ? parsed.opacity : 0.5,
              blur: typeof parsed.blur === "number" ? parsed.blur : 0,
              noise: typeof parsed.noise === "number" ? Math.max(0, Math.min(0.4, parsed.noise)) : 0
            };
          }
        } catch (error) { /* corrupt */ }
        return null;
      }

      function saveWallpaper(wallpaper) {
        if (wallpaper !== null && wallpaper !== undefined && wallpaper.dataUrl) {
          storageSet(STORAGE_WALLPAPER, JSON.stringify(wallpaper));
        } else {
          storageRemove(STORAGE_WALLPAPER);
        }
      }

      var uiState = {
        version: 0,
        tryOnId: null,
        appliedId: (function () {
          var stored = storageGet(STORAGE_ACTIVE);
          if (stored !== null && SKINS.some((skin) => skin.id === stored)) return stored;
          if (stored === AUTO_SKIN_ID) return AUTO_SKIN_ID;
          return "dark";
        })()
      };
      var uiListeners = new Set();
      function setUiState(patch) {
        uiState = Object.assign({}, uiState, patch, { version: uiState.version + 1 });
        for (var listener of uiListeners) listener();
      }
      function subscribeUi(listener) {
        uiListeners.add(listener);
        return () => { uiListeners.delete(listener); };
      }

      var bootWallpaper = loadWallpaper();
      renderWallpaper(bootWallpaper);
      if (bootWallpaper === null) {
        if (storageGet(STORAGE_ACTIVE) === AUTO_SKIN_ID) storageRemove(STORAGE_ACTIVE);
        storageRemove(STORAGE_AUTO_PRIMARY);
        autoPrimaryHex = null;
      } else {
        extractPrimaryColor(bootWallpaper.dataUrl).then((hex) => {
          var scheme = ctx.theme.getTheme().active.colorScheme;
          registerAutoSkin(scheme, hex);
          var stored = storageGet(STORAGE_ACTIVE);
          if (stored === AUTO_SKIN_ID) {
            selfChange = true;
            try { ctx.theme.setTheme(AUTO_SKIN_ID); } catch (error) { /* ignore */ }
            selfChange = false;
            setUiState({ appliedId: AUTO_SKIN_ID });
          }
        }).catch(() => {
          if (storageGet(STORAGE_ACTIVE) === AUTO_SKIN_ID) storageRemove(STORAGE_ACTIVE);
        });
      }

      function SkinSettingsRow() {
        var activeId = React.useSyncExternalStore(
          (onStoreChange) => ctx.on("theme/change", onStoreChange),
          () => ctx.theme.getTheme().active.id
        );
        var ui = React.useSyncExternalStore(subscribeUi, () => uiState);
        var [wallpaper, setWallpaper] = React.useState(loadWallpaper());
        var [wallpaperError, setWallpaperError] = React.useState("");
        var [extracting, setExtracting] = React.useState(false);
        var [dragActive, setDragActive] = React.useState(false);
        var [justAppliedId, setJustAppliedId] = React.useState(null);
        var [saturation, setSaturation] = React.useState(loadSaturation());
        var [slidingControl, setSlidingControl] = React.useState(null);
        var [customPrimary, setCustomPrimary] = React.useState(
          customPrimaryHex !== null && customPrimaryHex !== undefined ? customPrimaryHex : "#9b5dff");
        var [customText, setCustomText] = React.useState(
          customPrimaryHex !== null && customPrimaryHex !== undefined ? customPrimaryHex : "");
        var [customColorError, setCustomColorError] = React.useState("");
        var dragDepth = React.useRef(0);
        var justAppliedTimer = React.useRef(null);
        var saturationTimer = React.useRef(null);
        var customColorTimer = React.useRef(null);
        React.useEffect(() => () => {
          if (justAppliedTimer.current !== null) {
            clearTimeout(justAppliedTimer.current);
            justAppliedTimer.current = null;
          }
          if (saturationTimer.current !== null) {
            clearTimeout(saturationTimer.current);
            saturationTimer.current = null;
          }
          if (customColorTimer.current !== null) {
            clearTimeout(customColorTimer.current);
            customColorTimer.current = null;
          }
          for (var timerKey in rowClickTimers) {
            clearTimeout(rowClickTimers[timerKey]);
            delete rowClickTimers[timerKey];
          }
        }, []);
        React.useEffect(() => {
          function endSliding() {
            setSlidingControl(null);
          }
          window.addEventListener("pointerup", endSliding);
          window.addEventListener("pointercancel", endSliding);
          return () => {
            window.removeEventListener("pointerup", endSliding);
            window.removeEventListener("pointercancel", endSliding);
          };
        }, []);
        // Mark the settings modal's overlay while sliding so the CSS can hide
        // the whole modal (mask + panel + nav) and reveal the main interface.
        React.useEffect(() => {
          if (slidingControl === null) {
            var stale = document.querySelector('[data-my-skin-sliding="true"]');
            if (stale !== null) stale.removeAttribute("data-my-skin-sliding");
            return;
          }
          var panelEl = document.querySelector('[data-my-skin="settings-panel"]');
          var dialogEl = panelEl !== null ? panelEl.closest('[role="dialog"]') : null;
          var overlayEl = dialogEl !== null ? dialogEl.parentElement : null;
          if (overlayEl === null) return;
          overlayEl.setAttribute("data-my-skin-sliding", "true");
          return () => {
            overlayEl.removeAttribute("data-my-skin-sliding");
          };
        }, [slidingControl]);

        function tryOn(id) {
          setUiState({ tryOnId: id });
          ctx.theme.setTheme(id);
        }
        function applySkin(id) {
          if (rowClickTimers[id] !== undefined) {
            clearTimeout(rowClickTimers[id]);
            delete rowClickTimers[id];
          }
          storageSet(STORAGE_ACTIVE, id);
          setUiState({ tryOnId: null, appliedId: id });
          ctx.theme.setTheme(id);
          setJustAppliedId(id);
          if (justAppliedTimer.current !== null) clearTimeout(justAppliedTimer.current);
          justAppliedTimer.current = setTimeout(() => {
            justAppliedTimer.current = null;
            setJustAppliedId(null);
          }, 1200);
        }
        function cancelTryOn() {
          setUiState({ tryOnId: null });
          ctx.theme.setTheme(ui.appliedId);
        }
        function restoreDefault() {
          storageRemove(STORAGE_ACTIVE);
          setUiState({ tryOnId: null, appliedId: "dark" });
          ctx.theme.setTheme("dark");
          if (justAppliedTimer.current !== null) clearTimeout(justAppliedTimer.current);
          justAppliedTimer.current = null;
          setJustAppliedId(null);
          for (var timerKey in rowClickTimers) {
            clearTimeout(rowClickTimers[timerKey]);
            delete rowClickTimers[timerKey];
          }
        }

        function changeWallpaper(next) {
          setWallpaper(next);
          saveWallpaper(next);
          renderWallpaper(next);
        }
        function removeWallpaper() {
          if (extracting) return;
          setWallpaperError("");
          var wasAutoActive = activeId === AUTO_SKIN_ID;
          changeWallpaper(null);
          if (autoDisposer !== null) {
            reentrantThemeDance = true;
            try {
              autoDisposer();
            } finally {
              reentrantThemeDance = false;
            }
            autoDisposer = null;
            autoSkin = null;
          }
          autoPrimaryHex = null;
          storageRemove(STORAGE_AUTO_PRIMARY);
          var stored = storageGet(STORAGE_ACTIVE);
          if (stored === AUTO_SKIN_ID) {
            storageRemove(STORAGE_ACTIVE);
            setUiState({ tryOnId: null, appliedId: "dark" });
            ctx.theme.setTheme("dark");
          } else if (wasAutoActive) {
            var fallback = stored !== null && SKINS.some((skin) => skin.id === stored) ? stored : "dark";
            setUiState({ tryOnId: null, appliedId: fallback });
            ctx.theme.setTheme(fallback);
          }
        }
        // Shared file intake for the picker and drag-and-drop: same type and
        // size validation, same read → save → extract → apply flow.
        function handleWallpaperFile(file) {
          if (extracting || file === undefined || file === null) return;
          if (!/^image\//.test(file.type || "")) {
            setWallpaperError("仅支持图片文件（jpg/png 等），请选择图片后重试。");
            return;
          }
          if (file.size > MAX_WALLPAPER_BYTES) {
            setWallpaperError("图片超过 10MB，无法保存。请换一张更小的图片。");
            return;
          }
          setWallpaperError("");
          setExtracting(true);
          var reader = new FileReader();
          reader.onload = () => {
            var dataUrl = String(reader.result);
            changeWallpaper({
              dataUrl: dataUrl,
              opacity: wallpaper === null ? 0.5 : wallpaper.opacity,
              blur: wallpaper === null ? 0 : wallpaper.blur,
              noise: wallpaper === null ? 0 : wallpaper.noise
            });
            extractPrimaryColor(dataUrl).then((hex) => {
              var scheme = ctx.theme.getTheme().active.colorScheme;
              registerAutoSkin(scheme, hex);
              applySkin(AUTO_SKIN_ID);
              setExtracting(false);
            }).catch(() => {
              setWallpaperError("壁纸已保存，但无法提取主色生成配色。");
              setExtracting(false);
            });
          };
          reader.onerror = () => {
            setWallpaperError("读取图片失败，请重试。");
            setExtracting(false);
          };
          reader.readAsDataURL(file);
        }
        function onFileChange(event) {
          var file = event.target.files && event.target.files[0];
          event.target.value = "";
          handleWallpaperFile(file);
        }
        function handleDragEnter(event) {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current += 1;
          if (dragDepth.current === 1) setDragActive(true);
        }
        function handleDragOver(event) {
          event.preventDefault();
          event.stopPropagation();
        }
        function handleDragLeave(event) {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragActive(false);
        }
        function handleDrop(event) {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDragActive(false);
          var file = event.dataTransfer.files && event.dataTransfer.files[0];
          handleWallpaperFile(file);
        }
        function handleRowClick(id) {
          if (rowClickTimers[id] !== undefined) {
            clearTimeout(rowClickTimers[id]);
            delete rowClickTimers[id];
            applySkin(id);
            return;
          }
          rowClickTimers[id] = setTimeout(() => {
            delete rowClickTimers[id];
            tryOn(id);
          }, 240);
        }
        // Re-register every skin with the new saturation and restore the
        // active one. Disposing the active theme resets the preference to the
        // built-in default, so setTheme() re-applies it afterwards.
        function applySaturationFactor(factor) {
          if (factor === saturationFactor) return;
          saturationFactor = factor;
          storageSet(STORAGE_SATURATION, String(factor));
          // Read the live snapshot: the debounced call may run after the user
          // switched skins, so the render-time closure could be stale.
          var activeNow = ctx.theme.getTheme().active.id;
          var activeIsOurs = activeNow !== "dark" && activeNow !== "light" && activeNow !== "system";
          reentrantThemeDance = true;
          try {
            SKINS.forEach(registerPreset);
            if (autoSkin !== null) {
              registerAutoSkin(autoSkin.colorScheme, autoSkin.primary);
            }
            if (customSkin !== null) {
              registerCustomSkin(customSkin.colorScheme, customSkin.primary);
            }
            if (activeIsOurs) {
              selfChange = true;
              try { ctx.theme.setTheme(activeNow); } catch (error) { /* ignore */ }
              selfChange = false;
            }
          } finally {
            reentrantThemeDance = false;
          }
        }
        function changeSaturation(nextFactor) {
          nextFactor = Math.max(0, Math.min(2, nextFactor));
          setSaturation(nextFactor);
          if (saturationTimer.current !== null) clearTimeout(saturationTimer.current);
          saturationTimer.current = setTimeout(() => {
            saturationTimer.current = null;
            applySaturationFactor(nextFactor);
          }, 80);
        }
        // Re-register the custom skin with a new primary, then preview it
        // (or re-apply live when it is already the active skin).
        function applyCustomPrimary(hex) {
          if (hex === customPrimaryHex) return;
          customPrimaryHex = hex;
          storageSet(STORAGE_CUSTOM_PRIMARY, hex);
          var scheme = customSkin !== null
            ? customSkin.colorScheme
            : ctx.theme.getTheme().active.colorScheme;
          registerCustomSkin(scheme, hex);
          var activeNow = ctx.theme.getTheme().active.id;
          if (activeNow === CUSTOM_SKIN_ID) {
            selfChange = true;
            try { ctx.theme.setTheme(CUSTOM_SKIN_ID); } catch (error) { /* ignore */ }
            selfChange = false;
          } else {
            tryOn(CUSTOM_SKIN_ID);
          }
        }
        function changeCustomPrimary(nextHex, sourceText) {
          setCustomPrimary(nextHex);
          if (sourceText !== undefined) setCustomText(sourceText);
          setCustomColorError("");
          if (customColorTimer.current !== null) clearTimeout(customColorTimer.current);
          customColorTimer.current = setTimeout(() => {
            customColorTimer.current = null;
            applyCustomPrimary(nextHex);
          }, 80);
        }
        function handleCustomColorChange(event) {
          var hex = String(event.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
            changeCustomPrimary(hex.toLowerCase(), hex.toLowerCase());
          }
        }
        function handleCustomTextChange(event) {
          var text = event.target.value;
          setCustomText(text);
          var trimmed = text.trim();
          if (trimmed === "") {
            setCustomColorError("");
            return;
          }
          var hex = parseCustomColor(trimmed);
          if (hex === null) {
            // While typing, keep quiet if the text could still become valid.
            var partial = /^#?[0-9a-fA-F]{0,6}$/.test(trimmed)
              || /^\d{0,3}(\s*,\s*\d{0,3}){0,2}\s*,?\s*$/.test(trimmed);
            if (!partial) {
              setCustomColorError("颜色格式无效，请输入 #RRGGBB 或 R,G,B（0-255）。");
            }
            return;
          }
          changeCustomPrimary(hex, hex);
        }

        var rowBase = {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          margin: "6px 0",
          borderRadius: "8px",
          cursor: "pointer"
        };

        function renderSkinRow(skin) {
          var isActive = activeId === skin.id;
          var isApplied = ui.appliedId === skin.id;
          var badge = isActive ? (isApplied ? "已应用" : "试穿中") : "";
          var baseColor = skin.id === AUTO_SKIN_ID
            ? (autoPrimaryHex !== null && autoPrimaryHex !== undefined ? autoPrimaryHex : "#9b5dff")
            : skin.primary;
          var barColor = adjustSaturation(baseColor, saturation);
          var rowState = isActive ? (isApplied ? "applied" : "trying") : "";
          return h(
            "div",
            {
              key: skin.id,
              "data-my-skin": "skin-row",
              "data-skin-id": skin.id,
              "data-row-state": rowState,
              style: rowBase,
              onClick: () => handleRowClick(skin.id)
            },
            h("div", {
              "data-my-skin": "skin-bar",
              style: {
                marginRight: "10px",
                alignSelf: "stretch",
                borderRadius: "2px",
                flexShrink: 0,
                background: barColor
              }
            }),
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flex: 1 } },
              h("span", {
                "data-my-skin": "skin-dot",
                style: {
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: barColor
                }
              }),
              h("span", { style: { fontWeight: 500, color: "var(--dsw-alias-label-primary, #e0e0e0)" } }, skin.name),
              h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, #a0a0a0)" } },
                skin.colorScheme === "dark" ? "深色" : "浅色"),
              badge !== ""
                ? h("span", {
                  "data-my-skin": "skin-badge",
                  style: {
                    fontSize: "12px",
                    padding: "1px 8px",
                    borderRadius: "10px",
                    color: "var(--dsw-alias-label-primary-foreground, #fff)",
                    background: isApplied
                      ? "var(--dsw-alias-brand-primary, #9b5dff)"
                      : "var(--dsw-alias-state-warn-primary, #c98a00)"
                  }
                }, badge)
                : null
            ),
            h("button", {
              type: "button",
              "data-my-skin": "apply",
              "data-skin-id": skin.id,
              style: primaryButtonStyle(),
              onClick: (event) => {
                event.stopPropagation();
                applySkin(skin.id);
              }
            }, justAppliedId === skin.id ? "已应用 ✓" : "应用")
          );
        }

        var rows = SKINS.map(renderSkinRow);
        var dynamicRows = autoSkin === null ? [] : [renderSkinRow(autoSkin)];

        // Always-mounted banner so it can fade in and out (opacity + collapse).
        var bannerVisible = ui.tryOnId !== null;
        var tryOnBanner = h("div", {
          "data-my-skin": "tryon-banner",
          style: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: bannerVisible ? "8px 12px" : "0 12px",
            margin: bannerVisible ? "6px 0" : "0",
            maxHeight: bannerVisible ? "120px" : "0",
            overflow: "hidden",
            opacity: bannerVisible ? 1 : 0,
            pointerEvents: bannerVisible ? "auto" : "none",
            visibility: bannerVisible ? "visible" : "hidden",
            transition: bannerVisible
              ? "opacity 0.2s ease, max-height 0.2s ease, padding 0.2s ease, margin 0.2s ease"
              : "opacity 0.2s ease, max-height 0.2s ease, padding 0.2s ease, margin 0.2s ease, visibility 0s linear 0.2s",
            borderRadius: "8px",
            background: "var(--dsw-alias-state-warn-primary, #c98a00)",
            color: "var(--dsw-alias-label-primary-foreground, #fff)",
            fontSize: "13px"
          }
        },
          h("span", { style: { flex: 1 } },
            "试穿中：" + skinNameOf(ui.tryOnId !== null ? ui.tryOnId : ui.appliedId)),
          h("button", {
            type: "button",
            style: primaryButtonStyle({ background: "var(--dsw-alias-bg-layer-1, #fff)", color: "var(--dsw-alias-label-primary, #333)", marginLeft: 0 }),
            "data-my-skin": "tryon-apply",
            onClick: () => applySkin(ui.tryOnId)
          }, "应用"),
          h("button", {
            type: "button",
            style: secondaryButtonStyle({ background: "rgba(0,0,0,0.2)", color: "var(--dsw-alias-label-primary-foreground, #fff)", border: "none" }),
            "data-my-skin": "tryon-cancel",
            onClick: cancelTryOn
          }, "取消试穿")
        );

        var wallpaperControls = h("div", {
          "data-my-skin": "wallpaper-drop-zone",
          style: {
            margin: "10px 0 4px",
            padding: "12px",
            borderRadius: "8px",
            background: dragActive
              ? "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.08))"
              : "var(--dsw-alias-bg-layer-1, #16213e)",
            outline: dragActive ? "1px solid var(--dsw-alias-brand-primary, #9b5dff)" : "none",
            transition: "background 0.15s ease"
          },
          onDragEnter: handleDragEnter,
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop
        },
          h("div", {
            style: {
              fontWeight: 500,
              color: "var(--dsw-alias-label-primary, #e0e0e0)",
              marginBottom: "8px"
            }
          }, "自定义壁纸"),
          h("input", {
            type: "file",
            accept: "image/*",
            id: "my-skin-wallpaper-input",
            style: { display: "none" },
            onChange: onFileChange
          }),
          h("label", {
            htmlFor: "my-skin-wallpaper-input",
            style: Object.assign({}, primaryButtonStyle({ marginLeft: 0, display: "inline-block" }),
              extracting ? { opacity: 0.6, cursor: "not-allowed", pointerEvents: "none" } : null)
          }, extracting ? "提取配色中…" : "选择图片（jpg/png，≤ 10MB）"),
          h("div", {
            style: {
              marginTop: "6px",
              fontSize: "12px",
              color: "var(--dsw-alias-label-secondary, #a0a0a0)"
            }
          }, "或将图片拖入此区域（jpg/png，≤ 10MB）"),
          autoSkin !== null
            ? h("div", {
              key: "auto-note",
              "data-my-skin": "auto-note",
              style: {
                marginTop: "8px",
                fontSize: "12px",
                color: "var(--dsw-alias-label-secondary, #a0a0a0)"
              }
            }, "已根据壁纸主色生成配色，可试穿「壁纸配色 Auto」")
            : null,
          autoSkin !== null
            ? h("button", {
              type: "button",
              "data-my-skin": "apply-auto-skin",
              disabled: extracting,
              style: primaryButtonStyle(Object.assign({ marginLeft: 0, marginTop: "8px", display: "block" },
                extracting ? { opacity: 0.6, cursor: "not-allowed" } : null)),
              onClick: () => applySkin(AUTO_SKIN_ID)
            }, justAppliedId === AUTO_SKIN_ID ? "已应用 ✓" : "应用壁纸配色")
            : null,
          wallpaper !== null && wallpaper !== undefined
            ? [
              h("div", {
                key: "opacity",
                "data-slider-group": "wallpaper-opacity",
                "data-active-slider": slidingControl === "wallpaper-opacity" ? "true" : undefined,
                style: {
                  marginTop: "10px",
                  color: "var(--dsw-alias-label-primary, #e0e0e0)",
                  fontSize: "13px"
                }
              },
                "透明度 ",
                h("input", {
                  type: "range",
                  min: "0",
                  max: "1",
                  step: "0.05",
                  value: String(wallpaper.opacity),
                  style: { verticalAlign: "middle" },
                  onPointerDown: () => setSlidingControl("wallpaper-opacity"),
                  onChange: (event) => changeWallpaper({ ...wallpaper, opacity: Number(event.target.value) })
                })
              ),
              h("div", {
                key: "blur",
                "data-slider-group": "wallpaper-blur",
                "data-active-slider": slidingControl === "wallpaper-blur" ? "true" : undefined,
                style: {
                  marginTop: "6px",
                  color: "var(--dsw-alias-label-primary, #e0e0e0)",
                  fontSize: "13px"
                }
              },
                "模糊 ",
              h("input", {
                type: "range",
                min: "0",
                max: "20",
                step: "1",
                value: String(wallpaper.blur),
                style: { verticalAlign: "middle" },
                onPointerDown: () => setSlidingControl("wallpaper-blur"),
                onChange: (event) => changeWallpaper({ ...wallpaper, blur: Number(event.target.value) })
              })
              ),
              h("div", {
                key: "noise",
                "data-slider-group": "wallpaper-noise",
                "data-active-slider": slidingControl === "wallpaper-noise" ? "true" : undefined,
                style: {
                  marginTop: "6px",
                  color: "var(--dsw-alias-label-primary, #e0e0e0)",
                  fontSize: "13px"
                }
              },
                "噪点 ",
                h("input", {
                  type: "range",
                  min: "0",
                  max: "0.4",
                  step: "0.01",
                  value: String(wallpaper.noise),
                  "data-my-skin": "noise-slider",
                  style: { verticalAlign: "middle" },
                  onPointerDown: () => setSlidingControl("wallpaper-noise"),
                  onChange: (event) => changeWallpaper({ ...wallpaper, noise: Number(event.target.value) })
                }),
                h("span", {
                  "data-my-skin": "noise-value",
                  style: {
                    fontSize: "12px",
                    color: "var(--dsw-alias-label-secondary, #a0a0a0)",
                    marginLeft: "6px"
                  }
                }, Math.round((wallpaper.noise || 0) * 100) + "%")
              ),
              h("button", {
                key: "remove",
                type: "button",
                "data-my-skin": "remove-wallpaper",
                disabled: extracting,
                style: dangerButtonStyle(extracting ? { opacity: 0.6, cursor: "not-allowed" } : null),
                onClick: removeWallpaper
              }, "移除壁纸")
            ]
            : null,
          wallpaperError !== ""
            ? h("div", {
              key: "error",
              style: {
                marginTop: "8px",
                color: "var(--dsw-alias-state-error-primary, #ff6b6b)",
                fontSize: "13px"
              }
            }, wallpaperError)
            : null
        );

        return h("div", {
          style: { margin: "8px 0" },
          "data-my-skin": "settings-panel",
          "data-sliding": slidingControl !== null ? "true" : undefined
        },
          h("div", {
            style: {
              fontWeight: 600,
              color: "var(--dsw-alias-label-primary, #e0e0e0)",
              marginBottom: "6px"
            }
          }, "皮肤 my-skin"),
          h("div", {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-secondary, #a0a0a0)",
              marginBottom: "4px"
            }
          }, "单击皮肤试穿，双击直接应用；确认后点击「应用」保存"),
          tryOnBanner,
          rows,
          dynamicRows,
          h("div", {
            "data-my-skin": "custom-control",
            style: {
              margin: "10px 0 4px",
              padding: "12px",
              borderRadius: "8px",
              background: "var(--dsw-alias-bg-layer-1, #16213e)"
            }
          },
            customSkin !== null
              ? h("div", { style: { marginBottom: "8px" } }, renderSkinRow(customSkin))
              : null,
            h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
              h("span", {
                style: {
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--dsw-alias-label-primary, #e0e0e0)"
                }
              }, "自定义主色"),
              h("input", {
                type: "color",
                "data-my-skin": "custom-color",
                value: customPrimary,
                style: {
                  width: "36px",
                  height: "28px",
                  padding: "0",
                  border: "1px solid var(--dsw-alias-border-l2, #555)",
                  borderRadius: "6px",
                  background: "transparent",
                  cursor: "pointer"
                },
                onChange: handleCustomColorChange
              }),
              h("input", {
                type: "text",
                "data-my-skin": "custom-text",
                value: customText,
                placeholder: "#RRGGBB 或 R,G,B",
                spellCheck: false,
                style: {
                  width: "150px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--dsw-alias-border-l2, #555)",
                  background: "var(--dsw-alias-bg-layer-2, #1a1e2e)",
                  color: "var(--dsw-alias-label-primary, #e0e0e0)",
                  fontSize: "12px"
                },
                onChange: handleCustomTextChange
              }),
              h("button", {
                type: "button",
                "data-my-skin": "custom-apply",
                disabled: customSkin === null || extracting,
                style: primaryButtonStyle(Object.assign({ marginLeft: 0 },
                  customSkin === null || extracting ? { opacity: 0.6, cursor: "not-allowed" } : null)),
                onClick: () => applySkin(CUSTOM_SKIN_ID)
              }, justAppliedId === CUSTOM_SKIN_ID ? "已应用 ✓" : "应用")
            ),
            h("div", {
              "data-my-skin": "custom-current",
              style: {
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--dsw-alias-label-secondary, #a0a0a0)"
              }
            }, "当前色值 " + (customPrimaryHex !== null && customPrimaryHex !== undefined ? customPrimaryHex : "未设置")),
            customColorError !== ""
              ? h("div", {
                "data-my-skin": "custom-error",
                style: {
                  marginTop: "6px",
                  fontSize: "12px",
                  color: "var(--dsw-alias-state-error-primary, #ff6b6b)"
                }
              }, customColorError)
              : null
          ),
          h("div", {
            "data-my-skin": "saturation-control",
            style: {
              margin: "10px 0 4px",
              padding: "12px",
              borderRadius: "8px",
              background: "var(--dsw-alias-bg-layer-1, #16213e)"
            }
          },
            h("div", {
              style: {
                fontWeight: 500,
                color: "var(--dsw-alias-label-primary, #e0e0e0)",
                marginBottom: "8px"
              }
            }, "全局饱和度"),
            h("div", {
              "data-slider-group": "saturation",
              "data-active-slider": slidingControl === "saturation" ? "true" : undefined,
              style: { display: "flex", alignItems: "center", gap: "8px" }
            },
              h("input", {
                type: "range",
                min: "0",
                max: "2",
                step: "0.05",
                value: String(saturation),
                "data-my-skin": "saturation-slider",
                style: { flex: 1, verticalAlign: "middle" },
                onPointerDown: () => setSlidingControl("saturation"),
                onChange: (event) => changeSaturation(Number(event.target.value))
              }),
              h("span", {
                "data-my-skin": "saturation-value",
                style: {
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-secondary, #a0a0a0)",
                  minWidth: "38px",
                  textAlign: "right"
                }
              }, Math.round(saturation * 100) + "%")
            ),
            h("div", {
              style: {
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--dsw-alias-label-secondary, #a0a0a0)"
              }
            }, "影响当前及之后应用的皮肤配色")
          ),
          h("button", {
            type: "button",
            "data-my-skin": "restore-default",
            style: secondaryButtonStyle({ marginLeft: 0, marginTop: "6px" }),
            onClick: restoreDefault
          }, "恢复默认（内置深色）"),
          wallpaperControls
        );
      }

      var slotDisposer = ctx.slots.inject("settings.general.item", () =>
        ctx.slots.register({
          name: "settings.general.item",
          id: "my-skin-skins",
          order: 20,
          label: "my-skin",
        }, SkinSettingsRow)
      );

      return () => {
        slotDisposer();
        restoreOff();
        schemeWatchOff();
        wallpaperLayer.remove();
        wallpaperNoiseLayer.remove();
        if (wallpaperOverride !== null) wallpaperOverride();
        if (autoDisposer !== null) autoDisposer();
        if (customDisposer !== null) customDisposer();
        for (var skinId in skinDisposers) skinDisposers[skinId]();
        for (var timerId in rowClickTimers) {
          clearTimeout(rowClickTimers[timerId]);
          delete rowClickTimers[timerId];
        }
        skinStyleEl.remove();
      };
    };

    return module.exports;
  }
});
