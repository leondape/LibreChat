---
name: pptx
description: "Use when the user wants to build or edit a slide deck / PowerPoint — create slides, replace text, or adjust layout (.pptx)."
---

# PPTX

*Operation manual for an agent that reads, edits, and creates PowerPoint presentations.*

> **⛔ CREATING A DECK FROM SCRATCH? DO THIS FIRST.** Before writing any code, your **first reply must be one short question** asking the color preference, then **stop and wait** for the answer:
> *"What colors or theme would you like for the deck? (e.g. navy/executive, warm terracotta, teal — or any colors you have in mind. I'll go with navy if you're not sure.)"*
> Do not plan slides, pick a palette yourself, or write pptxgenjs code until the user answers (or says they don't care → use navy). Ask **once**, then build in a single pass using the Fast path defaults below. See "Creating from Scratch".

## Environment

The execution sandbox runs offline (**Python 3.14** + **Node/Bun**) with these libraries preinstalled (among others):

- **python-pptx** -- read/edit/create PowerPoint (Python)
- **pptxgenjs** -- create presentations (JavaScript/Node, see pptxgenjs.md)
- **markitdown** -- text extraction
- **Pillow** -- image I/O

No network access. No `pip install` / `npm install` at runtime. LibreOffice/`soffice` is **not** installed, so there is **no slide-to-image rendering** (`thumbnail.py` will fail).

## File Upload Validation

Creating a deck from scratch needs no upload. But if the user asks you to **edit or read an existing presentation**, the file must be in the sandbox. If the file is visible in chat context, use it directly. Only invoke the code interpreter when it is strictly required to perform the user's request. If the code interpreter is required and the file isn't in the sandbox, reply with EXACTLY this message and stop:

> **I can see your file, but the code interpreter can't access it.** Please re-upload it using the **"Upload for Code Interpreter"** option so the Agent can treat it correctly.

## Quick Reference

| Task | Guide |
|------|-------|
| Read/analyze content | `python3 -m markitdown presentation.pptx` |
| Edit or create from template | Read [editing.md](editing.md) |
| Create from scratch | Read [pptxgenjs.md](pptxgenjs.md) |

---

## Reading Content

```bash
# Text extraction (primary way to read/analyze a deck here)
python3 -m markitdown presentation.pptx

# Raw XML (for detailed structure/geometry)
python3 /mnt/data/pptx/scripts/office/unpack.py presentation.pptx unpacked/
```

No image rendering is available — read decks via `markitdown` text + unpacked XML; do not try to render slides to images.

---

## Editing Workflow

**Read [editing.md](editing.md) for full details.**

1. Analyze the template from its text (`markitdown`) and unpacked XML (no image rendering available).
2. Unpack → manipulate slides → edit content → clean → pack.

---

## Creating from Scratch

**Read [pptxgenjs.md](pptxgenjs.md) for full details.**

Use when no template or reference presentation is available.

> **Build in ONE step.** An intermediate script file you write may not be present in a *separate* later execution call — so write the script and run `node` in the **same** command (heredoc), writing the `.pptx` to `/mnt/data`. Prefer a `.cjs` file with `require`. A "cannot find module / file not found" error after a separate write step is just this persistence quirk, not a real bug — don't debug paths, just combine the steps. See pptxgenjs.md → Setup.

### Fast path — ask once, then build (don't deliberate)

**First ask the user ONE short question about the look**, then commit — e.g.:
> "What colors or theme would you like for the deck? (e.g. navy/executive, warm terracotta, teal — or any colors you have in mind. I'll go with navy if you're not sure.)"

Ask this **only once**. If they name a color/theme, build a simple palette around it (their color as the accent/primary, plus one light and one dark neutral); if they have no preference, use the defaults below. Then drop your content into this frame, write the script ONCE, and generate the file — **do not compare further options or re-deliberate:**

- **Layout:** `LAYOUT_16x9` (10" × 5.625").
- **Palette:** navy `1E2761` (dark backgrounds), off-white `F5F7FB` (content backgrounds), teal `00A896` (accent), slate `475569` (body text), white `FFFFFF`.
- **Fonts:** headers `Georgia`, body `Calibri`.
- **Structure:** dark title slide → light content slides → dark closing slide.
- **Frame:** 0.5" margins. Slide title at `x:0.5, y:0.4, w:9, h:0.8` (32–40pt). Content starts at `y:1.6`.
- **3-across cards:** `w:2.9, h:2.6, y:1.7`, `x: 0.5 / 3.55 / 6.6`. Big number ~40pt, label ~12pt.
- **Chart:** put one chart at `x:0.5, y:1.6, w:5.8, h:3.4` with a short insight/callout on the right.

### One rule for uncertainty

If you're unsure whether a pptxgenjs feature works, **do NOT explore multiple approaches in your reasoning.** Use the simplest thing that definitely works and move on (e.g. a text callout can convey emphasis instead of fancy chart styling). Pick the first reasonable option; never weigh option A vs B vs C in your head.

---

## Design (keep it simple, decide once)

Make design choices ONCE and briefly, then build in one pass — don't re-pick palettes or redesign mid-build. Guidelines, not a checklist:

- One dominant color (60–70%), 1–2 supporting tones, one accent. Dark title/closing slides, light content slides.
- Every slide needs a visual element (chart, icon, shape, image) — avoid plain title+bullets. Vary layouts (two-column, stat callouts, comparison, grid).
- Left-align body text, center only titles. Title 36–44pt bold; body 14–16pt; ≥0.5" margins; strong contrast (no light-on-light / dark-on-dark).
- Fonts: characterful header + clean body — e.g. Georgia/Calibri, Cambria/Calibri, or Arial Black/Arial.
- NEVER put accent lines under titles (a tell-tale AI look) — use whitespace/background color instead.

**Palettes** (pick one, or build around the user's requested color):

| Theme | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| Midnight Executive (navy) | `1E2761` | `CADCFC` | `FFFFFF` |
| Warm Terracotta | `B85042` | `E7E8D1` | `A7BEAE` |
| Teal Trust | `028090` | `00A896` | `02C39A` |
| Charcoal Minimal | `36454F` | `F2F2F2` | `212121` |

---

## QA (do one bounded pass — do NOT loop)

> **This sandbox cannot render slides to images** (no `soffice`/LibreOffice). Do not attempt image-based visual QA, spawn subagents, or retry rendering. Run the checks below **once**, fix obvious issues, then deliver. Never block delivery on a render that isn't possible here.

1. **Content check** — extract text and confirm nothing is missing/misspelled/out of order:
   ```bash
   python3 -m markitdown output.pptx
   ```
   For templates, also check leftover placeholders: `python3 -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum"`.
2. **Geometry check (from code, not images)** — confirm elements stay within 0.5" margins and don't overlap, title/body size contrast holds, and colors have adequate contrast.
3. **Deliver** the `.pptx`. If the user needs a visual/image proof, say image rendering isn't supported in this environment rather than attempting it.
