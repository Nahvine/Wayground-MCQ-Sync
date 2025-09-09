Canvas → Wayground MCQ Sync (Tampermonkey Userscript)

One-click pipeline: collect Multiple-Choice questions from Canvas, de-duplicate and persist them, then auto-create MCQs in Wayground with strict field mapping, verified fills, and reliable saving. Includes XLSX export (Quizizz-style).

What this userscript does

Collect on Canvas

Grabs all Multiple Choice questions on a quiz history page.

Skips “Incorrect” questions.

Extracts Question, Options A–D, and Correct option.

De-duplicates and persists your queue across reloads.

Post to Wayground

Works on https://wayground.com/admin/quiz/*.

Clicks Add Question → MCQ, fills Question + A/B/C/D, marks correct, then saves.

Strict row mapping: each option is written to the editor that sits in the same row as the tick button mcq-editor-mark-answer-{i}-button.

Verified fills with retries per field—prevents silent misses (esp. option D).

No accidental navigation: uses strict “Save question” detection (text + icon) to avoid hitting the wrong button.

Export collected data → XLSX

Produces a Quizizz-style sheet with the columns below; falls back to CSV if the XLSX library isn’t loaded.

Auto-downloads and also prints a 30-second download link into the panel (in case the browser blocks auto-download).

Quick start

Install a userscript manager (e.g. Tampermonkey).

Add the script (shown in your repo under Canvas → Wayground MCQ Sync).

Open:

Canvas: a quiz history page (e.g. .../quizzes/.../history?version=1)

Wayground: the admin quiz edit page (https://wayground.com/admin/quiz/...)

On Canvas, use the floating panel:

Collect → gathers MCQs from the page into a persistent queue.

Start → enables autorun and “wakes” the Wayground tab via BroadcastChannel + GM events.

Optional: set a Delay (ms) if your machine or network is slower.

Switch to Wayground or let it wake automatically. The script will:

Add MCQs one by one → fill all fields → tick the correct answer → Save question → proceed.

Export at any time from either panel to get an XLSX/CSV of everything in the current queue.

UI controls (both tabs)

Collect (Canvas only): scrape MCQs from the current page (skips Incorrect).

Start / Stop: toggle autorun. When ON, the Wayground tab begins/continues processing.

Clear: clears the queue (does not clear the “seen” ledger if you implement that in your local fork).

Export: downloads an XLSX (or CSV fallback) of the current queue.

Delay: milliseconds between actions (defaults to 800).

The log panel shows every action, retries, warnings, and errors.

Export format (Quizizz-style)

Each row is one question.

Column	Meaning	Value
A	Question Text	The question from Canvas
B	Question Type	Always Multiple Choice
C–F	Option 1–4	Options A–D in order
G	Option 5	Always left blank
H	Correct Answer	1=A, 2=B, 3=C, 4=D
I	Time in seconds	Always 20

The sheet also contains the standard two header rows your example shows.

How it works (under the hood)

Tampermonkey API:
@match rules for Canvas & Wayground pages, GM_setValue/GM_getValue for a persistent queue, GM_addValueChangeListener to wake the other tab, and GM_notification (optional toast).

Cross-tab wakeup:
BroadcastChannel('wg-sync') + GM value bumping → Wayground starts pumping as soon as you press Start on Canvas.

DOM-robust filling:

Question: finds the TipTap/ProseMirror editor in the main query box.

Options A–D: maps each option to the nearest TipTap editor to its own “mark correct” button, with retries and content verification.

Save (strict): picks the real “Lưu câu hỏi” button (matching text/title/icon and clickability) to avoid accidental navigation prompts.

Export:
Uses xlsx (via CDN) to create an .xlsx. If not available, falls back to CSV.
Always creates a Blob download and prints a temporary link in the log for manual download.

Installation notes

This userscript expects:

Canvas DOM similar to the sample (questions with .multiple_choice_question, not marked .incorrect).

Wayground MCQ editor with:

Question editor under #query-editor-tiptap-wrapper

Answer rows with data-testid="mcq-editor-mark-answer-{i}-button" + nearby TipTap editors.

If Wayground UI markup changes, adjust the selectors inside:

selectQuestionEditor()

findEditorsByRows() / nearestEditorTo()

Strict save logic (findSaveButtonsStrict())

Tech stack

Tampermonkey userscript

BroadcastChannel + GM_* storage/events (cross-tab signaling)

MutationObserver (resume when UI changes)

ProseMirror/TipTap editor handling (programmatic text insert + verification)

XLSX (xlsx.full.min.js) for binary Excel export, plus Blob/URL for downloads

Vanilla DOM APIs and robust query selectors

Troubleshooting

Wayground doesn’t start after pressing Start on Canvas
Ensure both tabs are open. The script uses BroadcastChannel + GM bump to wake the Wayground tab; some browsers throttle background tabs—try focusing it once.

Option D left blank
The script maps by row using each option’s tick button and then verifies content with retries. If your theme injects extra nested wrappers, update findEditorsByRows() to the closest editor container.

“Are you sure you want to leave?” dialog
The script uses strict save detection to click the correct Save question button. If your Wayground variant adds extra generic buttons with the same data-testid, adjust findSaveButtonsStrict().

No download pops up after Export
Check “automatic downloads” permissions for the domain. Use the 30-second link printed inside the panel to download manually.

Security & privacy

All data is handled locally in your browser via Tampermonkey.

No external servers receive your quiz data; the only remote dependency is the XLSX CDN (for export).

You can fork the script and self-host the XLSX bundle if needed.

Contributing

PRs welcome for:

New selectors as Wayground/Canvas evolve

Better heuristics for mapping editors

Additional export formats (e.g., JSON, Moodle XML)

License

MIT. Use at your own risk and always respect your institution’s policies.

Hero image: put the provided screenshot at assets/hero.png in your repo (or update the path in the Markdown).
