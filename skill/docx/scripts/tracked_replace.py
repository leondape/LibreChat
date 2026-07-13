"""Replace text with tracked changes in DOCX documents.

Supports cross-run matching (text split across multiple <w:r> elements)
and cross-paragraph matching (search strings containing newlines).
All matching uses aggressive whitespace normalization — spacing differences
between the search string and the document are handled automatically.

Usage:
    python tracked_replace.py <unpacked_dir> <old> <new> [<old> <new> ...] [options]
    python tracked_replace.py <unpacked_dir> --json <file.json> [options]
    python tracked_replace.py <unpacked_dir> --dump-text

Options:
    --plain     Replace without tracked changes (modifies text in-place)
    --first     Replace only the first occurrence of each pair
    --author    Author name for tracked changes (default: AI-Agent)
    --json      JSON file with replacement pairs
    --dump-text Print each paragraph's text as the engine sees it and exit

JSON format:
    [["old1", "new1"], ["old2", "new2"]]
    [{"search": "old1", "replace": "new1"}]
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
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
# XML helpers
# ---------------------------------------------------------------------------

def _get_child(parent, local_name: str):
    for child in parent.childNodes:
        if child.nodeType == child.ELEMENT_NODE:
            name = child.localName or child.tagName
            if name == local_name or name.endswith(f":{local_name}"):
                return child
    return None


def _get_children(parent, local_name: str):
    result = []
    for child in parent.childNodes:
        if child.nodeType == child.ELEMENT_NODE:
            name = child.localName or child.tagName
            if name == local_name or name.endswith(f":{local_name}"):
                result.append(child)
    return result


def _tag_matches(node, local_name: str) -> bool:
    if node.nodeType != node.ELEMENT_NODE:
        return False
    name = node.localName or node.tagName
    return name == local_name or name.endswith(f":{local_name}")


def _is_inside_tracked_change(node) -> bool:
    cur = node.parentNode
    while cur and cur.nodeType == cur.ELEMENT_NODE:
        name = cur.localName or cur.tagName
        if name in ("del", "ins") or name.endswith(":del") or name.endswith(":ins"):
            return True
        if name in ("p", "body", "tc") or name.endswith(":p") or name.endswith(":body") or name.endswith(":tc"):
            break
        cur = cur.parentNode
    return False


def _find_max_id(dom) -> int:
    max_id = 0
    for elem in dom.getElementsByTagName("*"):
        val = elem.getAttribute("w:id")
        if val:
            try:
                max_id = max(max_id, int(val))
            except ValueError:
                pass
    return max_id


# ---------------------------------------------------------------------------
# Text map: concatenate runs, tabs become spaces
# ---------------------------------------------------------------------------

class _Segment:
    __slots__ = ("start", "end", "run", "t_elem", "text_node")

    def __init__(self, start, end, run, t_elem, text_node):
        self.start = start
        self.end = end
        self.run = run
        self.t_elem = t_elem
        self.text_node = text_node


def _build_text_map(paragraph):
    """Build (text, segments) for a <w:p>. Tabs become spaces."""
    segments = []
    offset = 0
    for child in paragraph.childNodes:
        if child.nodeType != child.ELEMENT_NODE:
            continue
        if _tag_matches(child, "r") and not _is_inside_tracked_change(child):
            for sub in child.childNodes:
                if sub.nodeType != sub.ELEMENT_NODE:
                    continue
                if _tag_matches(sub, "tab"):
                    prev = sub.previousSibling
                    if (prev and prev.nodeType == prev.ELEMENT_NODE
                            and _tag_matches(prev, "t")
                            and prev.getAttribute("xml:space") == "preserve"
                            and prev.firstChild and prev.firstChild.data == " "):
                        segments.append(_Segment(offset, offset + 1, child, prev, prev.firstChild))
                        offset += 1
                    else:
                        doc = paragraph.ownerDocument
                        t = doc.createElement("w:t")
                        t.setAttribute("xml:space", "preserve")
                        tn = doc.createTextNode(" ")
                        t.appendChild(tn)
                        child.insertBefore(t, sub)
                        segments.append(_Segment(offset, offset + 1, child, t, tn))
                        offset += 1
                elif _tag_matches(sub, "t"):
                    if sub.firstChild and sub.firstChild.nodeType == sub.TEXT_NODE:
                        txt = sub.firstChild.data
                        if txt:
                            segments.append(_Segment(offset, offset + len(txt), child, sub, sub.firstChild))
                            offset += len(txt)
    return "".join(seg.text_node.data for seg in segments), segments


# ---------------------------------------------------------------------------
# Normalization — always applied, no fallback needed
# ---------------------------------------------------------------------------

_WS = set(" \t\n\r\xa0")


def _normalize(text: str) -> str:
    """Collapse all whitespace to single space and strip."""
    return re.sub(r"\s+", " ", text).strip()


def _norm_map(text: str):
    """Normalize whitespace with position mapping back to the original text.

    Returns (normalized_str, orig_positions) where orig_positions[i] gives
    the index in the original text for normalized character i.
    """
    out = []
    pos = []
    i = 0
    n = len(text)
    while i < n and text[i] in _WS:
        i += 1
    while i < n:
        if text[i] in _WS:
            j = i
            while j < n and text[j] in _WS:
                j += 1
            if j < n:
                out.append(" ")
                pos.append(i)
            i = j
        else:
            out.append(text[i])
            pos.append(i)
            i += 1
    return "".join(out), pos


# ---------------------------------------------------------------------------
# Matching — always normalized
# ---------------------------------------------------------------------------

def _find_match(dom, search_text):
    """Find first paragraph containing search_text (normalized).

    Returns (paragraph, orig_start, orig_end, segments) or None.
    """
    ns = _normalize(search_text)
    if not ns:
        return None
    for p in dom.getElementsByTagName("w:p"):
        full, segs = _build_text_map(p)
        nf, opos = _norm_map(full)
        idx = nf.find(ns)
        if idx != -1:
            orig_start = opos[idx]
            ne = idx + len(ns)
            orig_end = opos[ne] if ne < len(opos) else len(full)
            return p, orig_start, orig_end, segs
    return None


def _find_multi_match(dom, fragments, start_from=0):
    """Match fragments against consecutive paragraphs (normalized).

    fragments[0] must end a paragraph, fragments[-1] must start one,
    middles must match entire paragraph text. Empty paragraphs are skipped.

    Returns list of (para, start, end, segments, frag_idx) or None.
    frag_idx is -1 for skipped empty paragraphs.
    """
    paragraphs = list(dom.getElementsByTagName("w:p"))
    nfrags = [_normalize(f) for f in fragments]
    num = len(fragments)

    for i in range(start_from, len(paragraphs)):
        fi = 0
        pi = i
        info = []

        while fi < num and pi < len(paragraphs):
            full, segs = _build_text_map(paragraphs[pi])
            nf, opos = _norm_map(full)

            if fi == 0:
                if nf.endswith(nfrags[0]):
                    ns = len(nf) - len(nfrags[0])
                    orig_start = opos[ns] if opos and ns < len(opos) else 0
                    info.append((paragraphs[pi], orig_start, len(full.rstrip()), segs, fi))
                    fi += 1
                    pi += 1
                else:
                    break
            elif fi == num - 1:
                if nf.startswith(nfrags[fi]):
                    ne = len(nfrags[fi])
                    orig_end = opos[ne] if opos and ne < len(opos) else len(full)
                    info.append((paragraphs[pi], 0, orig_end, segs, fi))
                    fi += 1
                    pi += 1
                elif not nf:
                    info.append((paragraphs[pi], 0, 0, segs, -1))
                    pi += 1
                else:
                    break
            else:
                if nf == nfrags[fi]:
                    info.append((paragraphs[pi], 0, len(full.rstrip()), segs, fi))
                    fi += 1
                    pi += 1
                elif not nf:
                    info.append((paragraphs[pi], 0, 0, segs, -1))
                    pi += 1
                else:
                    break

        if fi == num:
            return info

    return None


# ---------------------------------------------------------------------------
# Run creation helpers
# ---------------------------------------------------------------------------

def _create_run(dom, rpr_clone, text_content: str, text_tag: str = "t"):
    run = dom.createElement("w:r")
    if rpr_clone is not None:
        run.appendChild(rpr_clone.cloneNode(True))
    t = dom.createElement(f"w:{text_tag}")
    t.appendChild(dom.createTextNode(text_content))
    if text_content.startswith(" ") or text_content.endswith(" "):
        t.setAttribute("xml:space", "preserve")
    run.appendChild(t)
    return run


def _clone_rpr(run):
    rpr = _get_child(run, "rPr")
    return rpr.cloneNode(True) if rpr else None


def _affected_segments(segments, start, end):
    return [s for s in segments if s.end > start and s.start < end]


# ---------------------------------------------------------------------------
# Single-paragraph replacement
# ---------------------------------------------------------------------------

def _replace_single_tracked(dom, old_text, new_text, author, date, next_id, first_only):
    count = 0
    while True:
        result = _find_match(dom, old_text)
        if not result:
            break
        para, m_start, m_end, segs = result
        affected = _affected_segments(segs, m_start, m_end)
        if not affected:
            break

        first_seg = affected[0]
        last_seg = affected[-1]
        rpr = _clone_rpr(first_seg.run)
        container = first_seg.run.parentNode
        ref = first_seg.run

        before = first_seg.text_node.data[: m_start - first_seg.start]
        after = last_seg.text_node.data[m_end - last_seg.start :]

        del_elem = dom.createElement("w:del")
        del_elem.setAttribute("w:id", str(next_id))
        del_elem.setAttribute("w:author", author)
        del_elem.setAttribute("w:date", date)
        next_id += 1
        for seg in affected:
            seg_rpr = _clone_rpr(seg.run)
            ls = max(m_start - seg.start, 0)
            le = min(m_end - seg.start, len(seg.text_node.data))
            portion = seg.text_node.data[ls:le]
            if portion:
                del_elem.appendChild(_create_run(dom, seg_rpr, portion, "delText"))

        ins_elem = dom.createElement("w:ins")
        ins_elem.setAttribute("w:id", str(next_id))
        ins_elem.setAttribute("w:author", author)
        ins_elem.setAttribute("w:date", date)
        ins_elem.appendChild(_create_run(dom, rpr, new_text))
        next_id += 1

        nodes = []
        if before:
            nodes.append(_create_run(dom, _clone_rpr(first_seg.run), before))
        nodes.append(del_elem)
        nodes.append(ins_elem)
        if after:
            nodes.append(_create_run(dom, _clone_rpr(last_seg.run), after))
        for n in nodes:
            container.insertBefore(n, ref)

        seen = set()
        for seg in affected:
            rid = id(seg.run)
            if rid not in seen:
                seen.add(rid)
                container.removeChild(seg.run)

        count += 1
        if first_only:
            break
    return count, next_id


def _replace_single_plain(dom, old_text, new_text, first_only):
    count = 0
    ns = _normalize(old_text)
    for p in dom.getElementsByTagName("w:p"):
        search_from = 0
        while True:
            full, segs = _build_text_map(p)
            tail = full[search_from:]
            nt, tpos = _norm_map(tail)
            idx = nt.find(ns)
            if idx == -1 or not tpos:
                break
            m_start = search_from + tpos[idx]
            ne = idx + len(ns)
            m_end = search_from + (tpos[ne] if ne < len(tpos) else len(tail))

            affected = _affected_segments(segs, m_start, m_end)
            if not affected:
                break

            first_seg = affected[0]
            last_seg = affected[-1]
            before = first_seg.text_node.data[: m_start - first_seg.start]
            after = last_seg.text_node.data[m_end - last_seg.start :]

            if len(affected) == 1:
                first_seg.text_node.data = before + new_text + after
            else:
                first_seg.text_node.data = before + new_text
                for seg in affected[1:-1]:
                    seg.text_node.data = ""
                last_seg.text_node.data = after if after else ""

            for seg in affected:
                t = seg.text_node.data
                if t and (t.startswith(" ") or t.endswith(" ")):
                    seg.t_elem.setAttribute("xml:space", "preserve")

            container = first_seg.run.parentNode
            seen = set()
            for seg in affected[1:]:
                if not seg.text_node.data:
                    rid = id(seg.run)
                    if rid not in seen:
                        seen.add(rid)
                        has_other = any(
                            c.nodeType == c.ELEMENT_NODE
                            and not _tag_matches(c, "rPr")
                            and c != seg.t_elem
                            for c in seg.run.childNodes
                        )
                        if not has_other:
                            container.removeChild(seg.run)

            count += 1
            search_from = m_start + len(new_text)
            if first_only:
                return count
    return count


# ---------------------------------------------------------------------------
# Multi-paragraph replacement
# ---------------------------------------------------------------------------

def _mark_para_break_deleted(dom, para, author, date, next_id):
    """Mark a paragraph break as deleted (OOXML pPr/rPr/del)."""
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
    if rpr.firstChild:
        rpr.insertBefore(d, rpr.firstChild)
    else:
        rpr.appendChild(d)
    return next_id + 1


def _replace_multi_tracked(dom, old_text, new_text, author, date, next_id, first_only):
    old_frags = [f for f in old_text.split("\n") if f]
    new_frags = [f for f in (new_text.split("\n") if "\n" in new_text else [new_text]) if f]
    if len(old_frags) < 2:
        return 0, next_id

    count = 0
    while True:
        match = _find_multi_match(dom, old_frags)
        if not match:
            break

        # --- First paragraph: delete matched tail ---
        p0, s0, e0, segs0, _ = match[0]
        aff0 = _affected_segments(segs0, s0, e0)
        if aff0:
            seg0 = aff0[0]
            rpr = _clone_rpr(seg0.run)
            container = seg0.run.parentNode
            ref = seg0.run
            before = seg0.text_node.data[: s0 - seg0.start]

            d = dom.createElement("w:del")
            d.setAttribute("w:id", str(next_id))
            d.setAttribute("w:author", author)
            d.setAttribute("w:date", date)
            next_id += 1
            for seg in aff0:
                sr = _clone_rpr(seg.run)
                ls = max(s0 - seg.start, 0)
                le = min(e0 - seg.start, len(seg.text_node.data))
                portion = seg.text_node.data[ls:le]
                if portion:
                    d.appendChild(_create_run(dom, sr, portion, "delText"))

            nodes = []
            if before:
                nodes.append(_create_run(dom, _clone_rpr(seg0.run), before))
            nodes.append(d)
            if new_frags:
                ins = dom.createElement("w:ins")
                ins.setAttribute("w:id", str(next_id))
                ins.setAttribute("w:author", author)
                ins.setAttribute("w:date", date)
                ins.appendChild(_create_run(dom, rpr, new_frags[0]))
                next_id += 1
                nodes.append(ins)
            for n in nodes:
                container.insertBefore(n, ref)
            seen = set()
            for seg in aff0:
                rid = id(seg.run)
                if rid not in seen:
                    seen.add(rid)
                    container.removeChild(seg.run)

        # --- Middle paragraphs: mark as deleted ---
        for mi in range(1, len(match) - 1):
            pm, _, _, segsm, fi = match[mi]
            next_id = _mark_para_break_deleted(dom, pm, author, date, next_id)

            unique_runs = list(dict.fromkeys(seg.run for seg in segsm)) if segsm else []
            if unique_runs:
                dc = dom.createElement("w:del")
                dc.setAttribute("w:id", str(next_id))
                dc.setAttribute("w:author", author)
                dc.setAttribute("w:date", date)
                next_id += 1
                pm.insertBefore(dc, unique_runs[0])
                for r in unique_runs:
                    for t_elem in _get_children(r, "t"):
                        dt = dom.createElement("w:delText")
                        if t_elem.firstChild:
                            dt.appendChild(t_elem.firstChild.cloneNode(True))
                        if t_elem.getAttribute("xml:space"):
                            dt.setAttribute("xml:space", t_elem.getAttribute("xml:space"))
                        r.replaceChild(dt, t_elem)
                    pm.removeChild(r)
                    dc.appendChild(r)

            if 0 <= fi < len(new_frags):
                rpr_mid = _clone_rpr(segsm[0].run) if segsm else None
                ins = dom.createElement("w:ins")
                ins.setAttribute("w:id", str(next_id))
                ins.setAttribute("w:author", author)
                ins.setAttribute("w:date", date)
                ins.appendChild(_create_run(dom, rpr_mid, new_frags[fi]))
                next_id += 1
                pm.appendChild(ins)

        # --- Last paragraph: delete matched head ---
        if len(match) > 1:
            pl, sl, el, segsl, _ = match[-1]
            affl = _affected_segments(segsl, sl, el)
            if affl:
                segl0 = affl[0]
                segln = affl[-1]
                rprl = _clone_rpr(segl0.run)
                containerl = segl0.run.parentNode
                refl = segl0.run
                afterl = segln.text_node.data[el - segln.start :]

                next_id = _mark_para_break_deleted(dom, pl, author, date, next_id)

                dl = dom.createElement("w:del")
                dl.setAttribute("w:id", str(next_id))
                dl.setAttribute("w:author", author)
                dl.setAttribute("w:date", date)
                next_id += 1
                for seg in affl:
                    sr = _clone_rpr(seg.run)
                    ls = max(sl - seg.start, 0)
                    le = min(el - seg.start, len(seg.text_node.data))
                    portion = seg.text_node.data[ls:le]
                    if portion:
                        dl.appendChild(_create_run(dom, sr, portion, "delText"))

                nodesl = [dl]
                lfi = len(old_frags) - 1
                if lfi < len(new_frags):
                    insl = dom.createElement("w:ins")
                    insl.setAttribute("w:id", str(next_id))
                    insl.setAttribute("w:author", author)
                    insl.setAttribute("w:date", date)
                    insl.appendChild(_create_run(dom, rprl, new_frags[lfi]))
                    next_id += 1
                    nodesl.append(insl)
                if afterl:
                    nodesl.append(_create_run(dom, _clone_rpr(segln.run), afterl))
                for n in nodesl:
                    containerl.insertBefore(n, refl)
                seen = set()
                for seg in affl:
                    rid = id(seg.run)
                    if rid not in seen:
                        seen.add(rid)
                        containerl.removeChild(seg.run)

        count += 1
        if first_only:
            break
    return count, next_id


def _replace_multi_plain(dom, old_text, new_text, first_only):
    old_frags = [f for f in old_text.split("\n") if f]
    new_frags = [f for f in (new_text.split("\n") if "\n" in new_text else [new_text]) if f]
    if len(old_frags) < 2:
        return 0

    count = 0
    start_from = 0
    while True:
        match = _find_multi_match(dom, old_frags, start_from)
        if not match:
            break

        p0, s0, e0, segs0, _ = match[0]
        aff0 = _affected_segments(segs0, s0, e0)
        if aff0:
            seg0 = aff0[0]
            before = seg0.text_node.data[: s0 - seg0.start]
            seg0.text_node.data = before + (new_frags[0] if new_frags else "")
            container = seg0.run.parentNode
            seen = set()
            for seg in aff0[1:]:
                rid = id(seg.run)
                if rid not in seen:
                    seen.add(rid)
                    seg.text_node.data = ""
                    container.removeChild(seg.run)

        for mi in range(1, len(match) - 1):
            pm, _, _, segsm, fi = match[mi]
            if 0 <= fi < len(new_frags) and segsm:
                segsm[0].text_node.data = new_frags[fi]
                container = segsm[0].run.parentNode
                seen = {id(segsm[0].run)}
                for seg in segsm[1:]:
                    rid = id(seg.run)
                    if rid not in seen:
                        seen.add(rid)
                        container.removeChild(seg.run)
            elif segsm:
                container = segsm[0].run.parentNode
                for seg in segsm:
                    container.removeChild(seg.run)

        if len(match) > 1:
            pl, sl, el, segsl, _ = match[-1]
            affl = _affected_segments(segsl, sl, el)
            if affl:
                segn = affl[-1]
                after = segn.text_node.data[el - segn.start :]
                lfi = len(old_frags) - 1
                new_l = new_frags[lfi] if lfi < len(new_frags) else ""
                if len(affl) == 1:
                    affl[0].text_node.data = new_l + after
                else:
                    affl[0].text_node.data = new_l
                    container = affl[0].run.parentNode
                    seen = {id(affl[0].run)}
                    for seg in affl[1:-1]:
                        rid = id(seg.run)
                        if rid not in seen:
                            seen.add(rid)
                            container.removeChild(seg.run)
                    affl[-1].text_node.data = after

        count += 1
        paras = list(dom.getElementsByTagName("w:p"))
        last_p = match[-1][0]
        for pi, px in enumerate(paras):
            if px is last_p:
                start_from = pi + 1
                break
        else:
            break
        if first_only:
            break
    return count


# ---------------------------------------------------------------------------
# Dispatch and public API
# ---------------------------------------------------------------------------

def _diagnose_no_match(dom, old_text, pair_index, pairs, plain):
    """Return a short hint explaining why a search string probably didn't match."""
    hints = []

    # 1. Cross-cell pattern (3+ consecutive spaces, no newline)
    if "   " in old_text and "\n" not in old_text:
        hints.append(
            "contains long whitespace gaps — if this spans table cells, "
            "use separate search/replace pairs for each cell's content"
        )

    # 2. Sequential dependency: a previous pair's replacement contains this search
    if not plain:
        ns = _normalize(old_text)
        for j in range(pair_index):
            prev_new = _normalize(pairs[j][1])
            if ns in prev_new or prev_new in ns:
                hints.append(
                    f"text may have been introduced by pair #{j + 1} — "
                    f"in tracked mode, inserted text is inside <w:ins> and "
                    f"invisible to later searches"
                )
                break

    # 3. Multi-paragraph: identify which fragment failed
    if "\n" in old_text:
        frags = [f for f in old_text.split("\n") if f]
        if len(frags) >= 2:
            paras = list(dom.getElementsByTagName("w:p"))
            nfrags = [_normalize(f) for f in frags]
            first_found = any(
                _normalize(_build_text_map(p)[0]).endswith(nfrags[0])
                for p in paras
            )
            if not first_found:
                hints.append(
                    f"first fragment not found at end of any paragraph: "
                    f"\"{frags[0][:60]}{'…' if len(frags[0]) > 60 else ''}\""
                )

    # 4. Nearest partial match (single-paragraph only, first 50 chars)
    if "\n" not in old_text and "   " not in old_text:
        ns = _normalize(old_text)
        prefix = ns[:50]
        best_para = None
        best_len = 0
        for p in dom.getElementsByTagName("w:p"):
            nf = _normalize(_build_text_map(p)[0])
            if prefix[:20] in nf and len(nf) > best_len:
                best_para = nf
                best_len = len(nf)
        if best_para and ns not in best_para:
            hints.append(
                f"closest paragraph starts with: "
                f"\"{best_para[:80]}{'…' if len(best_para) > 80 else ''}\""
            )

    return "; ".join(hints) if hints else None


def _apply_one(dom, old_text, new_text, author, date, next_id, first_only, plain):
    if "\n" in old_text:
        if plain:
            return _replace_multi_plain(dom, old_text, new_text, first_only), next_id
        return _replace_multi_tracked(dom, old_text, new_text, author, date, next_id, first_only)
    if plain:
        return _replace_single_plain(dom, old_text, new_text, first_only), next_id
    return _replace_single_tracked(dom, old_text, new_text, author, date, next_id, first_only)


def tracked_replace(
    unpacked_dir: str,
    pairs: list[tuple[str, str]],
    author: str = "AI-Agent",
    date: str | None = None,
    first_only: bool = False,
    plain: bool = False,
) -> tuple[int, str]:
    doc_xml = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_xml.exists():
        return 0, f"Error: {doc_xml} not found"

    if date is None:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        dom = defusedxml.minidom.parseString(doc_xml.read_text(encoding="utf-8"))
    except Exception as e:
        return 0, f"Error parsing XML: {e}"

    next_id = _find_max_id(dom) + 1
    total = 0
    ok_count = 0
    fail_messages = []

    for pair_idx, (old_text, new_text) in enumerate(pairs):
        count, next_id = _apply_one(
            dom, old_text, new_text, author, date, next_id, first_only, plain
        )
        total += count
        if count == 0:
            hint = _diagnose_no_match(dom, old_text, pair_idx, pairs, plain)
            short = old_text.replace("\n", "\\n")
            if len(short) > 80:
                short = short[:77] + "..."
            line = f'  ✗ [{pair_idx + 1}] "{short}"'
            if hint:
                line += f"\n    ↳ {hint}"
            fail_messages.append(line)
        else:
            ok_count += 1

    output = dom.toxml(encoding="UTF-8").decode("utf-8")
    doc_xml.write_text(_encode_smart_quotes(output), encoding="utf-8")

    mode = "plain" if plain else "tracked"
    lines = [
        f"Replaced {total} occurrence{'s' if total != 1 else ''} "
        f"across {len(pairs)} pair{'s' if len(pairs) != 1 else ''} ({mode}): "
        f"{ok_count} matched, {len(fail_messages)} failed"
    ]

    if fail_messages:
        lines.append("")
        lines.append("Failed searches:")
        lines.extend(fail_messages)
        lines.append(
            f"\nNote: {len(fail_messages)} search string(s) did not match. "
            f"This is often caused by complex Word formatting in the source "
            f"document — tabs instead of spaces, hidden runs, non-breaking "
            f"spaces, or inconsistent numbering styles can make text hard to "
            f"target reliably. Cleaner, simpler .docx templates reduce these "
            f"issues."
        )

    return total, "\n".join(lines)


def dump_text(unpacked_dir: str) -> str:
    """Print each paragraph's text exactly as the engine sees it (one per line)."""
    doc_xml = Path(unpacked_dir) / "word" / "document.xml"
    if not doc_xml.exists():
        return f"Error: {doc_xml} not found"

    dom = defusedxml.minidom.parseString(doc_xml.read_text(encoding="utf-8"))
    lines = []
    for p in dom.getElementsByTagName("w:p"):
        text, _ = _build_text_map(p)
        lines.append(text)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# JSON loading and CLI
# ---------------------------------------------------------------------------

def _load_json_pairs(json_path: str) -> list[tuple[str, str]]:
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))

    if isinstance(data, dict) and "replacements" in data:
        data = data["replacements"]

    if not isinstance(data, list):
        print("Error: JSON must be an array (or object with 'replacements' array)", file=sys.stderr)
        sys.exit(1)

    pairs = []
    for item in data:
        if isinstance(item, list) and len(item) == 2:
            pairs.append((str(item[0]), str(item[1])))
        elif isinstance(item, dict):
            old = item.get("search") or item.get("old") or item.get("find")
            new = item.get("replace") or item.get("new") or item.get("replacement")
            if old is None or new is None:
                print(f"Error: JSON object missing search/replace keys: {item}", file=sys.stderr)
                sys.exit(1)
            pairs.append((str(old), str(new)))
        else:
            print(f"Error: Invalid JSON entry: {item}", file=sys.stderr)
            sys.exit(1)

    return pairs


if __name__ == "__main__":
    p = argparse.ArgumentParser(
        description="Replace text with tracked changes (or plain mode)",
        epilog='Pass "old" "new" pairs as positional args, or use --json for batch.',
    )
    p.add_argument("unpacked_dir", help="Unpacked DOCX directory")
    p.add_argument("pairs", nargs="*", metavar="text", help="old1 new1 [old2 new2 ...]")
    p.add_argument("--json", metavar="FILE", help="JSON file with replacement pairs")
    p.add_argument("--author", default="AI-Agent")
    p.add_argument("--date", help="ISO timestamp (default: current UTC)")
    p.add_argument("--first", action="store_true", help="Replace only first occurrence")
    p.add_argument("--plain", action="store_true", help="Replace without tracked changes")
    p.add_argument("--dump-text", action="store_true", help="Print engine-visible text and exit")
    args = p.parse_args()

    if args.dump_text:
        out = dump_text(args.unpacked_dir)
        print(out)
        sys.exit(1 if out.startswith("Error") else 0)

    if args.json:
        pair_list = _load_json_pairs(args.json)
    elif args.pairs:
        if len(args.pairs) % 2 != 0:
            p.error("Pairs must be even: each old text needs a corresponding new text")
        pair_list = list(zip(args.pairs[::2], args.pairs[1::2]))
    else:
        p.error("Provide replacement pairs as arguments or use --json FILE")

    count, msg = tracked_replace(
        args.unpacked_dir, pair_list, args.author, args.date, args.first, args.plain
    )
    print(msg)
    if msg.startswith("Error"):
        sys.exit(1)
