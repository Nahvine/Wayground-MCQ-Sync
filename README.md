# Canvas → Wayground MCQ Sync (Tampermonkey Userscript)

<img src="https://github.com/user-attachments/assets/a5f055ba-a9bc-4644-af20-6f06c48744ca"
     alt="Canvas → Wayground — control panel" width="640" />

> **One-click pipeline:** collect Multiple-Choice questions from Canvas, de-duplicate & persist them, then auto-create MCQs in Wayground with strict field mapping, verified fills, and reliable saving. Includes XLSX export (Quizizz-style).

---

## Features

- **Collect on Canvas**
  - Scrapes **Multiple Choice** questions from quiz history pages.
  - **Skips** questions marked **“Incorrect.”**
  - Extracts **Question**, **Options A–D**, and **Correct option.**
  - **De-duplicates** and **persists** your queue across reloads.

- **Post to Wayground**
  - Works on `https://wayground.com/admin/quiz/*`.
  - Clicks **Add Question → MCQ**, fills **Question + A/B/C/D**, **marks correct**, then **saves**.
  - **Strict row mapping:** each option is written to the editor **in the same row** as its tick button `mcq-editor-mark-answer-{i}-button`.
  - **Verified fills** with retries for each field (prevents missing **D**).
  - **Strict Save** detection (text + icon) to avoid accidental navigation.

- **Export to XLSX**
  - Quizizz-style sheet (falls back to CSV if the XLSX library isn’t ready).
  - Auto-download **and** prints a **30-second link** in the panel if your browser blocks downloads.

---

## Quick Start

1. Install **Tampermonkey** (or a compatible userscript manager).
2. Create a new userscript and paste the script from this repo.
3. Open:
   - **Canvas**: a quiz history page (e.g., `.../quizzes/.../history?version=1`)
   - **Wayground**: `https://wayground.com/admin/quiz/...`
4. In the floating panel:
   - **Collect** (on Canvas) to add questions to the queue.
   - **Start** to enable **autorun** (the Wayground tab is “woken up” automatically).
   - Adjust **Delay (ms)** if needed for slower pages.
5. Switch to Wayground (or leave it in a background tab). The script will:
   - Add question → fill A/B/C/D → mark correct → **Save question** → repeat.
6. Use **Export** at any time (on either tab) to download the current queue as **XLSX/CSV**.

---

## Panel Controls

- **Collect** *(Canvas only)* — scrape MCQs (skips *Incorrect*).  
- **Start / Stop** — enable/disable autorun (Wayground processes the queue).  
- **Clear** — clear the queue (persistent storage).  
- **Export** — download XLSX (CSV fallback).  
- **Delay** — action delay in milliseconds (default `800`).

All actions, retries, and warnings are printed in the log area.

---

## Export Format (Quizizz-style)

Each row = 1 question.

| Column | Meaning                 | Value                                                        |
|------: |-------------------------|--------------------------------------------------------------|
| **A**  | Question Text           | From Canvas                                                  |
| **B**  | Question Type           | Always `Multiple Choice`                                     |
| **C–F**| Option 1–4              | Options **A–D**                                              |
| **G**  | Option 5                | **Blank**                                                    |
| **H**  | Correct Answer          | `1`=A, `2`=B, `3`=C, `4`=D                                   |
| **I**  | Time in seconds         | `20`                                                         |

The sheet includes two header rows matching the sample template.

---

## How It Works

- **Storage & Sync:** `GM_setValue`/`GM_getValue` + `GM_addValueChangeListener` keep a persistent queue and wake the other tab. `BroadcastChannel` provides instant cross-tab signaling.
- **DOM Automation:** robust selectors + retries for TipTap/ProseMirror editors; option editors are located by proximity to the **row’s** correct-tick button.
- **Strict Save:** finds the **real** “Lưu câu hỏi” button (by text/title/icon) and checks clickability to avoid navigation prompts.
- **Export:** uses `xlsx.full.min.js` to build a workbook; falls back to CSV. Files are delivered via Blob download; a temporary link (30s) is also printed in the panel.

---

## Requirements & Notes

- Canvas DOM with `.multiple_choice_question` items and **no** `.incorrect` class for collected items.
- Wayground MCQ editor with:
  - Question editor under `#query-editor-tiptap-wrapper`
  - Option tick buttons `data-testid="mcq-editor-mark-answer-{i}-button"`
  - TipTap editors close to those buttons
- If Wayground markup changes, update:
  - `selectQuestionEditor()`
  - `findEditorsByRows()` / `nearestEditorTo()`
  - `findSaveButtonsStrict()` (save detection)

---

## Tech Stack

- **Tampermonkey** userscript
- **BroadcastChannel** + `GM_*` storage/events
- **MutationObserver** (resume when UI changes)
- **TipTap/ProseMirror** editor automation
- **XLSX** (`xlsx.full.min.js`) + **Blob** downloads
- Vanilla **DOM**/JS (no frameworks)

---

## Troubleshooting

- **Wayground doesn’t start after Start on Canvas**  
  Ensure both tabs are open/visible at least once. Background tabs can be throttled by the browser.
- **Option D not filled**  
  The script maps editors by their **row**; if your theme nests wrappers differently, tweak `findEditorsByRows()`/`nearestEditorTo()`.
- **“Unsaved changes” dialog**  
  The script uses **strict save** detection. If your theme adds other generic buttons, update `findSaveButtonsStrict()`.
- **Export doesn’t download**  
  Allow automatic downloads for the site or click the **30-second link** shown in the panel.

---

## Contributing

PRs welcome for:
- Selector updates as Canvas/Wayground evolve  
- Smarter editor mapping  
- Extra export formats (JSON, Moodle XML, etc.)

---

## License

**MIT** — Use responsibly and follow your institution’s policies.
