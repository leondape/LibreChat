---
name: translate
description: "Use when the user wants to translate a whole document into another language while keeping its formatting (docx, pptx, xlsx, pdf, txt, html, srt, xliff, images)."
---

# Document Translation

Whole-document translation does **not** run in this chat/code sandbox. For
technical reasons it lives in a **separate, dedicated web app**: the sandbox is
offline and cannot reach the translation provider, so translation was moved to
its own site that holds the provider key securely server-side and preserves the
original formatting.

Because of this, **do not** attempt to translate documents with `execute_code`,
scripts, or any network call, and do not try to install or call any translation
library or API. There is no in-sandbox translation path. Instead, direct the
user to the Document Translator (DeepL) web app, where they upload the file, pick the
target language, and download the translated result.

**Translator app:** https://translate.mediawan.ai

## How to respond

When the user asks to translate a document (or uploads a file and asks for a
translated version), reply with a short message that:

1. Explains briefly that, for technical reasons, translation runs on a dedicated
   website rather than in this chat.
2. Points them to the translator: **[Open the Document Translator (DeepL)](https://translate.mediawan.ai)**
3. Tells them to upload the file there, choose the target language (optionally
   the source language), and download the result.
4. Notes the format/size limits if relevant.

Keep the reply brief. Do not run any code.

### Supported formats

`docx`, `pptx`, `xlsx`, `pdf`, `txt`, `html`, `htm`, `srt`, `xlf`/`xliff`,
`jpg`/`jpeg`, `png`. Maximum file size **30 MB**.

If the user's file is not a supported format, tell them and suggest converting
it (e.g. to PDF or DOCX) before translating.

### Example reply

> For technical reasons, document translation runs on a dedicated website rather
> than here in the chat. **[Open the Document Translator (DeepL)](https://translate.mediawan.ai)**,
> upload your file, choose the target language, and download the translated
> document — the original formatting is preserved.
>
> Supported formats: docx, pptx, xlsx, pdf, txt, html, srt, xliff, and images
> (jpg/png), up to 30 MB.
