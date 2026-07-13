"""Replace text in PowerPoint slide XML files.

Usage:
    python replace_text.py <unpacked_dir> <old> <new> [<old> <new> ...] [options]
    python replace_text.py <unpacked_dir> --json <file.json> [options]

Examples:
    python replace_text.py unpacked/ "KI-Training" "AI Training"

    # Batch — multiple pairs in one call:
    python replace_text.py unpacked/ \\
        "KI-Training" "AI Training" \\
        "KI-Abteilung" "AI Department" \\
        "Hindernisse" "Obstacles"

    # Batch from JSON file:
    python replace_text.py unpacked/ --json replacements.json

    JSON format — array of [old, new] pairs or objects with "search"/"replace" keys:
      [["old1", "new1"], ["old2", "new2"]]
      [{"search": "old1", "replace": "new1"}, {"search": "old2", "replace": "new2"}]

Replaces all occurrences of each pair by default. Use --first to replace
only the first occurrence of each pair (pairs are processed in order).

Merges adjacent runs with identical formatting before replacing, so text
that PowerPoint split across multiple <a:r> elements can still be matched.

Text arguments are plain text (not XML). XML special characters are handled automatically.
"""

import argparse
import json
import re
import sys
from pathlib import Path

import defusedxml.minidom

SMART_QUOTE_ENTITIES = {
    "\u201c": "&#x201C;",
    "\u201d": "&#x201D;",
    "\u2018": "&#x2018;",
    "\u2019": "&#x2019;",
}


def _encode_smart_quotes(text: str) -> str:
    for char, entity in SMART_QUOTE_ENTITIES.items():
        text = text.replace(char, entity)
    return text


# ---------------------------------------------------------------------------
# DOM helpers
# ---------------------------------------------------------------------------

def _local_name_match(node, local_name: str) -> bool:
    name = node.localName or node.tagName
    return name == local_name or name.endswith(f":{local_name}")


def _get_child(parent, local_name: str):
    for child in parent.childNodes:
        if child.nodeType == child.ELEMENT_NODE and _local_name_match(child, local_name):
            return child
    return None


def _get_children(parent, local_name: str) -> list:
    return [
        child for child in parent.childNodes
        if child.nodeType == child.ELEMENT_NODE and _local_name_match(child, local_name)
    ]


def _find_elements(root, local_name: str) -> list:
    results = []

    def traverse(node):
        if node.nodeType == node.ELEMENT_NODE:
            if _local_name_match(node, local_name):
                results.append(node)
            for child in node.childNodes:
                traverse(child)

    traverse(root)
    return results


def _get_ancestor(node, local_name: str):
    current = node.parentNode
    while current:
        if current.nodeType == current.ELEMENT_NODE and _local_name_match(current, local_name):
            return current
        current = current.parentNode
    return None


def _next_element_sibling(node):
    sibling = node.nextSibling
    while sibling:
        if sibling.nodeType == sibling.ELEMENT_NODE:
            return sibling
        sibling = sibling.nextSibling
    return None


def _is_adjacent(elem1, elem2) -> bool:
    node = elem1.nextSibling
    while node:
        if node == elem2:
            return True
        if node.nodeType == node.ELEMENT_NODE:
            return False
        if node.nodeType == node.TEXT_NODE and node.data.strip():
            return False
        node = node.nextSibling
    return False


# ---------------------------------------------------------------------------
# Run merging (DrawingML: a:r / a:rPr / a:t)
# ---------------------------------------------------------------------------

def _is_run(node) -> bool:
    return _local_name_match(node, "r")


def _can_merge(run1, run2) -> bool:
    rpr1 = _get_child(run1, "rPr")
    rpr2 = _get_child(run2, "rPr")
    if (rpr1 is None) != (rpr2 is None):
        return False
    if rpr1 is None:
        return True
    return rpr1.toxml() == rpr2.toxml()


def _merge_run_content(target, source):
    for child in list(source.childNodes):
        if child.nodeType == child.ELEMENT_NODE:
            if not _local_name_match(child, "rPr"):
                target.appendChild(child)


def _consolidate_text(run):
    t_elements = _get_children(run, "t")
    for i in range(len(t_elements) - 1, 0, -1):
        curr, prev = t_elements[i], t_elements[i - 1]
        if _is_adjacent(prev, curr):
            prev_text = prev.firstChild.data if prev.firstChild else ""
            curr_text = curr.firstChild.data if curr.firstChild else ""
            merged = prev_text + curr_text
            if prev.firstChild:
                prev.firstChild.data = merged
            else:
                prev.appendChild(run.ownerDocument.createTextNode(merged))
            if merged.startswith(" ") or merged.endswith(" "):
                prev.setAttribute("xml:space", "preserve")
            elif prev.hasAttribute("xml:space"):
                prev.removeAttribute("xml:space")
            run.removeChild(curr)


def _merge_runs_in_dom(dom) -> int:
    """Merge adjacent <a:r> runs with identical <a:rPr> across all paragraphs."""
    merge_count = 0
    for para in _find_elements(dom.documentElement, "p"):
        run = None
        for child in para.childNodes:
            if child.nodeType == child.ELEMENT_NODE and _is_run(child):
                run = child
                break

        while run:
            while True:
                next_elem = _next_element_sibling(run)
                if next_elem and _is_run(next_elem) and _can_merge(run, next_elem):
                    _merge_run_content(run, next_elem)
                    para.removeChild(next_elem)
                    merge_count += 1
                else:
                    break
            _consolidate_text(run)

            sibling = run.nextSibling
            run = None
            while sibling:
                if sibling.nodeType == sibling.ELEMENT_NODE and _is_run(sibling):
                    run = sibling
                    break
                sibling = sibling.nextSibling

    return merge_count


# ---------------------------------------------------------------------------
# Text replacement
# ---------------------------------------------------------------------------

def _find_first_match(dom, search_text: str):
    """Find first <a:t> containing search_text."""
    for t_elem in _find_elements(dom.documentElement, "t"):
        if t_elem.parentNode and not _local_name_match(t_elem.parentNode, "r"):
            continue
        if not t_elem.firstChild or t_elem.firstChild.nodeType != t_elem.TEXT_NODE:
            continue
        idx = t_elem.firstChild.data.find(search_text)
        if idx != -1:
            return t_elem, t_elem.firstChild, idx
    return None


def _create_run(dom, rpr_clone, text_content: str):
    ns = "http://schemas.openxmlformats.org/drawingml/2006/main"
    run = dom.createElementNS(ns, "a:r")
    if rpr_clone is not None:
        run.appendChild(rpr_clone.cloneNode(True))
    t = dom.createElementNS(ns, "a:t")
    t.appendChild(dom.createTextNode(text_content))
    if text_content.startswith(" ") or text_content.endswith(" "):
        t.setAttribute("xml:space", "preserve")
    run.appendChild(t)
    return run


def _set_t_text(t_elem, text):
    """Update an <a:t> element's text content and manage xml:space."""
    if t_elem is None or t_elem.firstChild is None:
        return
    t_elem.firstChild.data = text
    if text and (text.startswith(" ") or text.endswith(" ")):
        t_elem.setAttribute("xml:space", "preserve")
    elif t_elem.hasAttribute("xml:space"):
        t_elem.removeAttribute("xml:space")


def _apply_one_in_dom(dom, old_text, new_text, first_only) -> int:
    """Replace occurrences of old_text with new_text in a single DOM.

    Searches by concatenating text from all <a:r> runs within each <a:p>,
    so matches that span multiple differently-formatted runs still work.
    The replacement text inherits the first affected run's formatting.
    search_start tracking prevents infinite loops when new_text contains old_text.
    """
    if old_text == new_text:
        return 0

    replace_count = 0

    for para in _find_elements(dom.documentElement, "p"):
        run_data = []
        for child in para.childNodes:
            if child.nodeType != child.ELEMENT_NODE or not _is_run(child):
                continue
            t_elem = _get_child(child, "t")
            text = ""
            if t_elem and t_elem.firstChild and t_elem.firstChild.nodeType == t_elem.TEXT_NODE:
                text = t_elem.firstChild.data
            run_data.append([child, t_elem, text])

        if not run_data:
            continue

        full_text = "".join(rd[2] for rd in run_data)
        if old_text not in full_text:
            continue

        search_start = 0
        while True:
            idx = full_text.find(old_text, search_start)
            if idx == -1:
                break
            end_idx = idx + len(old_text)

            pos = 0
            start_run = end_run = -1
            start_offset = end_offset = 0
            for i, (_, _, text) in enumerate(run_data):
                run_end = pos + len(text)
                if start_run == -1 and idx < run_end:
                    start_run = i
                    start_offset = idx - pos
                if end_idx <= run_end:
                    end_run = i
                    end_offset = end_idx - pos
                    break
                pos += len(text)

            if start_run == -1 or end_run == -1:
                break

            for i in range(start_run, end_run + 1):
                _, t_elem, text = run_data[i]
                if i == start_run and i == end_run:
                    new_t = text[:start_offset] + new_text + text[end_offset:]
                elif i == start_run:
                    new_t = text[:start_offset] + new_text
                elif i == end_run:
                    new_t = text[end_offset:]
                else:
                    new_t = ""
                _set_t_text(t_elem, new_t)
                run_data[i][2] = new_t

            replace_count += 1
            search_start = idx + len(new_text)

            if first_only:
                return replace_count

            full_text = "".join(rd[2] for rd in run_data)

    return replace_count


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def replace_text(
    unpacked_dir: str,
    pairs: list[tuple[str, str]],
    first_only: bool = False,
) -> tuple[int, str]:
    slides_dir = Path(unpacked_dir) / "ppt" / "slides"
    if not slides_dir.exists():
        return 0, f"Error: {slides_dir} not found"

    slide_files = sorted(
        slides_dir.glob("slide*.xml"),
        key=lambda p: int(re.search(r"(\d+)", p.stem).group(1))
        if re.search(r"(\d+)", p.stem) else 0,
    )

    if not slide_files:
        return 0, f"Error: No slide files found in {slides_dir}"

    total = 0
    slides_modified = set()
    messages = []

    skipped = [old for old, new in pairs if old == new]
    pairs = [(old, new) for old, new in pairs if old != new]

    for old_text, new_text in pairs:
        pair_count = 0

        for slide_path in slide_files:
            try:
                dom = defusedxml.minidom.parseString(
                    slide_path.read_text(encoding="utf-8")
                )
            except Exception as e:
                messages.append(f"  Error parsing {slide_path.name}: {e}")
                continue

            _merge_runs_in_dom(dom)

            count = _apply_one_in_dom(dom, old_text, new_text, first_only)

            if count > 0:
                output = dom.toxml(encoding="UTF-8").decode("utf-8")
                output = _encode_smart_quotes(output)
                slide_path.write_text(output, encoding="utf-8")
                pair_count += count
                slides_modified.add(slide_path.name)

                if first_only:
                    break

        total += pair_count
        if pair_count == 0:
            messages.append(f'  No match: "{old_text}"')
        else:
            s = "" if pair_count == 1 else "s"
            messages.append(f'  "{old_text}" -> "{new_text}" ({pair_count} occurrence{s})')

    for s in skipped:
        messages.append(f'  Skipped (old == new): "{s}"')

    total_pairs = len(pairs) + len(skipped)
    ps = "" if total_pairs == 1 else "s"
    ss = "" if len(slides_modified) == 1 else "s"
    summary = (
        f"Replaced {total} occurrence(s) across {total_pairs} pair{ps} "
        f"in {len(slides_modified)} slide{ss}"
    )
    return total, "\n".join([summary] + messages)


def _load_json_pairs(json_path: str) -> list[tuple[str, str]]:
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))

    if isinstance(data, dict) and "replacements" in data:
        data = data["replacements"]

    if not isinstance(data, list):
        print(
            "Error: JSON must be an array (or object with 'replacements' array)",
            file=sys.stderr,
        )
        sys.exit(1)

    pairs = []
    for item in data:
        if isinstance(item, list) and len(item) == 2:
            pairs.append((str(item[0]), str(item[1])))
        elif isinstance(item, dict):
            old = item.get("search") or item.get("old") or item.get("find")
            new = item.get("replace") or item.get("new") or item.get("replacement")
            if old is None or new is None:
                print(
                    f"Error: JSON object missing search/replace keys: {item}",
                    file=sys.stderr,
                )
                sys.exit(1)
            pairs.append((str(old), str(new)))
        else:
            print(
                f"Error: Invalid JSON entry (expected [old, new] or object): {item}",
                file=sys.stderr,
            )
            sys.exit(1)

    return pairs


if __name__ == "__main__":
    p = argparse.ArgumentParser(
        description="Replace text in PowerPoint slides",
        epilog='Pass "old" "new" pairs as positional args, or use --json for batch.',
    )
    p.add_argument("unpacked_dir", help="Unpacked PPTX directory")
    p.add_argument(
        "pairs",
        nargs="*",
        metavar="text",
        help="Replacement pairs: old1 new1 [old2 new2 ...]",
    )
    p.add_argument("--json", metavar="FILE", help="JSON file with replacement pairs")
    p.add_argument(
        "--first",
        action="store_true",
        help="Replace only first occurrence of each pair",
    )
    args = p.parse_args()

    if args.json:
        pair_list = _load_json_pairs(args.json)
    elif args.pairs:
        if len(args.pairs) % 2 != 0:
            p.error("Pairs must be even: each old text needs a corresponding new text")
        pair_list = list(zip(args.pairs[::2], args.pairs[1::2]))
    else:
        p.error("Provide replacement pairs as arguments or use --json FILE")

    count, msg = replace_text(args.unpacked_dir, pair_list, args.first)
    print(msg)
    if "Error" in msg:
        sys.exit(1)
