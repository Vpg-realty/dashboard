# Training

Current state of training: the new-hire training program and Team Quizzes (the Comp Challenge). Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- Training program: `src/training/` (`MyTraining.jsx`, `TrainingBoard.jsx`, `ProgramBuilder.jsx`, `api.js`), `edge/training.js`, `edge/training.sql`, `functions/api/training/index.js` and `doc.js`
- Team Quizzes: `src/quiz/` (`QuizView.jsx`, `PastQuizzes.jsx`, `score.js`), `edge/compQuiz.js`, `functions/api/comp-quiz/index.js`
- Sections in `src/shell/sections.js`: `training` (My Training), `team` tab `training` (Scorecards › Training), `settings` tab `training` (Training Program), `quiz` (Team Quizzes)

# Part 1 — The training program

A standard program every new hire works through (from "Valley Property Group Training Program"). Role **`trainee`** in D1 `users`.

## Pages

- **My Training** (`/training`, section `training`, `solo`, roles `trainee` / `trainee-early`): the path, "Do this now", every step, and "A question for <pod lead>" → an Alerts task for the pod lead.
- **Scorecards › Training** (`/team/training`, view `mgr-training`, owners + managers): owners see every trainee, a pod lead their own. Waiting on a Trainer, the trainees table with best score by topic, and the trainee file (`?trainee=<email>`): where they need help, the checklist with Mark sent / Mark signed / Log session / Check off / Graduate, daily logs, trainer notes, Remove (owners). No add form — owners get "+ Add a person" → Settings › Team.
- **Settings › Training Program** (`/settings/training`, `ProgramBuilder.jsx`, owners): edit the program (see below), upload step documents, and run a Practice Run.

## The program (data)

- D1 settings `training_program` — never in the repo (it holds the test answers): `{passBar, steps: [{id, phase, kind, title, detail, who, topic?, video?, questions?, messages?, graduate?, doc?}]}`. Checked by `checkProgram` (pass bar 50–100%).
- Phases `PHASES` (edge/training.js): `paper` Paperwork, `onboard` Onboarding, `shadow` Week 1 · Shadow, `guided` Week 2 · Guided Reps, `full` Week 3 · Full Go.
- Kinds:
  - `paper` — DocuSign 1099 / W-9; only sent / signed is kept (the W-9 stays in DocuSign). May carry a document (below).
  - `video` — YouTube + a test.
  - `test`.
  - `session` — live; rating 1–5 + note.
  - `log` — daily takeaways; Week 2 also messages sent (`messages` = the minimum; self-reported).
  - `signoff` — `graduate: true` on the last one: the trainee's role becomes `team`.
- `who: 'owners'` = Jack or Luke only (Week 2 one-on-ones); otherwise the trainee's pod lead or an owner (Luke: "either can"). `isTrainer` (edge/training.js) = an owner, or a manager whose `rep_id` is the trainee's `trainer`.
- Steps keep their ids, so progress stays attached when the program is edited. Questions reorder with ▲ / ▼ in a step's editor (saved with the program's Save). Drafted Oct 19 by Claude (31 steps, 67 questions, answers shuffled) for Luke to review; video links are his to add.

## Rules

- **Order**: steps run strictly in order (`statusOf` — the first not done).
- A video's test unlocks when the YouTube IFrame API reports the end (a "didn't unlock?" link after 2 minutes).
- Tests graded on the server (`grade`); a trainee never receives answers (`forTrainee`). Pass at `passBar` (80%), unlimited retakes (Luke: "they keep going until they pass"). A fail shows which questions and their video time; a pass also the right answers. Every attempt kept (`training_attempts`).
- Trainees see their own scores, never trainer notes or session ratings (stripped server-side).
- The step waiting on a trainer is an Alerts task for the pod lead (`alertOps`, ext_id `train:<email>:<step>`), closed when it's done.

## Paperwork to review, then DocuSign (Luke, Nov 16)

- A paper step can carry a document: Settings › Training Program › Edit step › Upload a document → `POST /api/training/doc` (owners) → R2 `training/<id>`; the step keeps `doc` {id, name, size, type} once the program is saved (`checkProgram` keeps it).
- My Training shows Open / Download and **I've reviewed it — send it to me to sign** (action `review`: `training_progress.status` 'reviewed' + `reviewed_at`).
- `alertOps` then gives whoever checks the step off an Alerts task "Send <name> the <step> by DocuSign" (ext_id `train:<email>:<step>:send:<holder>` — each owner for "Jack or Luke only", else the pod lead). **Mark sent** closes it and the usual check-off task follows; Mark signed as before.
- Before the review no task goes out; a step with no document works as before. The trainee file shows "Waiting for them to review" / "Reviewed <date> · send by DocuSign".
- `GET /api/training/doc?step=` streams the document (trainees, owners, pod leads).
- Sending through DocuSign itself is not built (needs their DocuSign API access).

## Practice Run (Luke, Nov 17)

- Settings › Training Program › **🧪 Practice Run** (`?practice=1` on that page, `MyTraining practice`): an owner takes the saved program as a trainee would (videos, tests, paperwork review, logs) and plays the trainer for the rest (orange "Practice · you play the trainer" box: Mark sent / Mark signed, Log the session, Check it off, Graduate).
- Progress kept under `practice~<owner email>` in `training_progress` / `training_attempts` / `training_logs` (`loadPractice`, `practicePerson`, `practiceKey`, `practiceReset`; POST `{practice: true}` → `practicePost`). No `training_people` row, so it never shows on Scorecards › Training; no Alerts; graduating changes no role. ↺ Start Over clears it. Owners only, never while viewing as.

## Who sees what (trainees)

- `navRole` (sections.js): a trainee is `trainee-early` (My Training only) until onboarding is signed off, then `trainee`: My Training, Home, Pipeline, Get Zips, plus Toolkit and Team Quizzes (their section roles include `trainee`). The Settings › Access grid has a Trainee column (docs/settings.md).
- Their pod lead is their trainer and shadow rep (`training_people.trainer`). Without a `rep_id` of their own the browser shows the pod lead's numbers and deals on Home / Pipeline ("Shadowing Anthony", `shadowing` in dashApi `loadMe`; `ownRep`).
- The server lets `trainee` read the board data, deals as a rep (`isRepView`), territory and zips.

## Adding, graduating, removing

- People are added in **Settings › Team** only (Luke: "avoid adding 2 areas where we add people"; see docs/settings.md). In the Team panel an Acquisitions person's status Active / **Training** / Inactive — Training = enrolled, the panel's Pod Lead is the trainer. Stored as role `trainee` (the UI shows Acquisitions · Training). `functions/api/settings/users.js` upserts `training_people (email, trainer, start_date, …)` and opens the pod lead's first alert.
- Moving someone off Training (confirm: "This counts as graduating them") sets `training_people.graduated_at` / `graduated_by`. Removing a trainee removes their training records.

### A trainee's own sub-account (Phase 6, Oct 20)
- A trainee can have their own rep (`users.rep_id`) while training. Until they graduate that rep is off the TV board, the scorecard, team targets and every rep list:
  - `scripts/load-private-files.mjs` writes `.cache/trainee-reps.json` (D1 users with role trainee and a rep_id, best effort); `vite.config.js` bakes `__TRAINEE_REPS__` → config.js `REPS` leaves them out (`ALL_REPS` keeps them — People, Sub-Accounts); liveStore drops their pairs (live and history); build-snapshot copies the list to data.json `trainees`, which the weekly freeze and /api/my-scorecard leave out.
  - They keep shadowing their pod lead in the browser (`ownRep` in dashApi).
  - Graduating (role → `team`) puts them on the board with the next deploy (~15 min).

## Data and API

- Tables (edge/training.sql): `training_people` (email, trainer, start_date, graduated_at / by, created_*), `training_progress` (email, step, status incl. 'reviewed', `reviewed_at`, rating, note …), `training_attempts`, `training_logs`, `training_notes`.
- `GET /api/training` — trainee view (program without answers) or trainer / owner view.
- `POST /api/training`:
  - trainee: `submit` (test answers), `log`, `ask` (question → alert), `review` (paperwork read)
  - trainers: `check` (done, status, rating, note), `note`, `start`
  - owners: `remove`, `program`
  - `{practice: true}` → practice handling
- `GET/POST /api/training/doc`.
- Not yet: Week 2 messages are self-reported; DocuSign is manual.

# Part 2 — Team Quizzes (the Comp Challenge)

Sidebar **Team Quizzes** (section `quiz`, header Learn & Grow; renamed from Comp Challenge, Luke Nov 8: "fun but not too pressure focused"). Roles owner / manager / team / trainee — **the TC neither takes nor sees them** (section roles; the API refuses role tc). Tabs: Today's Quiz (`/quiz/take`), **Past Quizzes** (`/quiz/past`), Host (`/quiz/host`, owners; in Access `LOCKED`). The pages say "Correct answer" (not "Answer key").

## The quiz (data)

- D1 settings `comp_quiz` — never in the repo (holds the right answers): `{id, title, intro, status, timeLimit, warmup: [{id, q, options, answer, why}], guide: [...], challenge: [...], properties: [{id, addr, key: {arv, repairs, buy, comps}}]}`. `timeLimit` in seconds, default 240 (4 minutes).
- Answers: D1 `quiz_answers (quiz, email, name, part, data, started_at, saved_at)` (made by `ensure` in edge/compQuiz.js); part `warmup` / `guide` / `challenge` / `p:<id>` / `done`. Multiple-choice parts `MC_PARTS` = warmup, guide, challenge.
- First quiz loaded Nov 5 by Claude as a draft (5 warm-up, 4 properties, 10 comping-rule questions from Luke's comping sheet).

## Flow

- draft (nobody sees questions) → **Start for Everyone** (Host) → live:
  - Part 1 Warm-Up (multiple choice)
  - Part 2 each property with a clock from **Start the Clock** (the server keeps the start; saves after the limit + 15 s are refused; answers save as typed, last save counts): ARV, repair cost, our buy price, comps optional
  - Part 3 Comping Rules (`guide`)
  - Part 4 **The Challenge** (`challenge`, left out when empty)
  - done
- **Close Answers** locks it; **Reveal Results** shows everyone the right answers with the why, Luke's numbers and the leaderboard. No right answer reaches a browser before the reveal (owners' Host tab aside).
- **Locked in stays locked**: the server ignores saves to a part already submitted (`mc` / `prop`); Lock It In cancels the pending auto-save and can be pressed again after an error; `useQuiz` applies replies in request order.

## Scoring (`src/quiz/score.js`, `scoreAll`)

- 1 point per right multiple-choice answer (Challenge scored the same, `chal`).
- Per property up to 3 points each for ARV / repairs / buy price: within 5% = 3, 10% = 2, 20% = 1 (repairs also by $2.5K / $5K / $10K).
- Ties go to less time on the properties.
- **Bonus**: a Challenge question whose text starts with "BONUS" (`isBonusQ`) is shown in its own column; display only.

## Host (`/quiz/host`, owners)

- Answer key per property (any time before the reveal), live progress per person, leaderboard, each property's answers, question-by-question results, Step Back a Stage, Reset Everything (type RESET).
- **Present**: full-screen slides (← / →) — one per property, the leaderboard, Scores by Person, then Results by Section.
- **Questions & Setup editor** (`SetupEditor` in QuizView.jsx, open by default; Close folds it, ✎ Edit Questions reopens): title, intro, minutes per property, each warm-up / comping-rules / challenge question (wording, 2–6 choices, the right one, why; add, remove, reorder, **Move to** another part — ids stay unique across parts) and the property addresses. One Save (POST action `setup`, `cleanSetup`): draft only — once started it's locked until stepped back to Not started; a property keeps its answer key by id; blank choices dropped, the right answer follows its text.
- **Scores by Person** (`ByPerson`): one row per person in leaderboard order — Warm-Up, each property, Properties, Comping Rules, Challenge, Bonus; top score per column in gold. Display only.
- **Results by Section** (`SectionResults`, `SECTIONS`): Warm-Up, Comping Rules, The Challenge, Bonus — Team line (right / wrong / % right), By Person (Most Right gold / Most Wrong rose), By Question (Easiest / Hardest). Display only.
- **📚 Save & Start a New Quiz** (action `archive`): saves the quiz to settings `quiz_past:<id>`, then starts an empty draft with a new id; answers stay under the old id.
- **🧪 Practice Run** → `/quiz/take?practice=1`: an owner takes the quiz as it stands (draft included, clocks and all) under `<quiz id>~practice` rows (`practiceId`, `loadPractice`; `{practice: true}` on POSTs). Never in real results, the host page or Reset. Finishing shows the reveal; ↺ Start Over (action `practiceReset`) clears it.

## Past Quizzes (`/quiz/past`, `PastQuizzes.jsx`)

- Every revealed quiz (the current one and each archived one): per question the answer given, the **Correct answer** (Luke: "dont say my name") and why; per property the numbers given vs the correct ones and points; own score, no rank.
- Whose answers (`past` in edge/compQuiz.js, `GET /api/comp-quiz?past=1&quiz=&who=`): owners anyone, managers their own + their pod (`podMates`), reps / trainees their own.

## API

- `GET /api/comp-quiz` (quiz state, own answers; host data for owners), `?past=1&quiz=&who=`.
- `POST /api/comp-quiz` — taking: `mc`, `open`, `prop`, `finish`, `practiceReset`; hosting (owners): `status`, `key`, `reset`, `setup`, `archive` (logged `quiz.<action>` in edit_log).
- Usage: the page polls every 4–10 s (one settings row + the person's ≤ 7 rows), the host every 5 s (all rows) — under 100k rows for an hour's quiz.
