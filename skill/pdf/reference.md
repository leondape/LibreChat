# PDF Processing Advanced Reference

Advanced PDF features and examples. **Only the libraries/tools below are installed in this sandbox** — do not import or install anything else (offline, no `pip install` / `npm install`).

Installed: **PyPDF2**, **pdfminer.six**, **reportlab**, **pdf2image** (Python); **poppler-utils** `pdftotext`/`pdftoppm`/`pdfimages`/`pdfinfo`/`pdftocairo` (CLI); **pdf-lib** (Node/Bun).
NOT installed (do not use): `pypdf` (use `PyPDF2`), `pdfplumber`, `pypdfium2`/`PyMuPDF`/`fitz`, `pdfjs-dist`, `qpdf`, `tesseract`/`pytesseract` OCR, ImageMagick, LibreOffice.

## Render PDF pages to images (pdf2image + Poppler)

```python
from pdf2image import convert_from_path

# Render every page to PIL images (Poppler-backed)
images = convert_from_path("document.pdf", dpi=200)
for i, img in enumerate(images):
    img.save(f"page_{i+1}.png", "PNG")

# Single page at higher resolution
first = convert_from_path("document.pdf", dpi=300, first_page=1, last_page=1)[0]
first.save("page_1.jpg", "JPEG", quality=90)
```

CLI equivalent (poppler):
```bash
pdftoppm -png -r 300 document.pdf output_prefix          # all pages -> output_prefix-1.png ...
pdftoppm -png -r 600 -f 1 -l 3 document.pdf high_res      # pages 1-3
pdftoppm -jpeg -jpegopt quality=85 -r 200 document.pdf jpg_out
```

## Extract text

```python
from pdfminer.high_level import extract_text
text = extract_text("document.pdf")
```

Page-by-page with layout elements:
```python
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextBox

for i, layout in enumerate(extract_pages("document.pdf")):
    print(f"--- Page {i+1} ---")
    for el in layout:
        if isinstance(el, LTTextBox):
            print(el.get_text())
```

CLI (fast, layout-aware):
```bash
pdftotext -layout document.pdf out.txt
pdftotext -bbox-layout document.pdf out.xml   # per-element bounding boxes
```

## PyPDF2 — merge / split / rotate / crop / encrypt / metadata

```python
import PyPDF2

# Merge
writer = PyPDF2.PdfWriter()
for f in ["doc1.pdf", "doc2.pdf"]:
    for page in PyPDF2.PdfReader(f).pages:
        writer.add_page(page)
with open("merged.pdf", "wb") as out:
    writer.write(out)

# Split (one page per file)
reader = PyPDF2.PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    w = PyPDF2.PdfWriter(); w.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as out:
        w.write(out)

# Rotate
page = reader.pages[0]; page.rotate(90)

# Crop (points; origin bottom-left)
page = reader.pages[0]
page.mediabox.left, page.mediabox.bottom = 50, 50
page.mediabox.right, page.mediabox.top = 550, 750

# Encrypt
w = PyPDF2.PdfWriter()
for page in reader.pages:
    w.add_page(page)
w.encrypt("userpassword", "ownerpassword")
with open("encrypted.pdf", "wb") as out:
    w.write(out)

# Decrypt
r = PyPDF2.PdfReader("encrypted.pdf")
if r.is_encrypted:
    r.decrypt("password")

# Metadata
meta = PyPDF2.PdfReader("document.pdf").metadata
print(meta.title, meta.author)
```

Watermark (overlay one page onto every page):
```python
import PyPDF2
wm = PyPDF2.PdfReader("watermark.pdf").pages[0]
reader = PyPDF2.PdfReader("document.pdf")
writer = PyPDF2.PdfWriter()
for page in reader.pages:
    page.merge_page(wm)
    writer.add_page(page)
with open("watermarked.pdf", "wb") as out:
    writer.write(out)
```

## Extract embedded images (poppler CLI)

```bash
pdfimages -all document.pdf images/img      # original formats
pdfimages -j -p document.pdf page_images     # JPEG with page numbers
pdfimages -list document.pdf                 # list without extracting
```

## reportlab — create PDFs (incl. tables)

```python
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

data = [["Product", "Q1", "Q2"], ["Widgets", "120", "135"], ["Gadgets", "85", "92"]]
doc = SimpleDocTemplate("report.pdf")
styles = getSampleStyleSheet()
table = Table(data)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("GRID", (0, 0), (-1, -1), 1, colors.black),
]))
doc.build([Paragraph("Quarterly Sales", styles["Title"]), table])
```

**Subscripts/superscripts:** never use Unicode sub/superscript characters (they render as black boxes in built-in fonts). Use ReportLab markup in `Paragraph`: `H<sub>2</sub>O`, `x<super>2</super>`.

## pdf-lib (Node/Bun) — create / modify / merge

```javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

// Modify existing
const pdfDoc = await PDFDocument.load(fs.readFileSync('input.pdf'));
const page = pdfDoc.addPage([600, 400]);
page.drawText('Added by pdf-lib', { x: 100, y: 300, size: 16 });
fs.writeFileSync('modified.pdf', await pdfDoc.save());

// Merge
const merged = await PDFDocument.create();
for (const f of ['doc1.pdf', 'doc2.pdf']) {
  const src = await PDFDocument.load(fs.readFileSync(f));
  const pages = await merged.copyPages(src, src.getPageIndices());
  pages.forEach(p => merged.addPage(p));
}
fs.writeFileSync('merged.pdf', await merged.save());
```

## Scanned PDFs (OCR) — NOT available in this sandbox

OCR requires the `tesseract` binary (via `pytesseract`), which is **not installed** here. `convert_from_path` will render scanned pages to images, but text recognition will fail. If OCR is required, report it to the user rather than attempting it. (To enable OCR in another environment, the sandbox image must include `tesseract-ocr`.)

## Performance tips

- Large PDFs: process pages in chunks with PyPDF2 (`add_page` per chunk) instead of loading everything.
- Text extraction: `pdftotext -bbox-layout` (CLI) is fastest; `pdfminer.six` for structured/layout text.
- Image extraction: `pdfimages` is much faster than rendering pages; use low DPI for previews, high DPI for final output.
- Form filling: prefer `pdf-lib` (preserves form structure) — see FORMS.md.

## License Information (installed tools)

- **PyPDF2**: BSD License
- **pdfminer.six**: MIT License
- **pdf2image**: MIT License
- **reportlab**: BSD License
- **poppler-utils**: GPL-2 License
- **pdf-lib**: MIT License
