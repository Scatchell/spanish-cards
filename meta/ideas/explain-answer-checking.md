# Explain-Driven Answer Checking

## Summary

Extend the existing on-demand "Explain" feature so that, after a user's typed answer is marked `incorrect` by the deterministic answer checker, the user can request an additional LLM-backed check via a new "Explain more" action. This check evaluates the user's actual submitted answer: it explains specifically what about the submitted answer is wrong, and separately judges whether the submitted answer is in fact a valid (equal or better) translation despite not matching the stored answer. If it's valid, the user is offered a one-click path to replace the card's stored answer with the better wording, reusing the existing inline-edit mechanism. This closes a real gap in the current checker, which only tolerates cosmetic (accent/case/punctuation/word-order) variation and has no way to recognize a genuinely different but valid translation.

## Problem

The app's answer checker (`checkAnswer`) is a deterministic, normalized string/word matcher. It correctly forgives cosmetic differences (accents, case, punctuation, spacing) but has no way to recognize that a different wording can still be a correct translation — e.g. a valid synonym, an alternate but equally natural phrasing, or a more idiomatic rendering than the card's own stored answer. Today, a user in this situation has two unsatisfying options: manually override their self-rating upward (trusting their own judgment with no assistance) or treat a correct answer as wrong and drill an answer they already know a valid alternate for. There is also no feedback loop for the reverse case — telling the user specifically *what* about their answer was actually wrong (a conjugation error, a gender agreement slip, a wrong preposition, etc.) beyond "the words didn't match."

The existing Explain feature (see `explain-translations.md`) already gives the user a cached, on-demand grammar explanation of *why the card's own answer is correct*, but it has no awareness of what the user actually typed, so it cannot address either of these needs.

## Goals

- When the checker marks an answer `incorrect`, give the user a way to learn specifically what was wrong with what they typed (not just that it didn't match).
- Give the user a way to find out, with reasonable confidence, whether their differently-worded answer was actually a valid or even better translation.
- When their answer is judged valid or better, let the user permanently adopt that wording as the card's answer with minimal friction, reusing the existing card-edit mechanism rather than building a new one.
- Keep this fully user-triggered and clearly separated from the existing (already-shipped, already-cached) "why is the stored answer correct" explanation, so users who don't need this pay no extra latency or cost.
- Preserve the current self-rating flow untouched: this feature informs the user's own judgment, it does not compute or override a rating.

## Non-Goals

- Do not change the deterministic answer-checking logic (`checkAnswer`) itself. It continues to run first, unchanged, exactly as today.
- Do not change FSRS scheduling or the rating (Again/Hard/Good/Easy) flow. The user still self-rates; this feature only gives them better information going into that choice.
- Do not automatically fix the "correct rate" stat, retroactively or otherwise. This idea does not touch stats logic at all. (Separately noted: the current "correct rate" stat is based on the checker's verdict, not the user's final rating choice, which the user considers a pre-existing quirk to fix later — see Future Considerations.)
- Do not introduce a "multiple accepted answers per card" data model. Adopting a better answer overwrites the single stored answer, same as the existing edit feature — the original wording is not retained.
- Do not run this check automatically/silently on every Explain open, on `correct` verdicts, or on `correctWithDifferences` verdicts (those are cosmetic-only by construction and have nothing meaningful for this feature to add).
- Do not change the existing follow-up Q&A ("ask another question") behavior — it continues to work as-is, and should still have access to whatever explanation/answer-check content is already loaded in the modal at the time a follow-up question is asked.
- Do not build this for language pairs other than the currently-supported `en<->es` — same gating as the existing Explain feature.
- Do not add a confirmation dialog or new destructive-action UI for adopting a better answer — pre-filling the existing inline edit field (which already requires an explicit Enter/blur to save) is judged sufficient friction.

## Users and Stakeholders

- The primary user is the single authenticated app user studying Spanish/English flashcards (same as the base Explain feature).
- The user benefits from more trustworthy self-assessment (fewer false "you got it wrong" moments) and from targeted grammar feedback tied to their actual mistake, not just the card's canonical explanation.
- The app owner/operator benefits from cards that self-improve toward more natural/better wording over time, and from LLM cost that is spent only when a user explicitly asks for it twice (once implicitly for the cached base explanation, once explicitly for this deeper check).

## Core Workflow

1. The user types an answer during training and submits it. The deterministic checker runs as today and produces a verdict (`correct`, `correctWithDifferences`, or `incorrect`).
2. If the verdict is `incorrect` and the card supports explanations (`en<->es`), the existing Explain button is available. Opening it behaves exactly as today: the cached (or freshly generated) base explanation of why the card's stored answer is correct loads and displays immediately if cached, or after one LLM call if not.
3. When the verdict is `incorrect`, the modal additionally offers an "Explain more" action (button, and reachable via the same keyboard shortcut used to open Explain, pressed again while the modal is open).
4. Clicking "Explain more" checks for a cached result keyed on the card and the user's (normalized) submitted answer.
   - If cached, it displays immediately with no LLM call.
   - If not cached, it triggers a single combined LLM call that takes the card's canonical answer and the user's submitted answer as input, and returns: (a) an explanation of what's specifically wrong with the submitted answer (conjugation, agreement, word choice, usage, etc. — if there is a clear error to describe), and (b) a strict verdict on whether the submitted answer is a viable alternative or an outright better translation than the stored one.
   - While loading, the rest of the modal (base explanation, follow-up Q&A) remains fully usable.
5. If the combined check determines the submitted answer is valid or better, the modal surfaces this clearly (distinct from the "what's wrong" framing) and offers a way to adopt it: the action pre-fills the suggested wording into the existing inline answer-edit field on the card (the same `EditableSentence` control used by the existing edit feature) and puts it into edit mode, so the user reviews and explicitly confirms the save (Enter/blur) exactly as with a manual edit today.
6. If the LLM determines the submitted answer is genuinely wrong, the modal shows the specific-error explanation from step 4 without an adoption option.
7. The user then proceeds to self-rate as normal; this feature has not touched scoring.

## Functional Requirements

- Add an "Explain more" trigger, visible only when: the card supports explanations, and the current review's checker verdict was `incorrect`.
- The trigger must send the user's actual submitted answer text (not previously plumbed to the backend for the base explanation) along with the card id.
- The combined "what's wrong" + "alt-answer verdict" result must be produced by a single LLM call per request.
- The combined result must be cached, keyed by card id and normalized submitted answer text, distinct from the existing base-explanation cache (which is keyed by the Spanish/English text pair and doesn't vary per user attempt).
- On repeat requests with the same card + same normalized submitted answer (e.g., modal closed and reopened, or the same wrong answer recurring on a later review of the same card), the cached result must be shown with no new LLM call.
- The base explanation (existing feature) and the new answer-check result must load and cache independently: if only the base explanation is cached, show it immediately and still offer "Explain more" as a distinct, separately-loading action.
- The LLM must be instructed to be strict when judging whether the submitted answer is valid/better — favoring the more natural/native phrasing — not lenient or eager to validate the user.
- When the submitted answer is judged valid or better, provide a UI action that pre-fills the suggested replacement text into the existing answer-edit control, without saving until the user confirms.
- When the submitted answer is judged wrong, present the specific error explanation without an adoption action.
- The existing follow-up Q&A input must continue to function unchanged, and should have access to whatever explanation/answer-check content is already loaded in the modal as context for follow-up questions.
- If the LLM/API is unavailable when "Explain more" is requested (missing config, timeout, network failure), the base explanation must still display normally, and the "Explain more" section must show an inline error state with the ability to retry, without disrupting the rest of the modal.

## Business Rules

- "Explain more" is only offered when the checker verdict for the current submission is `incorrect`. It is not offered for `correct` or `correctWithDifferences` verdicts.
- Adopting a suggested answer overwrites the card's single stored answer for that direction, exactly like the existing manual edit feature (no history, no FSRS impact, no alternates list).
- The base explanation cache and the answer-check cache are separate stores with separate keys and separate lifecycles.
- This feature does not alter the self-rating options, the FSRS scheduling call, or any "correct rate"/progress statistics.
- Gated to the `en<->es` language pair, consistent with the existing Explain feature's gating.

## Edge Cases and Failure Scenarios

- User requests "Explain more" but the LLM call fails or times out: show an inline error with retry; base explanation remains visible and functional.
- User requests "Explain more," the verdict comes back that their answer is invalid, then they edit their answer manually via the normal edit flow anyway: no special handling needed, this is identical to the existing edit feature's behavior today.
- User requests "Explain more" for an answer that is a mix of correct and incorrect parts (e.g., right verb, wrong preposition): the LLM should describe the specific issue(s); this does not need special-case UI beyond the freeform explanation.
- The user closes the modal mid-request: the in-flight request can be safely abandoned or allowed to complete and populate the cache for next time; no user-visible error should result either way.
- The user reopens Explain on a later review of the same card and types the exact same wrong answer again: the cached answer-check result from the earlier attempt is shown immediately (acknowledged as a rare but real scenario, and also covers the more common case of closing/reopening the modal within the same review).
- The card's answer is edited (via this feature or manually) between the time an answer-check was cached and a later viewing: no invalidation is required, consistent with how the existing base-explanation cache also does not invalidate on card edits.
- The submitted answer is empty or a near-empty/junk string: the LLM call should still run pragmatically (explain that no meaningful answer was given); no special client-side gating beyond the existing `incorrect` verdict requirement.

## Success Criteria

### User or Business Success

- Users who type valid alternate translations get told so, with a low-friction path to improve the card rather than being stuck rating themselves against a mismatch every time.
- Users who make a genuine mistake get a specific, targeted explanation of that mistake rather than only the generic "why is the stored answer correct" explanation.
- The feature is opt-in enough (explicit "Explain more" click) that users who don't need it never pay the extra latency or LLM cost.

### Product Acceptance

- "Explain more" appears only when the current submission's verdict is `incorrect` and the card supports explanations.
- Clicking "Explain more" with no cache triggers exactly one combined LLM call and displays both the error explanation and the alt-answer verdict together.
- Clicking "Explain more" with an existing cache entry (same card + same normalized submitted answer) shows the cached result with no LLM call.
- When the verdict is "valid or better," an adopt action pre-fills the existing inline edit control with the suggested wording, requiring explicit user confirmation to save.
- When the verdict is "wrong," no adopt action is shown.
- If the LLM/API is unavailable, the base explanation still renders normally and "Explain more" shows a recoverable inline error.
- Follow-up Q&A continues to work and can reference already-loaded explanation/answer-check content.
- No changes occur to FSRS scheduling, self-rating options, or the "correct rate" stat as a result of this feature.

## High-Level Technical Guidance

- The submitted answer needs to be plumbed from the training UI to the explanation request — today's explanation request only carries the card id.
- The new answer-check cache should be a distinct store from the existing `explanations` table, keyed on card id + normalized submitted answer (reusing the existing normalization logic from the answer checker is a reasonable direction, to avoid caching near-duplicate variants separately).
- The combined LLM call is a natural second endpoint alongside the existing explanation/follow-up endpoints, following the same synchronous-request, cache-first pattern already established (no job queue needed, consistent with current architecture).
- The "adopt suggested answer" action should route through the existing card-edit code path (the same one used by the manual edit feature) rather than introducing a second way to change a card's stored text.
- Prompting should explicitly instruct the model to be strict/conservative about validating the user's answer, and to identify specific grammatical or usage errors when the answer is wrong, mirroring the tone/rigor of the existing base-explanation prompt.
- Keyboard shortcut handling should be extended so the shortcut that opens Explain, when pressed again while already open (and eligible), triggers "Explain more" — consistent with the feature's keyboard-friendly design goal.

## Risks and Trade-Offs

- The LLM's "strict" judgment on alternate-answer validity is itself imperfect; a wrong "valid" verdict could let a genuinely bad translation get adopted as the new canonical answer. Mitigated by requiring explicit user confirmation via the edit field rather than one-click overwrite.
- Overwriting the single stored answer (no alternates model) means the original wording is lost if adopted over. Accepted as a v1 trade-off per explicit product decision.
- Caching by exact normalized submitted-answer text has low hit rates in the common case (users rarely retype the identical wrong answer) — its main value is protecting against duplicate calls within a single close/reopen of the modal, not long-term reuse. Accepted as still worthwhile for that narrower case.
- Two user-facing LLM-backed actions in one modal (Explain, Explain more) adds a small amount of UI/latency complexity versus the current single-explanation modal.

## Assumptions

- The base Explain feature (`explain-translations.md`) is fully shipped and its caching/LLM-boundary patterns (OpenAI `responses.create`, cache-first, synchronous request, `en<->es` gating) can be extended rather than replaced.
- The app remains single-user, so LLM cost/rate-limiting concerns are secondary to correctness and UX, consistent with the base feature's assumptions.
- The existing inline edit control (`EditableSentence`) can be driven programmatically (pre-filled value, forced into edit mode) without modification to its core save/cancel behavior.

## Future Considerations

- Separately fix the "correct rate" stat so it reflects the user's final self-rating (i.e., only counts as incorrect if the user selects "Again"/don't-remember) rather than the checker's verdict before any override. This was raised during scoping of this idea as a pre-existing inconsistency, not something this idea should fix as a side effect.
- Consider a real "multiple accepted answers per card" data model if overwrite-only adoption proves too lossy in practice.
- Consider surfacing the specific-error explanation as inline diff-style annotation on the user's submitted text (extending the existing word/char-level diff highlighting) rather than freeform prose, if freeform prose proves less scannable in practice.
- Consider extending this behavior to `correctWithDifferences` verdicts if it turns out the checker's cosmetic-tolerance occasionally masks real grammar issues (e.g., an accent-normalized false match that changes a word's meaning).
