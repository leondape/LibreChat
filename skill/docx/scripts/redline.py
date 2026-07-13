#!/usr/bin/env python3
"""Generate a redline (tracked changes) document by comparing two DOCX files.

Compares doc1 (original) against doc2 (modified) and produces a document
based on doc1 with tracked changes showing all differences.

Usage:
    python redline.py doc1.docx doc2.docx -o redline.docx
    python redline.py original.docx modified.docx -o redline.docx --author "Reviewer"
"""

import argparse
import difflib
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import defusedxml.minidom

SCRIPTS_DIR = Path(__file__).parent
OFFICE_DIR = SCRIPTS_DIR / "office"

from tracked_replace import (
    _build_text_map,
    _clone_rpr,
    _create_run,
    _encode_smart_quotes,
    _find_max_id,
    _get_child,
    _tag_matches,
)


# ---------------------------------------------------------------------------
# Opcode merging — reduces character-level noise in diffs
# ---------------------------------------------------------------------------

def _merge_opcodes(opcodes, min_equal=4):
    """Merge small equal chunks between changes into combined replace blocks."""
    if len(opcodes) <= 1:
        return list(opcodes)

    result = list(opcodes)

    changed = True
    while changed:
        changed = False
        new = []
        i = 0
        while i < len(result):
            if (i + 2 < len(result)
                    and result[i][0] != 'equal'
                    and result[i + 1][0] == 'equal'
                    and (result[i + 1][2] - result[i + 1][1]) < min_equal
                    and result[i + 2][0] != 'equal'):
                a, _, c = result[i], result[i + 1], result[i + 2]
                new.append(('replace', a[1], c[2], a[3], c[4]))
                i += 3
                changed = True
            else:
                new.append(result[i])
                i += 1
        result = new

    final = []
    for op in result:
        if final and final[-1][0] != 'equal' and op[0] != 'equal':
            prev = final[-1]
            final[-1] = ('replace', prev[1], op[2], prev[3], op[4])
        else:
            final.append(op)
    return final


# ---------------------------------------------------------------------------
# Segment helpers
# ---------------------------------------------------------------------------

def _seg_portions(segs, char_start, char_end):
    """Yield (rpr_clone, text) for segments within [char_start, char_end)."""
    for seg in segs:
        if seg.end <= char_start or seg.start >= char_end:
            continue
        rpr = _clone_rpr(seg.run)
        s = max(char_start - seg.start, 0)
        e = min(char_end - seg.start, len(seg.text_node.data))
        portion = seg.text_node.data[s:e]
        if portion:
            yield rpr, portion


def _rpr_near(segs, char_pos):
    """Get rPr clone from the segment at or nearest to char_pos."""
    for seg in segs:
        if seg.start <= char_pos < seg.end:
            return _clone_rpr(seg.run)
    return _clone_rpr(segs[-1].run) if segs else None


def _get_default_rpr(paras_info, near_idx):
    """Get run formatting from the paragraph nearest to near_idx."""
    for offset in range(len(paras_info)):
        for idx in (near_idx + offset, near_idx - offset):
            if 0 <= idx < len(paras_info):
                _, _, segs = paras_info[idx]
                if segs:
                    return _clone_rpr(segs[0].run)
    return None


# ---------------------------------------------------------------------------
# Within-paragraph tracked changes
# ---------------------------------------------------------------------------

def _apply_para_diff(dom, para, text1, segs, text2, author, date, next_id):
    """Replace para's runs with tracked-change markup showing text1 → text2."""
    if text1 == text2 or not segs:
        return next_id

    sm = difflib.SequenceMatcher(None, text1, text2, autojunk=False)
    opcodes = _merge_opcodes(sm.get_opcodes())

    if all(op[0] == 'equal' for op in opcodes):
        return next_id

    default_rpr = _clone_rpr(segs[0].run)
    unique_runs = list(dict.fromkeys(seg.run for seg in segs))
    first_run = unique_runs[0]

    new_nodes = []

    for tag, i1, i2, j1, j2 in opcodes:
        if tag == 'equal':
            for rpr, portion in _seg_portions(segs, i1, i2):
                new_nodes.append(_create_run(dom, rpr, portion))

        elif tag == 'delete':
            d = dom.createElement("w:del")
            d.setAttribute("w:id", str(next_id))
            d.setAttribute("w:author", author)
            d.setAttribute("w:date", date)
            next_id += 1
            for rpr, portion in _seg_portions(segs, i1, i2):
                d.appendChild(_create_run(dom, rpr, portion, "delText"))
            new_nodes.append(d)

        elif tag == 'insert':
            rpr = _rpr_near(segs, i1) or default_rpr
            ins = dom.createElement("w:ins")
            ins.setAttribute("w:id", str(next_id))
            ins.setAttribute("w:author", author)
            ins.setAttribute("w:date", date)
            next_id += 1
            ins.appendChild(_create_run(dom, rpr, text2[j1:j2]))
            new_nodes.append(ins)

        elif tag == 'replace':
            d = dom.createElement("w:del")
            d.setAttribute("w:id", str(next_id))
            d.setAttribute("w:author", author)
            d.setAttribute("w:date", date)
            next_id += 1
            for rpr, portion in _seg_portions(segs, i1, i2):
                d.appendChild(_create_run(dom, rpr, portion, "delText"))
            new_nodes.append(d)

            rpr = _rpr_near(segs, i1) or default_rpr
            ins = dom.createElement("w:ins")
            ins.setAttribute("w:id", str(next_id))
            ins.setAttribute("w:author", author)
            ins.setAttribute("w:date", date)
            next_id += 1
            ins.appendChild(_create_run(dom, rpr, text2[j1:j2]))
            new_nodes.append(ins)

    for node in new_nodes:
        para.insertBefore(node, first_run)
    for run in unique_runs:
        para.removeChild(run)

    return next_id


# ---------------------------------------------------------------------------
# Paragraph-level tracked changes
# ---------------------------------------------------------------------------

def _mark_para_deleted(dom, para, segs, author, date, next_id):
    """Mark an entire paragraph (content + paragraph break) as deleted."""
    ppr = _get_child(para, "pPr")
    if not ppr:
        ppr = dom.createElement("w:pPr")
        if para.firstChild:
            para.insertBefore(ppr, para.firstChild)
        else:
            para.appendChild(ppr)
    rpr = _get_child(ppr, "rPr")
    if not rpr:
        rpr = dom.createElement("w:rPr")
        ppr.appendChild(rpr)
    d = dom.createElement("w:del")
    d.setAttribute("w:id", str(next_id))
    d.setAttribute("w:author", author)
    d.setAttribute("w:date", date)
    next_id += 1
    rpr.appendChild(d)

    if not segs:
        return next_id

    unique_runs = list(dict.fromkeys(seg.run for seg in segs))
    first_run = unique_runs[0]

    del_elem = dom.createElement("w:del")
    del_elem.setAttribute("w:id", str(next_id))
    del_elem.setAttribute("w:author", author)
    del_elem.setAttribute("w:date", date)
    next_id += 1
    for seg in segs:
        if seg.text_node.data:
            del_elem.appendChild(
                _create_run(dom, _clone_rpr(seg.run), seg.text_node.data, "delText")
            )

    para.insertBefore(del_elem, first_run)
    for run in unique_runs:
        para.removeChild(run)

    return next_id


def _insert_para(dom, ref_para, text, run_rpr, author, date, next_id, after=True):
    """Create a tracked-insertion paragraph and place it relative to ref_para."""
    new_para = dom.createElement("w:p")

    ref_ppr = _get_child(ref_para, "pPr")
    new_ppr = ref_ppr.cloneNode(True) if ref_ppr else dom.createElement("w:pPr")

    # Clear inherited tracked-change marks
    rpr = _get_child(new_ppr, "rPr")
    if rpr:
        for child in list(rpr.childNodes):
            if child.nodeType == child.ELEMENT_NODE:
                cname = child.localName or child.tagName
                if cname in ("del", "ins") or cname.endswith(":del") or cname.endswith(":ins"):
                    rpr.removeChild(child)
    else:
        rpr = dom.createElement("w:rPr")
        new_ppr.appendChild(rpr)

    ins_mark = dom.createElement("w:ins")
    ins_mark.setAttribute("w:id", str(next_id))
    ins_mark.setAttribute("w:author", author)
    ins_mark.setAttribute("w:date", date)
    next_id += 1
    rpr.appendChild(ins_mark)
    new_para.appendChild(new_ppr)

    if text:
        ins = dom.createElement("w:ins")
        ins.setAttribute("w:id", str(next_id))
        ins.setAttribute("w:author", author)
        ins.setAttribute("w:date", date)
        next_id += 1
        ins.appendChild(_create_run(dom, run_rpr, text))
        new_para.appendChild(ins)

    body = ref_para.parentNode
    if after:
        if ref_para.nextSibling:
            body.insertBefore(new_para, ref_para.nextSibling)
        else:
            body.appendChild(new_para)
    else:
        body.insertBefore(new_para, ref_para)

    return new_para, next_id


# ---------------------------------------------------------------------------
# Main comparison
# ---------------------------------------------------------------------------

def create_redline(doc1_path, doc2_path, output_path, author="AI-Agent"):
    """Compare two DOCX files and produce a redline with tracked changes."""
    doc1_abs = str(Path(doc1_path).resolve())
    doc2_abs = str(Path(doc2_path).resolve())
    out_abs = str(Path(output_path).resolve())

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        base_dir = tmp / "base"
        mod_dir = tmp / "modified"

        _run_unpack(doc1_abs, str(base_dir))
        _run_unpack(doc2_abs, str(mod_dir))

        base_xml = base_dir / "word" / "document.xml"
        mod_xml = mod_dir / "word" / "document.xml"

        if not base_xml.exists():
            print(f"Error: document.xml not found in {doc1_path}", file=sys.stderr)
            sys.exit(1)
        if not mod_xml.exists():
            print(f"Error: document.xml not found in {doc2_path}", file=sys.stderr)
            sys.exit(1)

        dom1 = defusedxml.minidom.parseString(base_xml.read_text("utf-8"))
        dom2 = defusedxml.minidom.parseString(mod_xml.read_text("utf-8"))

        paras1 = []
        for p in dom1.getElementsByTagName("w:p"):
            text, segs = _build_text_map(p)
            paras1.append((p, text, segs))

        texts2 = []
        for p in dom2.getElementsByTagName("w:p"):
            text, _ = _build_text_map(p)
            texts2.append(text)

        texts1 = [t for _, t, _ in paras1]
        date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        next_id = _find_max_id(dom1) + 1

        sm = difflib.SequenceMatcher(None, texts1, texts2, autojunk=False)
        opcodes = sm.get_opcodes()

        stats = {"equal": 0, "modified": 0, "deleted": 0, "inserted": 0}

        for tag, i1, i2, j1, j2 in reversed(opcodes):
            if tag == 'equal':
                stats["equal"] += i2 - i1
                continue

            if tag == 'replace':
                n1, n2 = i2 - i1, j2 - j1
                common = min(n1, n2)

                for k in range(common):
                    p_elem, t1, s1 = paras1[i1 + k]
                    t2 = texts2[j1 + k]
                    if t1 == t2:
                        stats["equal"] += 1
                        continue
                    ratio = difflib.SequenceMatcher(None, t1, t2).ratio()
                    if ratio < 0.3:
                        next_id = _mark_para_deleted(dom1, p_elem, s1, author, date, next_id)
                        rpr = _get_default_rpr(paras1, i1 + k)
                        new_p, next_id = _insert_para(
                            dom1, p_elem, t2, rpr, author, date, next_id, after=True,
                        )
                        stats["deleted"] += 1
                        stats["inserted"] += 1
                    else:
                        next_id = _apply_para_diff(
                            dom1, p_elem, t1, s1, t2, author, date, next_id,
                        )
                        stats["modified"] += 1

                for k in range(common, n1):
                    p_elem, _, s = paras1[i1 + k]
                    next_id = _mark_para_deleted(dom1, p_elem, s, author, date, next_id)
                    stats["deleted"] += 1

                if n2 > common:
                    ref = paras1[i2 - 1][0]
                    rpr = _get_default_rpr(paras1, i2 - 1)
                    for k in range(common, n2):
                        new_p, next_id = _insert_para(
                            dom1, ref, texts2[j1 + k], rpr, author, date, next_id,
                        )
                        ref = new_p
                        stats["inserted"] += 1

            elif tag == 'delete':
                for k in range(i1, i2):
                    p_elem, _, s = paras1[k]
                    next_id = _mark_para_deleted(dom1, p_elem, s, author, date, next_id)
                    stats["deleted"] += 1

            elif tag == 'insert':
                rpr = _get_default_rpr(paras1, i1)
                if i1 > 0:
                    ref = paras1[i1 - 1][0]
                    after = True
                elif paras1:
                    ref = paras1[0][0]
                    after = False
                else:
                    body = dom1.getElementsByTagName("w:body")[0]
                    ref = body.lastChild
                    after = True

                for k in range(j1, j2):
                    new_p, next_id = _insert_para(
                        dom1, ref, texts2[k], rpr, author, date, next_id, after=after,
                    )
                    ref = new_p
                    after = True
                    stats["inserted"] += 1

        output = dom1.toxml(encoding="UTF-8").decode("utf-8")
        base_xml.write_text(_encode_smart_quotes(output), encoding="utf-8")

        _run_pack(str(base_dir), out_abs, doc1_abs)

    return stats


# ---------------------------------------------------------------------------
# Subprocess helpers
# ---------------------------------------------------------------------------

def _run_unpack(docx_path, output_dir):
    cmd = [sys.executable, str(OFFICE_DIR / "unpack.py"), docx_path, output_dir]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error unpacking {docx_path}: {result.stderr}", file=sys.stderr)
        sys.exit(1)


def _run_pack(input_dir, output_path, original_path):
    cmd = [
        sys.executable, str(OFFICE_DIR / "pack.py"),
        input_dir, output_path,
        "--original", original_path,
        "--validate", "false",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error packing: {result.stderr}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    p = argparse.ArgumentParser(
        description="Generate a redline document by comparing two DOCX files",
        epilog="doc1 is the original (base), doc2 is the modified version.",
    )
    p.add_argument("doc1", help="Original (base) document")
    p.add_argument("doc2", help="Modified document")
    p.add_argument("-o", "--output", required=True, help="Output redline document")
    p.add_argument("--author", default="AI-Agent", help="Author for tracked changes")
    args = p.parse_args()

    for f in (args.doc1, args.doc2):
        if not Path(f).exists():
            print(f"Error: {f} not found", file=sys.stderr)
            sys.exit(1)
        if not f.lower().endswith(".docx"):
            print(f"Error: {f} is not a .docx file", file=sys.stderr)
            sys.exit(1)

    stats = create_redline(args.doc1, args.doc2, args.output, args.author)
    print(
        f"Redline created: {args.output}\n"
        f"  {stats['modified']} modified, {stats['deleted']} deleted, "
        f"{stats['inserted']} inserted, {stats['equal']} unchanged paragraphs"
    )
