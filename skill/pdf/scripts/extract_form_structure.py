"""
Extract form structure from a non-fillable PDF.

This script analyzes the PDF to find:
- Text labels with their exact coordinates
- Horizontal lines (row boundaries)
- Checkboxes (small rectangles)

Output: A JSON file with the form structure that can be used to generate
accurate field coordinates for filling.

Usage: python extract_form_structure.py <input.pdf> <output.json>
"""

import json
import sys

# Reimplemented on the baked pdfminer.six (pdfplumber is not installed in the
# sandbox). Coordinates are reported in pdfplumber's convention: origin at the
# TOP of the page (`top`/`bottom` = distance from the top edge), so the
# downstream FORMS.md coordinate math is unchanged.
from pdfminer.high_level import extract_pages
from pdfminer.layout import LAParams, LTChar, LTAnno, LTTextLine, LTLine, LTRect, LTContainer


def _iter(obj):
    """Recursively yield every layout object on a page."""
    yield obj
    if isinstance(obj, LTContainer):
        for child in obj:
            yield from _iter(child)


def _words_from_line(line, page_height):
    """Group characters in a text line into words with bounding boxes.

    Splits on whitespace/LTAnno boundaries (and a small x-gap fallback), then
    converts pdfminer's bottom-origin y (y0/y1) to pdfplumber's top-origin
    top/bottom.
    """
    words = []
    cur = None

    def flush():
        nonlocal cur
        if cur is not None:
            words.append(cur)
            cur = None

    for obj in line:
        if isinstance(obj, LTChar) and not obj.get_text().isspace():
            if cur is None:
                cur = {"text": obj.get_text(), "x0": obj.x0, "x1": obj.x1,
                       "y0": obj.y0, "y1": obj.y1}
            elif obj.x0 - cur["x1"] > 2.0:  # unmarked gap => new word
                flush()
                cur = {"text": obj.get_text(), "x0": obj.x0, "x1": obj.x1,
                       "y0": obj.y0, "y1": obj.y1}
            else:
                cur["text"] += obj.get_text()
                cur["x1"] = obj.x1
                cur["y0"] = min(cur["y0"], obj.y0)
                cur["y1"] = max(cur["y1"], obj.y1)
        else:  # space char, LTAnno, or non-char => word boundary
            flush()
    flush()

    return [{
        "text": w["text"],
        "x0": round(float(w["x0"]), 1),
        "top": round(float(page_height - w["y1"]), 1),
        "x1": round(float(w["x1"]), 1),
        "bottom": round(float(page_height - w["y0"]), 1),
    } for w in words]


def extract_form_structure(pdf_path):
    structure = {
        "pages": [],
        "labels": [],
        "lines": [],
        "checkboxes": [],
        "row_boundaries": []
    }

    for page_num, page_layout in enumerate(extract_pages(pdf_path, laparams=LAParams()), 1):
        page_width = float(page_layout.width)
        page_height = float(page_layout.height)
        structure["pages"].append({
            "page_number": page_num,
            "width": page_width,
            "height": page_height
        })

        for obj in _iter(page_layout):
            if isinstance(obj, LTTextLine):
                for word in _words_from_line(obj, page_height):
                    word["page"] = page_num
                    structure["labels"].append(word)
            elif isinstance(obj, LTLine):
                # Horizontal rule: near-flat and spanning >50% of page width.
                if abs(obj.y1 - obj.y0) < 2 and abs(obj.x1 - obj.x0) > page_width * 0.5:
                    structure["lines"].append({
                        "page": page_num,
                        "y": round(float(page_height - obj.y1), 1),
                        "x0": round(float(obj.x0), 1),
                        "x1": round(float(obj.x1), 1)
                    })
            elif isinstance(obj, LTRect):
                width = float(obj.x1 - obj.x0)
                height = float(obj.y1 - obj.y0)
                if 5 <= width <= 15 and 5 <= height <= 15 and abs(width - height) < 2:
                    top = round(float(page_height - obj.y1), 1)
                    bottom = round(float(page_height - obj.y0), 1)
                    structure["checkboxes"].append({
                        "page": page_num,
                        "x0": round(float(obj.x0), 1),
                        "top": top,
                        "x1": round(float(obj.x1), 1),
                        "bottom": bottom,
                        "center_x": round((float(obj.x0) + float(obj.x1)) / 2, 1),
                        "center_y": round((top + bottom) / 2, 1)
                    })

    lines_by_page = {}
    for line in structure["lines"]:
        page = line["page"]
        if page not in lines_by_page:
            lines_by_page[page] = []
        lines_by_page[page].append(line["y"])

    for page, y_coords in lines_by_page.items():
        y_coords = sorted(set(y_coords))
        for i in range(len(y_coords) - 1):
            structure["row_boundaries"].append({
                "page": page,
                "row_top": y_coords[i],
                "row_bottom": y_coords[i + 1],
                "row_height": round(y_coords[i + 1] - y_coords[i], 1)
            })

    return structure


def main():
    if len(sys.argv) != 3:
        print("Usage: extract_form_structure.py <input.pdf> <output.json>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2]

    print(f"Extracting structure from {pdf_path}...")
    structure = extract_form_structure(pdf_path)

    with open(output_path, "w") as f:
        json.dump(structure, f, indent=2)

    print(f"Found:")
    print(f"  - {len(structure['pages'])} pages")
    print(f"  - {len(structure['labels'])} text labels")
    print(f"  - {len(structure['lines'])} horizontal lines")
    print(f"  - {len(structure['checkboxes'])} checkboxes")
    print(f"  - {len(structure['row_boundaries'])} row boundaries")
    print(f"Saved to {output_path}")


if __name__ == "__main__":
    main()
