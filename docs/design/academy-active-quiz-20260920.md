# Academy active quiz — desktop and tablet

Scope: presentation of the shared QuizEngine, question/options, answer feedback,
Bilge companion, standard result and exam result. Applies at 768px and above.
The existing mobile DOM order, styles and chibi character are retained.

## Design

- Theme-aware, subject-accented header with progress, timer, lives and session XP.
- Opaque, readable question and answer cards; no decorative art behind question text.
- One existing companion instance, using the device's female/male Bilge preference.
- Focused, cheerful and supportive expressions follow the existing answer state.
- Topic strength remains after options in DOM order and occupies the right column visually.
- Exam mode remains single-column without a companion; the same timer is retained.
- Answer feedback stays before the question so the next-question action remains accessible.
- Answer feedback keeps a two-line summary in flow and opens the full question,
  selected answer, correct answer and solution in an optional accessible dialog;
  on mobile the same dialog becomes a bottom sheet.
- Feedback, option-state and learning-action emoji marks were replaced with the
  existing icon system while keeping text labels for accessible names.
- Result presentation uses the selected Bilge; canonical score/reward/save handling is unchanged.

No API, database, institutional assessment, quiz scoring or assistance-policy changes.
No production deployment, Git commit or push in this task.

## Verification

- 9 test files / 125 tests passed, including quiz engine layout, coaching policy,
  question, options, feedback, results, quiz game, session saver and auto-pause.
- TypeScript --noEmit, targeted ESLint and git diff --check passed.
- Isolated Klipper preview at localhost:3137, synthetic authenticated account:
  completed a 10-question practice tour; result showed 1/10, 50 verified XP,
  successful save message and zero coins due to the test account's daily cap.
- Classic started with 3 lives and a decreasing 30-second question timer.
- Exam started with 40 questions and a 45-minute timer; answered correctly and
  advanced to the next question. Full 40-question completion was not repeated.
- 1483px desktop and 820px tablet: no horizontal overflow; right-panel gap 20px.
- 390px mobile: no horizontal overflow; legacy compact companion retained,
  academy portrait not mounted.
- Light/dark appearance and female/male images observed. Dark theme was applied
  only in the automation browser for visual checking, not saved to a live profile.

Screenshots are under docs/design/previews/active-*.png. Test content is synthetic;
these checks are not production or institutional field-test evidence.
