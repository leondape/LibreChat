# PptxGenJS Tutorial

> **CRITICAL — write and run the script in ONE step.** Intermediate script files you write (e.g. `deck.cjs`) may not be present in a *separate* later execution call. If you write the script in one step and run `node` in another, Node can report "cannot find module / file not found" — that's a persistence quirk, **not** a real error, so do not start debugging paths. Always create the script and run it in the **same** command using a heredoc (see Setup below), and write the `.pptx` output to `/mnt/data` so it's available for delivery.
>
> **CRITICAL — use `.cjs` with `require`.** Plain CommonJS runs directly with `node` (no compile step) and avoids every pitfall below. Do **NOT** use `.mjs` (there `require` is undefined → `ReferenceError: require is not defined`). Only if you deliberately run a `.ts` file through the TypeScript runner do you need to end it with `export {};` (the `.ts` path compiles with the DOM lib, so top-level `const`s otherwise collide with DOM globals like `Document`, `Text`). `.cjs` avoids this entirely — prefer it.

## Setup & Basic Structure

**Always build and run in a single command**, and write the output to `/mnt/data` so it persists for delivery:

```bash
cat > deck.cjs <<'PPTX'
const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // or LAYOUT_16x10, LAYOUT_4x3, LAYOUT_WIDE
pres.title = "Presentation Title";

let slide = pres.addSlide();
slide.addText("Hello World!", { x: 0.5, y: 0.5, fontSize: 36, color: "363636" });

pres.writeFile({ fileName: "/mnt/data/Presentation.pptx" });
PPTX
node deck.cjs
# Optional: QA in the SAME step (avoids an extra round-trip)
python3 -m markitdown /mnt/data/Presentation.pptx
```

Because it's a `.cjs` file run directly by Node, you do **not** need `export {};`. The `.pptx` output is a data file, so it persists and can be delivered.

**Layouts (inches):** `LAYOUT_16x9` 10×5.625 (default) · `LAYOUT_16x10` 10×6.25 · `LAYOUT_4x3` 10×7.5 · `LAYOUT_WIDE` 13.3×7.5

---

## Text

```javascript
slide.addText("Simple Text", {
  x: 1, y: 1, w: 8, h: 2, fontSize: 24, fontFace: "Arial",
  color: "363636", bold: true, align: "center", valign: "middle"
});

// Rich runs / multi-line — each item needs breakLine: true except the last
slide.addText([
  { text: "Line 1", options: { bold: true, breakLine: true } },
  { text: "Line 2" }
], { x: 0.5, y: 0.5, w: 8, h: 2 });
```

**Tip:** text boxes have internal padding — set `margin: 0` when aligning text with shapes/lines/icons. Use `charSpacing` (not `letterSpacing`) for tracking.

### Lists & Bullets

```javascript
slide.addText([
  { text: "First item", options: { bullet: true, breakLine: true } },
  { text: "Second item", options: { bullet: true } }
], { x: 0.5, y: 0.5, w: 8, h: 3 });
// Sub-item: options: { bullet: true, indentLevel: 1 }
// Numbered: options: { bullet: { type: "number" }, breakLine: true }
```

Use `bullet: true` — never unicode "•" (creates double bullets).

---

## Shapes

```javascript
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 0.8, w: 1.5, h: 3.0,
  fill: { color: "FF0000" }, line: { color: "000000", width: 2 }
});
slide.addShape(pres.shapes.OVAL, { x: 4, y: 1, w: 2, h: 2, fill: { color: "0000FF" } });
slide.addShape(pres.shapes.LINE, { x: 1, y: 3, w: 5, h: 0, line: { color: "FF0000", width: 3 } });

// Rounded rectangle (rectRadius ONLY on ROUNDED_RECTANGLE)
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1, y: 1, w: 3, h: 2, fill: { color: "FFFFFF" }, rectRadius: 0.1 });

// Shadow: use opacity (0-1) for transparency; offset must be >= 0; angle 135 = bottom-right, 270 = up
slide.addShape(pres.shapes.RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2, fill: { color: "FFFFFF" },
  shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 135, opacity: 0.15 }
});
```

Fill supports `transparency: 0-100`. Gradient fills aren't supported — use a gradient background image instead.

---

## Images

```javascript
slide.addImage({ path: "images/chart.png", x: 1, y: 1, w: 5, h: 3 });     // from file
slide.addImage({ data: "image/png;base64,iVBOR...", x: 1, y: 1, w: 5, h: 3 }); // from base64
// Options: rotate, rounding (circular crop), transparency, flipH/flipV, altText, hyperlink
// sizing: { type: "contain"|"cover"|"crop", w, h }
```

Formats: PNG, JPG, GIF; **SVG** works in modern PowerPoint (embed SVG directly — see Icons).

---

## Icons

Build small inline SVG strings and rasterize to PNG with **sharp** (preinstalled). `react-icons`/`react`/`react-dom` are **not** installed and there's no network — do not `require` or install them.

```javascript
const sharp = require("sharp");

async function svgToBase64Png(svg, size = 256) {
  const png = await sharp(Buffer.from(svg)).resize(size, size, {
    fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }
  }).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

// Hand-write the SVG path for whatever icon you need, then:
const iconData = await svgToBase64Png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4472C4"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z"/></svg>`, 256);
slide.addImage({ data: iconData, x: 1, y: 1, w: 0.5, h: 0.5 });
```

Use size ≥256 for crisp icons (`w`/`h` in inches set display size). Or embed user-provided image files.

---

## Backgrounds, Tables

```javascript
slide.background = { color: "F1F1F1" };                 // or { data: "image/png;base64,..." }

slide.addTable([
  [{ text: "Header", options: { fill: { color: "6699CC" }, color: "FFFFFF", bold: true } }, "H2"],
  ["Cell 1", "Cell 2"]
], { x: 1, y: 1, w: 8, colW: [4, 4], border: { pt: 1, color: "999999" } });
// Merge cells with options: { colspan: 2 }
```

---

## Charts

```javascript
slide.addChart(pres.charts.BAR, [{
  name: "Sales", labels: ["Q1", "Q2", "Q3", "Q4"], values: [4500, 5500, 6200, 7100]
}], { x: 0.5, y: 0.6, w: 6, h: 3, barDir: "col", showTitle: true, title: "Quarterly Sales" });

slide.addChart(pres.charts.LINE, [{ name: "Temp", labels: ["Jan","Feb","Mar"], values: [32,35,42] }],
  { x: 0.5, y: 4, w: 6, h: 3, lineSize: 3, lineSmooth: true });

slide.addChart(pres.charts.PIE, [{ name: "Share", labels: ["A","B","Other"], values: [35,45,20] }],
  { x: 7, y: 1, w: 5, h: 4, showPercent: true });
```

**Cleaner look:** `chartColors: [...]`, `showValue: true`, `showLegend: false`, `catGridLine: { style: "none" }`, muted `catAxisLabelColor`/`valAxisLabelColor`.

### Highlight ONE bar (don't overthink this)

For a **single-series** bar chart, `chartColors` maps **one color per bar**. To emphasize one, list its color first and the rest in the base color:

```javascript
slide.addChart(pres.charts.BAR, [{
  name: "Revenue", labels: ["North","South","East","West"], values: [450,310,280,210]
}], {
  x: 0.5, y: 1.6, w: 5.8, h: 3.4, barDir: "col",
  chartColors: ["00A896", "1E2761", "1E2761", "1E2761"], // North highlighted
  showValue: true, showLegend: false
});
```

Do **not** build a multi-series-with-nulls workaround — one series + `chartColors` is enough.

---

## Common Pitfalls (cause file corruption / bugs)

1. **Hex colors: no `#`** — `"FF0000"` ✅, `"#FF0000"` ❌ (corrupts file).
2. **Never encode opacity in hex** — 8-char colors like `"00000020"` corrupt the file; use the `opacity` property.
3. **Bullets:** use `bullet: true`, never unicode "•". Put `breakLine: true` between runs.
4. **Avoid `lineSpacing` with bullets** — use `paraSpaceAfter` instead.
5. **Fresh instance per deck** — don't reuse a `pptxgen()` object.
6. **Never reuse an option object across calls** — PptxGenJS mutates objects in place (e.g. shadow → EMU), corrupting the second use. Use a factory: `const makeShadow = () => ({ type:"outer", blur:6, offset:2, color:"000000", opacity:0.15 });`.
7. **`ROUNDED_RECTANGLE` + rectangular accent bars don't mix** — the bar won't cover rounded corners; use `RECTANGLE`.

---

## Quick Reference

- **Shapes**: RECTANGLE, OVAL, LINE, ROUNDED_RECTANGLE
- **Charts**: BAR, LINE, PIE, DOUGHNUT, SCATTER, BUBBLE, RADAR
- **Layouts**: LAYOUT_16x9 (10×5.625), LAYOUT_16x10, LAYOUT_4x3, LAYOUT_WIDE
- **Align**: "left", "center", "right" · **Data labels**: "outEnd", "inEnd", "center"
