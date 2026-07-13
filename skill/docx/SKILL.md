---
name: docx
description: "Use when the user wants to write, edit, review, or redline a Word document — draft or update a .docx, track changes, or add comments."
---

# DOCX creation, editing, and analysis

*Operation manual for an agent that creates, edits, and analyzes Word documents.*

## Overview

A .docx file is a ZIP archive containing XML files.

## Environment

The execution sandbox runs **Python 3.14** offline with these libraries preinstalled (among others):

- **python-docx**, **docx2python**, **docxtpl**, **mammoth** -- Word document read/create/edit
- **markitdown** -- extract text/markdown from documents
- **pandas**, **openpyxl** -- tabular data
- **Pillow** -- image I/O

No network access. No `pip install` at runtime. Use the libraries above; if your usual choice isn't listed, pick an installed alternative rather than installing.

**Always invoke `python3` (not `python`)** — only `python3` is on PATH in this sandbox; `python` returns `command not found`.

## File Upload Validation

If the file is visible in chat context, use it directly. Only invoke the code interpreter when it is strictly required to perform the user's request. If the code interpreter is required and the file isn't in the sandbox, reply with EXACTLY this message and stop:

> **I can see your file, but the code interpreter can't access it.** Please re-upload it using the **"Upload for Code Interpreter"** option so the Agent can treat it correctly.

## Quick Reference

| Task | Approach |
|------|----------|
| Read/analyze content | `python3 -m markitdown` for general reading, `--dump-text` for engine-visible text, or unpack for raw XML |
| Create new document | Use `python-docx` - see Creating New Documents below |
| Edit existing document | Unpack → edit XML → repack - see Editing Existing Documents below |
| Compare two documents | `redline.py` — generates a redline with tracked changes - see Comparing Documents below |

### Reading Content

```bash
# Quick text/markdown extraction
python3 -m markitdown document.docx

# Engine-visible plain text via dump
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ --dump-text
```

### Accepting Tracked Changes

```bash
python3 /mnt/data/docx/scripts/accept_changes.py input.docx output.docx
```

### Comparing Documents (Redline)

Generate a redline showing tracked changes between two DOCX files:

```bash
python3 /mnt/data/docx/scripts/redline.py original.docx modified.docx -o redline.docx
```

The output is a copy of the original with `<w:del>`/`<w:ins>` tracked changes showing every difference. Open it in Word to see the redline view.

Options:
- `--author "Name"` — author name for tracked changes (default: `AI-Agent`)

How it works:
- Aligns paragraphs between the two documents
- For similar paragraphs (≥30% match): character-level diff with fine-grained tracked changes preserving formatting
- For very different paragraphs (<30% match): marks the old as deleted and inserts the new
- Handles paragraph additions and deletions with proper OOXML paragraph-break markup

---

## Creating New Documents

Generate .docx files with Python using `python-docx`. The `docx` package is preinstalled.

### Setup
```python
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

doc = Document()
doc.save("output.docx")
```

### Validation
After creating the file, validate it:
```bash
python3 /mnt/data/docx/scripts/office/validate.py doc.docx
```

### Page Size

```python
from docx.shared import Inches
from docx.oxml.ns import qn

# US Letter (default is A4)
section = doc.sections[0]
section.page_width  = int(8.5 * 914400)   # 8.5 inches in EMU
section.page_height = int(11  * 914400)   # 11 inches in EMU
section.left_margin = section.right_margin = section.top_margin = section.bottom_margin = Inches(1)
```

### Headings and Paragraphs

```python
doc.add_heading("Document Title", level=0)   # Title style
doc.add_heading("Section 1",      level=1)   # Heading 1
doc.add_heading("Subsection 1.1", level=2)   # Heading 2

para = doc.add_paragraph()
run = para.add_run("Bold text ")
run.bold = True
run.font.size = Pt(11)
run2 = para.add_run("and normal text.")
```

### Lists (NEVER use unicode bullets)

```python
# ❌ WRONG - never manually insert bullet characters
para = doc.add_paragraph("• Item")  # BAD

# ✅ CORRECT - use built-in list styles
doc.add_paragraph("First item",  style="List Bullet")
doc.add_paragraph("Second item", style="List Bullet")

doc.add_paragraph("Step one", style="List Number")
doc.add_paragraph("Step two", style="List Number")
```

### Tables

```python
from docx.shared import Pt, RGBColor

table = doc.add_table(rows=1, cols=3)
table.style = "Table Grid"

# Header row
hdr = table.rows[0].cells
hdr[0].text = "Name"
hdr[1].text = "Value"
hdr[2].text = "Notes"
for cell in hdr:
    for para in cell.paragraphs:
        for run in para.runs:
            run.bold = True

# Data rows
for name, value, note in data:
    row = table.add_row().cells
    row[0].text = name
    row[1].text = value
    row[2].text = note
```

### Images

```python
from docx.shared import Inches

doc.add_picture("chart.png", width=Inches(6))
```

### Footnotes

python-docx does not natively support footnotes. Use direct XML manipulation:

```python
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# Add footnote reference in paragraph
run = para.add_run()
footnote_ref = OxmlElement("w:footnoteReference")
footnote_ref.set(qn("w:id"), "1")
run._r.append(footnote_ref)
```

### Page Breaks

```python
doc.add_page_break()

# Or inside a paragraph
from docx.oxml import OxmlElement
para = doc.add_paragraph()
run = para.add_run()
run._r.append(OxmlElement("w:br"))
```

### Headers/Footers

```python
from docx.shared import Pt

section = doc.sections[0]

# Header
header = section.header
header_para = header.paragraphs[0]
header_para.text = "Header text"

# Footer with page number
footer = section.footer
footer_para = footer.paragraphs[0]
footer_para.text = "Page "
run = footer_para.add_run()
fldChar = OxmlElement("w:fldChar")
fldChar.set(qn("w:fldCharType"), "begin")
run._r.append(fldChar)
instrText = OxmlElement("w:instrText")
instrText.text = "PAGE"
run._r.append(instrText)
fldChar2 = OxmlElement("w:fldChar")
fldChar2.set(qn("w:fldCharType"), "end")
run._r.append(fldChar2)
```

### Critical Rules for python-docx

- **Never use `\n`** — use separate `add_paragraph()` calls
- **Never use unicode bullets** — use `"List Bullet"` and `"List Number"` styles
- **Use `Pt()` for font sizes** — `run.font.size = Pt(11)`
- **Use `Inches()` or `Cm()` for dimensions** — never raw numbers
- **Set page size in EMU** — 1 inch = 914400 EMU

---

## Editing Existing Documents

> **CRITICAL: Each code execution runs in an isolated sandbox. `/tmp/` and all other state is erased between executions. All 3 steps below MUST happen in a single code execution — they cannot be split across separate executions.**

Use `/tmp/` for the temporary directory structure. Only the final `.docx` output needs to be saved to the working directory (`./`).

### Example: Complete Edit Workflow

```bash
# Step 1: Unpack to /tmp
python3 /mnt/data/docx/scripts/office/unpack.py ./input.docx /tmp/unpacked/

# Step 2: Edit XML
# For tracked changes (find/replace with redlines) — multiple pairs in one call:
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ \
  "[PLACEHOLDER_1]" "value 1" \
  "[PLACEHOLDER_2]" "value 2" \
  "old text" "new text"
# For plain text replacement (no tracked changes):
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ \
  "old text" "new text" --plain

# Step 3: Pack back to working directory
python3 /mnt/data/docx/scripts/office/pack.py /tmp/unpacked/ ./output.docx --original ./input.docx
```

### Step 1: Unpack

```bash
python3 /mnt/data/docx/scripts/office/unpack.py document.docx /tmp/unpacked/
```
Extracts XML, pretty-prints, merges adjacent runs, and converts smart quotes to XML entities (`&#x201C;` etc.) so they survive editing. Use `--merge-runs false` to skip run merging.

### Step 2: Edit XML

Edit files in `/tmp/unpacked/word/` within the same script. See XML Reference below for patterns.

**Use "AI-Agent" as the author** for tracked changes and comments, unless the user explicitly requests use of a different name.

**Tracked changes (find/replace with redlines):** Use `tracked_replace.py` to replace text with proper `<w:del>`/`<w:ins>` markup. It handles cross-run matching (text split across multiple `<w:r>` elements with different formatting), XML parsing, and formatting preservation automatically. Use `\n` in search strings to match across paragraph boundaries. Pass multiple old/new pairs in one call (single parse/write cycle):
```bash
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ \
  "[EFFECTIVE_DATE]" "January 15, 2025" \
  "[PARTY_A_NAME]" "Acme Corp" \
  "[JURISDICTION]" "Delaware" \
  "old text" "new text"

# Single replacement still works:
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ "typo" "correction"

# --first replaces only the first occurrence of each pair (pairs processed in order):
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ \
  "[ENTITY_TYPE]" "corporation" \
  "[ENTITY_TYPE]" "limited liability company" \
  --first
```
Replaces all occurrences of each pair by default. Use `--first` to replace only the first occurrence of each pair — useful for assigning different values to repeated placeholders (pairs are processed in order against the same DOM). Skips text inside existing tracked changes. Preserves run formatting (`<w:rPr>`).

**Plain text replacement (no tracked changes):** Use `--plain` for the same cross-run matching without `<w:del>`/`<w:ins>` markup:
```bash
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ \
  "old text" "new text" --plain

# Or batch from JSON:
python3 /mnt/data/docx/scripts/tracked_replace.py /tmp/unpacked/ --json replacements.json --plain
```

**Search string guidance:** The engine normalizes whitespace automatically (strips and collapses spaces). Key rules:
- **No list prefixes**: bullets/dashes/numbers from `<w:numPr>` are NOT text — never include them.
- **Multi-paragraph**: use `\n` between content lines. The engine skips empty paragraphs automatically.
- **Verify first**: run `tracked_replace.py /tmp/unpacked/ --dump-text` and build search strings from that output.
- See `agent-tracked-changes.md` for full details.

**CRITICAL: Use smart quotes for new content.** When adding text with apostrophes or quotes, use XML entities to produce smart quotes:
```xml
<!-- Use these entities for professional typography -->
<w:t>Here&#x2019;s a quote: &#x201C;Hello&#x201D;</w:t>
```
| Entity | Character |
|--------|-----------|
| `&#x2018;` | ‘ (left single) |
| `&#x2019;` | ’ (right single / apostrophe) |
| `&#x201C;` | “ (left double) |
| `&#x201D;` | ” (right double) |

**Adding comments:** Use `comment.py` to handle boilerplate across multiple XML files (text must be pre-escaped XML):
```bash
python3 /mnt/data/docx/scripts/comment.py /tmp/unpacked/ 0 "Comment text with &amp; and &#x2019;"
python3 /mnt/data/docx/scripts/comment.py /tmp/unpacked/ 1 "Reply text" --parent 0  # reply to comment 0
python3 /mnt/data/docx/scripts/comment.py /tmp/unpacked/ 0 "Text" --author "Custom Author"  # custom author name
```
Then edit `/tmp/unpacked/word/document.xml` to add comment markers (see Comments in XML Reference).

### Step 3: Pack

```bash
python3 /mnt/data/docx/scripts/office/pack.py /tmp/unpacked/ ./output.docx --original ./input.docx
```
Validates with auto-repair, condenses XML, and creates DOCX. Use `--validate false` to skip.

**Auto-repair will fix:**
- `durableId` >= 0x7FFFFFFF (regenerates valid ID)
- Missing `xml:space="preserve"` on `<w:t>` with whitespace

**Auto-repair won't fix:**
- Malformed XML, invalid element nesting, missing relationships, schema violations

### Common Pitfalls

- **Replace entire `<w:r>` elements**: When adding tracked changes, replace the whole `<w:r>...</w:r>` block with `<w:del>...<w:ins>...` as siblings. Don't inject tracked change tags inside a run.
- **Preserve `<w:rPr>` formatting**: Copy the original run's `<w:rPr>` block into your tracked change runs to maintain bold, font size, etc.
- **Use `<w:delText>` inside `<w:del>`, never `<w:t>`**: Deleted content must use `<w:delText>`. Using `<w:t>` inside `<w:del>` causes validation failure.
- **Multiple placeholders in one `<w:t>`**: When a single text node contains multiple placeholders (e.g., `[A] and [B]`), split the `<w:r>` into separate runs for each placeholder and the text between them. Do NOT apply regex replacements sequentially on raw XML — later replacements can corrupt earlier tracked change markup.

---

## XML Reference

### Schema Compliance

- **Element order in `<w:pPr>`**: `<w:pStyle>`, `<w:numPr>`, `<w:spacing>`, `<w:ind>`, `<w:jc>`, `<w:rPr>` last
- **Whitespace**: Add `xml:space="preserve"` to `<w:t>` with leading/trailing spaces
- **RSIDs**: Must be 8-digit hex (e.g., `00AB1234`)

### Tracked Changes

**Insertion:**
```xml
<w:ins w:id="1" w:author="AI-Agent" w:date="2025-01-01T00:00:00Z">
  <w:r><w:t>inserted text</w:t></w:r>
</w:ins>
```

**Deletion:**
```xml
<w:del w:id="2" w:author="AI-Agent" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
```

**Inside `<w:del>`**: Use `<w:delText>` instead of `<w:t>`, and `<w:delInstrText>` instead of `<w:instrText>`.

**Minimal edits** - only mark what changes:
```xml
<!-- Change "30 days" to "60 days" -->
<w:r><w:t>The term is </w:t></w:r>
<w:del w:id="1" w:author="AI-Agent" w:date="...">
  <w:r><w:delText>30</w:delText></w:r>
</w:del>
<w:ins w:id="2" w:author="AI-Agent" w:date="...">
  <w:r><w:t>60</w:t></w:r>
</w:ins>
<w:r><w:t> days.</w:t></w:r>
```

**Deleting entire paragraphs/list items** - when removing ALL content from a paragraph, also mark the paragraph mark as deleted so it merges with the next paragraph. Add `<w:del/>` inside `<w:pPr><w:rPr>`:
```xml
<w:p>
  <w:pPr>
    <w:numPr>...</w:numPr>  <!-- list numbering if present -->
    <w:rPr>
      <w:del w:id="1" w:author="AI-Agent" w:date="2025-01-01T00:00:00Z"/>
    </w:rPr>
  </w:pPr>
  <w:del w:id="2" w:author="AI-Agent" w:date="2025-01-01T00:00:00Z">
    <w:r><w:delText>Entire paragraph content being deleted...</w:delText></w:r>
  </w:del>
</w:p>
```
Without the `<w:del/>` in `<w:pPr><w:rPr>`, accepting changes leaves an empty paragraph/list item.

**Rejecting another author's insertion** - nest deletion inside their insertion:
```xml
<w:ins w:author="Jane" w:id="5">
  <w:del w:author="AI-Agent" w:id="10">
    <w:r><w:delText>their inserted text</w:delText></w:r>
  </w:del>
</w:ins>
```

**Restoring another author's deletion** - add insertion after (don't modify their deletion):
```xml
<w:del w:author="Jane" w:id="5">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
<w:ins w:author="AI-Agent" w:id="10">
  <w:r><w:t>deleted text</w:t></w:r>
</w:ins>
```

### Comments

After running `comment.py` (see Step 2), add markers to document.xml. For replies, use `--parent` flag and nest markers inside the parent's.

**CRITICAL: `<w:commentRangeStart>` and `<w:commentRangeEnd>` are siblings of `<w:r>`, never inside `<w:r>`.**

```xml
<!-- Comment markers are direct children of w:p, never inside w:r -->
<w:commentRangeStart w:id="0"/>
<w:del w:id="1" w:author="AI-Agent" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted</w:delText></w:r>
</w:del>
<w:r><w:t> more text</w:t></w:r>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>

<!-- Comment 0 with reply 1 nested inside -->
<w:commentRangeStart w:id="0"/>
  <w:commentRangeStart w:id="1"/>
  <w:r><w:t>text</w:t></w:r>
  <w:commentRangeEnd w:id="1"/>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="1"/></w:r>
```

### Images

1. Add image file to `word/media/`
2. Add relationship to `word/_rels/document.xml.rels`:
```xml
<Relationship Id="rId5" Type=".../image" Target="media/image1.png"/>
```
3. Add content type to `[Content_Types].xml`:
```xml
<Default Extension="png" ContentType="image/png"/>
```
4. Reference in document.xml:
```xml
<w:drawing>
  <wp:inline>
    <wp:extent cx="914400" cy="914400"/>  <!-- EMUs: 914400 = 1 inch -->
    <a:graphic>
      <a:graphicData uri=".../picture">
        <pic:pic>
          <pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing>
```

---

## Dependencies

- **python-docx**: preinstalled (new documents and editing)
- **markitdown**: text/markdown extraction from .docx
- **docxtpl**: template-based generation (Jinja2)
- **Poppler**: `pdftoppm` for images
