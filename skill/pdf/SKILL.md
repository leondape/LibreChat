---
name: pdf
description: "Use when the user wants to read, extract from, split, or fill in a PDF document or PDF form."
---

# PDF Processing Guide

*Operation manual for an agent that handles PDFs (read, merge, split, extract, create, forms, etc.).*

## Overview

When handling PDFs, use this guide and the referenced scripts/libraries. For advanced features, JavaScript libraries, and detailed examples, see REFERENCE.md.

**Filling out a PDF form (fillable or not): you MUST read FORMS.md and follow its workflow.** This is mandatory whenever the user asks to fill, complete, or enter values into a form. Do not stamp text with your own overlay / reportlab / hand-written content stream — use the FORMS.md scripts, which handle field detection, coordinate accuracy, checkbox states, and validation.

**User-facing responses:** keep them short and about the result, not the machinery. Deliver the output file and a brief confirmation (e.g. which fields/values were filled). Do NOT expose internal steps, script names, library names, coordinate/validation stages, or step-by-step workflow tables — those are implementation details the user does not need.

## Environment

The execution sandbox runs **Python 3.14** offline with these libraries preinstalled (among others):

- **PyPDF2**, **pdfminer.six** -- read/merge/split/extract text
- **pdf2image** -- render pages to images (Poppler-backed)
- **reportlab** -- create PDFs
- **markitdown** -- document-to-markdown extraction
- **Pillow** -- image I/O
- Poppler CLI: **pdftotext**, **pdftoppm**, **pdfimages**, **pdfinfo**

No network access. No `pip install` at runtime. Use the libraries above; if your usual choice isn't listed, pick an installed alternative rather than installing.

**OCR is not available:** the `tesseract` binary / `pytesseract` is not installed, so scanned-PDF text recognition will fail. Render pages with `pdf2image` for visual analysis, but if true OCR is required, tell the user it isn't supported here rather than attempting it.

## File Upload Validation

If the file is visible in chat context, use it directly. Only invoke the code interpreter when it is strictly required to perform the user's request. If the code interpreter is required and the file isn't in the sandbox, reply with EXACTLY this message and stop:

> **I can see your file, but the code interpreter can't access it.** Please re-upload it using the **"Upload for Code Interpreter"** option so the Agent can treat it correctly.

## Quick Start

```python
import PyPDF2

# Read a PDF
reader = PyPDF2.PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Python Libraries

### PyPDF2 - Basic Operations

#### Merge PDFs
```python
import PyPDF2

writer = PyPDF2.PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PyPDF2.PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

#### Split PDF
```python
reader = PyPDF2.PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PyPDF2.PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

#### Extract Metadata
```python
reader = PyPDF2.PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}")
print(f"Author: {meta.author}")
print(f"Subject: {meta.subject}")
print(f"Creator: {meta.creator}")
```

#### Rotate Pages
```python
reader = PyPDF2.PdfReader("input.pdf")
writer = PyPDF2.PdfWriter()

page = reader.pages[0]
page.rotate(90)  # Rotate 90 degrees clockwise
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
```

### pdfminer.six - Text and Table Extraction

#### Extract Text with Layout
```python
from pdfminer.high_level import extract_text

text = extract_text("document.pdf")
print(text)
```

#### Page-by-page with Layout Elements
```python
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextBox, LTFigure

for i, page_layout in enumerate(extract_pages("document.pdf")):
    print(f"--- Page {i+1} ---")
    for element in page_layout:
        if isinstance(element, LTTextBox):
            print(element.get_text())
```

#### Extract Tables (via pandas + text parsing)
```python
import pandas as pd
from pdfminer.high_level import extract_text

# For tabular PDFs, extract text then parse with pandas
text = extract_text("document.pdf")
# Use pd.read_csv with StringIO if data is delimited
from io import StringIO
# df = pd.read_csv(StringIO(text), sep="\s+", engine="python")
```

### reportlab - Create PDFs

#### Basic PDF Creation
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter

# Add text
c.drawString(100, height - 100, "Hello World!")
c.drawString(100, height - 120, "This is a PDF created with reportlab")

# Add a line
c.line(100, height - 140, 400, height - 140)

# Save
c.save()
```

#### Create PDF with Multiple Pages
```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# Add content
title = Paragraph("Report Title", styles['Title'])
story.append(title)
story.append(Spacer(1, 12))

body = Paragraph("This is the body of the report. " * 20, styles['Normal'])
story.append(body)
story.append(PageBreak())

# Page 2
story.append(Paragraph("Page 2", styles['Heading1']))
story.append(Paragraph("Content for page 2", styles['Normal']))

# Build PDF
doc.build(story)
```

#### Subscripts and Superscripts

**IMPORTANT**: Never use Unicode subscript/superscript characters (₀₁₂₃₄₅₆₇₈₉, ⁰¹²³⁴⁵⁶⁷⁸⁹) in ReportLab PDFs. The built-in fonts do not include these glyphs, causing them to render as solid black boxes.

Instead, use ReportLab's XML markup tags in Paragraph objects:
```python
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet

styles = getSampleStyleSheet()

# Subscripts: use <sub> tag
chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])

# Superscripts: use <super> tag
squared = Paragraph("x<super>2</super> + y<super>2</super>", styles['Normal'])
```

For canvas-drawn text (not Paragraph objects), manually adjust font the size and position rather than using Unicode subscripts/superscripts.

## Command-Line Tools

### pdftotext (poppler-utils)
```bash
# Extract text
pdftotext input.pdf output.txt

# Extract text preserving layout
pdftotext -layout input.pdf output.txt

# Extract specific pages
pdftotext -f 1 -l 5 input.pdf output.txt  # Pages 1-5
```


## Common Tasks

### Scanned PDFs (OCR not available)
OCR requires the `tesseract` binary (`pytesseract`), which is **not installed** in this sandbox. You can still render pages to images for visual inspection, but text recognition will fail:
```python
from pdf2image import convert_from_path
images = convert_from_path('scanned.pdf', dpi=200)  # render only; no OCR
images[0].save('page_1.png')
```
If the task needs the text content of a scanned/image-only PDF, tell the user OCR isn't supported in this environment instead of attempting it.

### Add Watermark
```python
import PyPDF2

# Create watermark (or load existing)
watermark = PyPDF2.PdfReader("watermark.pdf").pages[0]

# Apply to all pages
reader = PyPDF2.PdfReader("document.pdf")
writer = PyPDF2.PdfWriter()

for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
```

### Extract Images
```bash
# Using pdfimages (poppler-utils)
pdfimages -j input.pdf output_prefix

# This extracts all images as output_prefix-000.jpg, output_prefix-001.jpg, etc.
```

### Password Protection
```python
import PyPDF2

reader = PyPDF2.PdfReader("input.pdf")
writer = PyPDF2.PdfWriter()

for page in reader.pages:
    writer.add_page(page)

# Add password
writer.encrypt("userpassword", "ownerpassword")

with open("encrypted.pdf", "wb") as output:
    writer.write(output)
```

## Quick Reference

| Task | Best Tool | Command/Code |
|------|-----------|--------------|
| Merge PDFs | PyPDF2 | `writer.add_page(page)` |
| Split PDFs | PyPDF2 | One page per file |
| Extract text | pdfminer.six | `extract_text("doc.pdf")` |
| Extract text (CLI) | pdftotext | `pdftotext input.pdf output.txt` |
| Create PDFs | reportlab | Canvas or Platypus |
| OCR scanned PDFs | NOT available | `tesseract` not installed — render with pdf2image only |
| Fill PDF forms | pdf-lib or PyPDF2 (see FORMS.md) | See FORMS.md |

## Next Steps

- For JavaScript libraries (pdf-lib), see REFERENCE.md
- If you need to fill out a PDF form, you MUST follow the FORMS.md workflow/scripts (never a custom text overlay)
- For troubleshooting guides, see REFERENCE.md
