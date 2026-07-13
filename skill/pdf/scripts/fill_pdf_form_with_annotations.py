import json
import sys

# Import PdfReader/PdfWriter from whichever package is available (the baked
# sandbox ships PyPDF2 3.0.x; newer environments ship pypdf).
try:
    from pypdf import PdfReader, PdfWriter
except ModuleNotFoundError:
    from PyPDF2 import PdfReader, PdfWriter

# Free-text annotations are created differently across versions:
#   - pypdf >= 3.15 exposes a FreeText annotation class (pypdf.annotations)
#   - PyPDF2 3.0.x / older pypdf expose generic.AnnotationBuilder.free_text()
# Resolve one callable, make_free_text(...), that works everywhere.
_FreeText = None
_AnnotationBuilder = None
for _mod in ("pypdf", "PyPDF2"):
    try:
        _annotations = __import__(f"{_mod}.annotations", fromlist=["FreeText"])
        _FreeText = getattr(_annotations, "FreeText", None)
    except (ModuleNotFoundError, ImportError):
        _FreeText = None
    if _FreeText is None:
        try:
            _generic = __import__(f"{_mod}.generic", fromlist=["AnnotationBuilder"])
            _AnnotationBuilder = getattr(_generic, "AnnotationBuilder", None)
        except (ModuleNotFoundError, ImportError):
            _AnnotationBuilder = None
    if _FreeText is not None or _AnnotationBuilder is not None:
        break

if _FreeText is None and _AnnotationBuilder is None:
    raise ImportError(
        "No free-text annotation API found. Install pypdf or PyPDF2 (>=3.0)."
    )


def make_free_text(text, rect, font, font_size, font_color):
    """Build a free-text annotation regardless of the installed PDF library."""
    if _FreeText is not None:
        # pypdf's FreeText class accepts None to mean "no border/background".
        return _FreeText(
            text=text,
            rect=rect,
            font=font,
            font_size=font_size,
            font_color=font_color,
            border_color=None,
            background_color=None,
        )
    # PyPDF2's AnnotationBuilder.free_text requires hex-string colors (it
    # calls hex_to_rgb() on them unconditionally, so None crashes it). Use
    # its own defaults: black border / white background, which are visually
    # unobtrusive on the typical white form background.
    return _AnnotationBuilder.free_text(
        text=text,
        rect=rect,
        font=font,
        font_size=font_size,
        font_color=font_color,
    )




def transform_from_image_coords(bbox, image_width, image_height, pdf_width, pdf_height):
    x_scale = pdf_width / image_width
    y_scale = pdf_height / image_height

    left = bbox[0] * x_scale
    right = bbox[2] * x_scale

    top = pdf_height - (bbox[1] * y_scale)
    bottom = pdf_height - (bbox[3] * y_scale)

    return left, bottom, right, top


def transform_from_pdf_coords(bbox, pdf_height):
    left = bbox[0]
    right = bbox[2]

    pypdf_top = pdf_height - bbox[1]      
    pypdf_bottom = pdf_height - bbox[3]   

    return left, pypdf_bottom, right, pypdf_top


def fill_pdf_form(input_pdf_path, fields_json_path, output_pdf_path):
    
    with open(fields_json_path, "r") as f:
        fields_data = json.load(f)
    
    reader = PdfReader(input_pdf_path)
    writer = PdfWriter()
    
    writer.append(reader)
    
    pdf_dimensions = {}
    for i, page in enumerate(reader.pages):
        mediabox = page.mediabox
        pdf_dimensions[i + 1] = [mediabox.width, mediabox.height]
    
    annotations = []
    for field in fields_data["form_fields"]:
        page_num = field["page_number"]

        page_info = next(p for p in fields_data["pages"] if p["page_number"] == page_num)
        pdf_width, pdf_height = pdf_dimensions[page_num]

        if "pdf_width" in page_info:
            transformed_entry_box = transform_from_pdf_coords(
                field["entry_bounding_box"],
                float(pdf_height)
            )
        else:
            image_width = page_info["image_width"]
            image_height = page_info["image_height"]
            transformed_entry_box = transform_from_image_coords(
                field["entry_bounding_box"],
                image_width, image_height,
                float(pdf_width), float(pdf_height)
            )
        
        if "entry_text" not in field or "text" not in field["entry_text"]:
            continue
        entry_text = field["entry_text"]
        text = entry_text["text"]
        if not text:
            continue
        
        font_name = entry_text.get("font", "Arial")
        font_size = str(entry_text.get("font_size", 14)) + "pt"
        font_color = entry_text.get("font_color", "000000")

        annotation = make_free_text(
            text=text,
            rect=transformed_entry_box,
            font=font_name,
            font_size=font_size,
            font_color=font_color,
        )
        annotations.append(annotation)
        writer.add_annotation(page_number=page_num - 1, annotation=annotation)
        
    with open(output_pdf_path, "wb") as output:
        writer.write(output)
    
    print(f"Successfully filled PDF form and saved to {output_pdf_path}")
    print(f"Added {len(annotations)} text annotations")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: fill_pdf_form_with_annotations.py [input pdf] [fields.json] [output pdf]")
        sys.exit(1)
    input_pdf = sys.argv[1]
    fields_json = sys.argv[2]
    output_pdf = sys.argv[3]
    
    fill_pdf_form(input_pdf, fields_json, output_pdf)
