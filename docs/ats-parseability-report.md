# ATS parseability investigation

Inspected three existing generated PDFs and their corresponding generated `.tex` files on 2026-09-24. No resume/template or generation files were changed.

## Severity summary

- **Breaks parsing:** No broad content-loss or reading-order failure was observed. One special-character loss was found: `\rupee` in the source is omitted from extracted text in the PhonePe and Razorpay output (the amount remains).
- **Cosmetic/minor:** No multi-column interleaving, icon-font content, or unreadable ligatures were observed. Layout tables and abbreviated hyperlink labels are present; they are parseable but lose some semantic/URL detail.
- **Informational:** The Glean job description includes several literal skills/terms not present in that generated resume’s extracted text.

## Step 1 — Generated PDF extraction

### Method and samples

The requested `pdftotext` executable is not installed in this environment. I used MuPDF’s `mutool draw -F txt` for extracted reading-order text and `-F stext` to inspect positioned text/line structure for the same three pre-existing PDFs. Therefore these are equivalent extractor checks, not literal `pdftotext` plain versus `-layout` runs.

- PhonePe — `resumes/phonepe/software-engineer-react-native--1000000000001903/Shashikanth_Resume.pdf`
- Razorpay — `resumes/razorpay/senior-software-development-engineer--4694070005-0/Shashikanth_Resume.pdf`
- Glean — `resumes/glean/software-engineer-frontend--4006733005-0/Shashikanth_Resume.pdf`

Each extracted document contains the name/contact line and the Skills, Experience, Projects, and Education sections. The experience/project bullets, employer names, roles, education providers/degrees, and dates were present. The output is one page per PDF. No section or complete bullet was found missing in the extracted text.

Example extracted heading and contact line:

```text
Shashikanth
Senior Frontend Engineer — React, TypeScript, AI Systems
Bangalore, KA, India | +91 8660259406 | shashikanth15299@gmail.com | Github | Linkedin
```

The reading order is coherent and top-to-bottom: contact, Skills, Experience (employer then location/role/date, then bullets), Projects, Education. No alternating-column interleaving appeared. The three PDFs use a single-column page; their subheading tables place left and right fields on a row, and extraction preserved a usable sequence (for example `Livspace`, `Bangalore, India`, `SDE 2`, `Nov. 2024 – March 2026`).

Bullets extract as readable `•`; en/em dashes extract as Unicode punctuation, and no `fi`/`fl` ligature corruption or icon-font gibberish was seen. Contact fields are separated by visible `|` delimiters and extract as clean plain text. The email and phone are actual displayed values. GitHub and LinkedIn appear as the readable labels `Github` and `Linkedin`; their URL targets are not included in extracted text.

**Character-loss issue:** the generated PhonePe and Razorpay `.tex` contain `\rupee 250+ Cr annual product revenue`, while PDF text extraction shows `250+ Cr annual product revenue` with no rupee sign. The surrounding sentence remains readable, so this is localized symbol loss rather than a dropped bullet/section. It may affect the currency meaning and should be treated as the only observed extraction defect.

## Step 2 — Template structure audit

Both `assets/base_resume.tex` and `assets/resume_template.tex` have the same relevant structural conventions.

| Pattern | Finding |
| --- | --- |
| Multi-column layout | No `multicols` or side-by-side `minipage` layout found. The page is single-column. |
| Icons / symbol fonts | No Font Awesome or icon glyphs appear next to headings/contact details. `latexsym` and `marvosym` packages are loaded, but no visible icon commands are used in the inspected templates. |
| Tables | `tabular*` is used in resume subheading/project-heading macros to align organization/title on the left and location/date on the right. It is visual layout, not tabular data. Extraction samples remain in a readable order, though table-derived fields are a modest risk with simplistic parsers. |
| Fonts | No custom font package or external font configuration is set. The sampled PDFs report embedded/subset Type 1 Computer Modern fonts (e.g. `CMBX12`, `CMR10`, `CMTI10`, `CMSY10`), not missing or unknown font references. |
| Contact hyperlinks | Email and phone are plain visible text. GitHub/LinkedIn use `\href{target}{visible label}`; the labels are extractable, but the full profile URLs exist only as link targets and do not show in extracted text. |
| Bullets | `itemize` supplies the primary bullet; `\labelitemii` is explicitly set to a tiny math `\bullet`. It extracted as `•` in all samples, with no garbling. |
| Section names | `Skills`, `Experience`, `Projects`, and `Education` are plain, parser-friendly headings. “Experience” is a common equivalent of “Work Experience.” The generated heading also includes a short descriptive tagline under the name, not a replacement for a section heading. |
| Date consistency | All inspected roles use abbreviated month + year and an en dash range (e.g. `Nov. 2024 – March 2026`, `Dec. 2020 – Nov. 2024`). Education uses year-only dates consistently. No mixed numeric/month-year style was found. |

**Minor caveat:** only the three saved PDFs were directly checked for the output behavior. The source-level structure is consistent across both templates, but table ordering can vary between ATS parsers even though MuPDF’s extraction stayed coherent here.

## Step 3 — Literal keyword coverage: Glean

Compared the generated Glean resume PDF’s extracted text with the stored description for job `262` (`Glean — Software Engineer, Frontend`). This is an exact-text coverage check, not a judgment about semantic equivalence. The job description asks for or names the following terms that do not appear literally in the extracted resume:

- `React.js` (resume has `React` and `React (Vite)`, but not the literal `React.js` spelling)
- `Progressive Web Apps` / `PWA`
- `Web Extensions` (resume says `Chrome Extension`)
- `Electron`
- `Capacitor`
- `60FPS`
- `zero-latency`
- `consumer grade` (resume has `B2B SaaS`, not this phrase)
- `BA/BS in computer science` (no computer-science degree is listed; the resume lists Electronics & Communication)

The description also mentions mentoring junior engineers; the extracted resume does not contain `mentor`/`mentoring`. The resume already includes several overlapping requested technologies—React, TypeScript, HTML5, CSS3, JavaScript, Redux, and Webpack—so these are not counted as gaps. No certification requirement was present in this job description.

These are informational gaps only. A literal omission does not establish that the candidate has the skill or credential, and this report makes no recommendation to add unverified qualifications.
