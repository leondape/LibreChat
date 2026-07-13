# PPTX Find & Replace

*Operation manual for an agent that finds and replaces text in PowerPoint presentations.*

All steps must happen in a **single code execution**. Use `/tmp/` for intermediate files; only the final `.pptx` goes to `./`.

## Replace Text

```bash
python3 /mnt/data/pptx/scripts/office/unpack.py ./input.pptx /tmp/unpacked/

# Inline pairs:
python3 /mnt/data/pptx/scripts/replace_text.py /tmp/unpacked/ \
  "old text" "new text" \
  "[PLACEHOLDER]" "real value"

# Or from a JSON file:
python3 /mnt/data/pptx/scripts/replace_text.py /tmp/unpacked/ --json ./replacements.json

python3 /mnt/data/pptx/scripts/office/pack.py /tmp/unpacked/ ./output.pptx --original ./input.pptx
```

Options: `--first` (first occurrence of each pair only).

JSON format — either works:
```json
[["old1", "new1"], ["old2", "new2"]]
```
```json
{"replacements": [{"search": "old", "replace": "new"}]}
```

The script automatically merges fragmented text runs before replacing. It also matches text that spans multiple differently-formatted runs within the same paragraph (cross-run matching), so even text that PowerPoint split with mixed formatting will be found and replaced.

## Important Notes

- **Skip no-op pairs.** Do NOT include pairs where old == new (e.g. brand names that need no translation). The script will silently skip them, but omitting them keeps the command shorter.
- **Smart quotes.** For translations, use a JSON file created via bash heredoc (`cat > /tmp/replacements.json << 'EOF'`). Smart quotes (`„` `"` `'` etc.) work in bash heredocs but cause `SyntaxError` in Python string literals. The XML parser decodes entities back to Unicode, so search strings should contain the original characters.
- **Prefer JSON for batch replacements** (10+ pairs). Inline pairs can break with special shell characters.
- **Accented / non-ASCII text: pass REAL UTF-8, never escape sequences.** Write `ï`, `é`, `ç`, `€`, `—`, smart quotes, etc. as their actual characters. Never emit `\xef`, `\u00ef`, `\N{...}` etc. — they are inserted literally, so `Wangaï` becomes the corrupted `Wanga\xef`. When writing the JSON in Python, use `json.dump(pairs, f, ensure_ascii=False)`. Post-check the output has no stray `\x`/`\u` artifacts.
