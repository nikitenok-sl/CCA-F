# CCAR-F Trainer

An unofficial trainer for Claude Certified Architect – Foundations. One site, five question sets, switched at the top of the page. Each set has a practice mode with explanations, a timed mock exam, and a study sheet.

| Set | Questions | What's inside |
|---|---|---|
| Guide | 73 | 12 official examples from the Exam Guide v1.0 and questions on its task statements |
| Cheat sheet | 60 | Based on a community cheat sheet, checked against the guide and documentation |
| Hard topics | 57 | Neighboring traps: context, diagrams, criteria, Claude Code configuration |
| Hard topics 2 | 46 | Second round: diagrams, coordinator, applying criteria |
| Final | 20 | A 10–15 minute cheat sheet and a short quiz for the morning of the exam |

Questions are in English, as on the exam. Explanations are in Russian. Progress for each set is stored separately in the browser.

## Where progress is stored and how to reset it

Only in the `localStorage` of the browser of the person taking the test. Nothing is sent to a server or to GitHub, and other team members cannot see anyone else's answers. Keys: `ccarf.v1`, `ccarf.sheet.v1`, `ccarf.focus.v1`, `ccarf.focus2.v1`, `ccarf.final.v1` (one per set) and `ccarf.site.set` (the last opened set).

- One set: the "Study sheet" tab → "Reset progress".
- All sets: the "Reset progress in all sets" button at the bottom of any page.
- Shared computer: open the site in a private window; nothing is left behind after you close it.

## Structure

```
index.html            the only page of the site
assets/app.js         engine: practice, exam, study sheet, switching between sets
assets/app.css        shared styles
sets/index.json       list and order of the sets
sets/<set>/           source of truth
  set.json            texts, filter, exam parameters, palette
  notes.html          the "Study sheet" tab
  questions/*.json    questions
data/*.js             the same content packed for the page (generated, do not edit by hand)
dist/ccar-f-offline.html   standalone file with everything inside (generated)
tools/check.js        checks all sets
tools/pack.js         sets/ → data/
tools/bundle.js       sets/ → dist/ccar-f-offline.html
```

Link to a set and tab: `#focus/exam`, `#final/notes`.

## Editing

- Question: `sets/<set>/questions/*.json`.
- Texts, colors, exam settings of a set: `sets/<set>/set.json`.
- Study sheet: `sets/<set>/notes.html`.
- Logic and layout for all sets: `assets/`.
- New set: a folder in `sets/` and its name in `sets/index.json`. The set needs its own `storageKey`.

After any change in `sets/`, run `node tools/pack.js`. It checks every question (fields, options, answers, explanations of wrong options), stops on errors, and otherwise updates `data/`. Commit `sets/` and `data/` together. To verify that `data/` is up to date, run `node tools/pack.js --check`.

## Open locally and send to a colleague

- `index.html` opens with a double-click; no server is needed. The page loads data via `<script>`, not `fetch`.
- `node tools/bundle.js` builds `dist/ccar-f-offline.html` (about 0.8 MB) with the styles, the engine and all sets inside. You can send it via Slack or email. Only Google Fonts come from outside; without them the page uses fallback fonts.
- When the files are opened from disk, progress follows the browser's rules: in Chrome it is shared across all local files, in Firefox each file has its own. For progress that persists reliably, GitHub Pages is the better choice.

## Publishing to GitHub Pages

1. Create a repository and put the contents of this folder in its root: `index.html`, `assets/`, `data/`, `sets/`, `tools/`, `README.md`, `.nojekyll`. The `dist/` folder is not needed on the site.
2. Settings → Pages → Build and deployment → Source: Deploy from a branch, branch `master`, folder `/ (root)`.
3. After about a minute the site is available at `https://<user>.github.io/<repo>/`.

GitHub Pages for a private repository is available only on paid GitHub plans. On the free plan, the repository and the site are public.

---

Not affiliated with Anthropic. These are not real exam questions. Official guide: [Exam Guide v1.0 (PDF)](https://everpath-course-content.s3-accelerate.amazonaws.com/instructor%2F6nizmqk8tpzpfjvt6qmmav7rh%2Fpublic%2F1783542750%2FClaude+Certified+Architect+%E2%80%93+Foundations+Exam+Guide.pdf).
