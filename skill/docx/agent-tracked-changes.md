# DOCX Find & Replace

All steps must happen in a **single code execution**. Use `/tmp/` for intermediate files; only the final `.docx` goes to `./`.

## File Upload Validation

If the file is visible in chat context, use it directly. Only invoke the code interpreter when it is strictly required to perform the user's request. If the code interpreter is required and the file isn't in the sandbox, reply with EXACTLY this message and stop:

> **I can see your file, but the code interpreter can't access it.** Please re-upload it using the **"Upload for Code Interpreter"** option so the Agent can treat it correctly.

## With Tracked Changes (redlines)

```bash
python3 /mnt/data/docx/scripts/office/unpack.py ./input.docx /tmp/unpacked/

# Inline pairs:
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ \
  "old text" "new text" \
  "[PLACEHOLDER]" "real value"

# Or from a JSON file:
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ --json ./replacements.json

python3 /mnt/data/docx/scripts/office/pack.py /tmp/unpacked/ ./output.docx --original ./input.docx
```

Options: `--first` (first occurrence of each pair only), `--author "Name"`.

JSON format — either works:
```json
[["old1", "new1"], ["old2", "new2"]]
```
```json
{"replacements": [{"search": "old", "replace": "new"}]}
```

## Without Tracked Changes (plain replace)

Same engine but modifies text in-place (no `<w:del>`/`<w:ins>` markup). Add `--plain`:

```bash
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ \
  "old text" "new text" --plain
```

---

## Search string rules

The engine **automatically normalizes whitespace** — it strips leading/trailing spaces and collapses internal runs of spaces to a single space before matching. Minor spacing differences between your search string and the document are handled for you.

### 1 — No list bullet / dash prefixes

Bullets (`•`, `-`) and auto-numbers rendered by `<w:numPr>` numbering styles are **not** stored in the text. Never include them in search strings.

### 2 — Multi-paragraph: use `\n` between content lines

When a replacement spans multiple paragraphs, join content lines with `\n`. The engine **automatically skips empty paragraphs** between content, so use `\n` only between non-empty lines (not `\n\n`).

```json
{
  "search": "1. Cinematic Rights:\n__ % of Gross Receipts first to Licensee\n__ % of Gross Receipts to Licensor",
  "replace": "1. Cinematic Rights:\n65 % of Gross Receipts to Licensee\n35 % of Gross Receipts to Licensor"
}
```

### 3 — Always verify against actual text

Before finalising the JSON, extract the document's text **exactly as the engine sees it**:

```bash
python3 /mnt/data/docx/scripts/office/unpack.py ./input.docx /tmp/unpacked/
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ --dump-text > /tmp/engine_text.txt
```

Build every search string from **this output**, not from a PDF render, email, or `pandoc`. Pay attention to smart quotes (`\u201C` `\u201D` `\u2019`), `€`, `—`, and `\xa0` (non-breaking space).

### 4 — Accented / non-ASCII text: pass REAL UTF-8, never escape sequences

Write accented and non-ASCII characters (`ï`, `é`, `ç`, `€`, `—`, smart quotes, etc.) as their **actual characters**. **Never** emit Python/JSON byte- or unicode-escapes like `\xef`, `\u00ef`, or `\N{...}` in the search/replace text — they are inserted **literally**, so `Wangaï` becomes the corrupted string `Wanga\xef`.

- **Prefer the JSON input** for anything with non-ASCII, and write it as UTF-8 with escapes disabled so real characters land in the file:

```python
import json
pairs = [["[COMPANY NAME]", "Wangaï Media SAS"]]
with open("replacements.json", "w", encoding="utf-8") as f:
    json.dump(pairs, f, ensure_ascii=False)   # ensure_ascii=False is REQUIRED
```

- If you pass pairs inline on the command line, type the literal characters (`"Wangaï Media SAS"`), not `\x`/`\u` escapes.
- **Post-check:** after packing, confirm the output text has no stray `\x` / `\u` artifacts, e.g. `tracked_replace.py /tmp/unpacked/ --dump-text | grep -nE '\\x|\\u'` should return nothing.
