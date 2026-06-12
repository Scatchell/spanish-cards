# Explain Translations

## Summary

Add an on-demand explanation feature that helps the user understand why a Spanish word or phrase maps to its stored English translation. The feature should appear during review and training only after the answer is available, generate a concise grammar-aware explanation when needed, and reuse saved explanations to avoid repeated model calls. The first version should stay focused on fast study support rather than becoming a chat tutor or full grammar reference.

## Problem

The app currently helps the user practice Spanish-to-English and English-to-Spanish recall, but it does not explain why a translation works. When a phrase contains unfamiliar grammar, idioms, reflexive usage, body-part article conventions, tense choices, or word grouping, the user may need to leave the app to look up an explanation. That interruption slows study and makes it harder to connect the memorized answer to the underlying Spanish structure.

## Goals

- Help the user quickly understand the reasoning behind a Spanish phrase's stored English translation.
- Reduce the need to leave the app for fast grammar or phrase-structure lookups during study.
- Present explanations only after the user has answered or revealed the card, so the feature does not leak the answer prematurely.
- Keep explanations concise, readable, and useful for memorization rather than exhaustive language instruction.
- Avoid unnecessary LLM cost by saving generated explanations and reusing them later.
- Keep the model interaction isolated enough that it can be replaced, disabled, or mocked without affecting the rest of the product.

## Non-Goals

- Do not add explanations to card creation or card editing screens.
- Do not add chat follow-ups, conversational tutoring, or multi-turn Q&A.
- Do not add pronunciation help, audio, conjugation tables, full grammar lessons, or broad language-learning content beyond what is needed to understand the specific translation.
- Do not add user-editable explanations in the first version.
- Do not add regeneration or prompt-version refresh controls in the first version.
- Do not add model-selection UI, manual prompt controls, daily limits, or user-facing cost controls in the first version.
- Do not pre-generate explanations in the background.
- Do not require support for language pairs beyond English and Spanish in the first version.

## Users and Stakeholders

- The primary user is the authenticated app user studying Spanish/English flashcards.
- The user benefits by getting quick, contextual explanations without interrupting review or training.
- The app owner/operator benefits from cached explanations and test-safe model boundaries that reduce cost and operational risk.
- Future maintainers benefit from a clear language-pair marker that can later gate, disable, or adapt explanation behavior for other card types.

## Core Workflow

During review or training, the user answers a card as usual. Once the answer is revealed in review or checked in training, the app shows an explain option next to the Spanish word or phrase, regardless of whether the current prompt direction was Spanish-to-English or English-to-Spanish. The user can click the explain option to open a readable, dismissible explanation surface.

If an explanation already exists for the card's Spanish phrase and English translation, the app displays it from storage. If no saved explanation exists, the app shows a loading indicator, requests a new explanation, saves the result, and then displays it. If the request fails, the explanation area should show: "Sorry! Something went wrong with this explanation."

The preferred first-version UX is a modal-style explanation surface over the current review or training screen. It should preserve the user's place in the study flow, provide enough space for moderate-detail bullet points, work on desktop and mobile, and be easy to dismiss without permanently expanding the card layout.

## Functional Requirements

- Show the explain option during review after the answer is shown.
- Show the explain option during training after the answer is checked.
- Place the explain option next to the Spanish word or phrase, even when the card is currently prompting from English to Spanish.
- Hide the explain option before the answer is available, so it cannot reveal the answer early.
- Only make the explain option available for cards tagged as `en<->es`.
- Ensure existing cards and newly created cards receive the `en<->es` card-type tag for the current product scope.
- Generate explanations only when the user explicitly clicks the explain option and no saved explanation is available.
- Save generated explanations so later clicks can load the saved explanation without another model call.
- Prefer reusing one saved explanation for identical Spanish/English pairs across multiple cards if that can be done without significant product or technical complexity.
- If shared reuse would add meaningful complexity, saving explanations per card is an acceptable first-version trade-off.
- Treat generated explanations as read-only content.
- Use the card's stored English translation as the translation being explained.
- Ask the model to explain the Spanish components in relation to the provided English translation, rather than asking it to produce a separate full translation.
- Format explanations as moderate-detail, scannable content similar to the provided example, with meaningful phrase chunks and brief grammar notes only where useful.
- Support both full phrases and single vocabulary words with the same general explanation behavior.
- Show a loading state while an explanation request is in progress.
- Show the agreed failure message if the explanation cannot be generated or loaded.
- Ensure automated tests can exercise the feature without making real LLM calls.

## Business Rules

- Only authenticated users may request or view generated explanations through the app.
- The explanation feature is gated by the card-type tag, not by assumptions about the current card dataset.
- For the current app, all existing and future cards should be treated as English/Spanish cards and tagged `en<->es`.
- Explanations should be based on the Spanish phrase and the card's stored English translation.
- The model should not be asked to replace or reinterpret the card's answer as the primary translation.
- If a card's translation is imperfect, the first version does not need a special correction workflow; any model note about mismatch can be treated as part of the explanation quality risk.
- Cards are currently deleted rather than edited, so automatic explanation invalidation after card edits is not required for the first version.
- Saved explanations may be preserved indefinitely for now.
- Regenerating stale, incorrect, or lower-quality explanations is intentionally deferred.
- No explanation should be generated before the user clicks the explain option.

## Edge Cases and Failure Scenarios

- A model request fails, times out, or returns unusable content; the user should see the agreed friendly failure message in the explanation surface.
- The Spanish phrase and stored English translation may not perfectly match; the first version should not block the feature on detecting or resolving this.
- A single vocabulary word may not need a phrase breakdown; the explanation should still be useful and concise.
- A long phrase may produce a larger explanation; the UI should keep the content readable and dismissible without disrupting the study session.
- The user may click the explain option more than once; the app should avoid duplicate unnecessary generation when a saved explanation exists or a request is already in progress.
- The model integration may be unavailable because configuration is missing or invalid; the user-facing behavior should fail gracefully rather than exposing internal details.
- Tests and e2e runs must not call a real LLM, even when exercising explanation workflows.
- Future non-English/Spanish cards should not automatically receive this explanation behavior unless their card type is explicitly supported.

## Success Criteria

### User or Business Success

- The user can get a helpful explanation during review or training without leaving the app.
- The explanation helps clarify why the Spanish phrase maps to the memorized English translation.
- The feature does not reveal the answer before the user has answered or revealed the card.
- Repeated explanation views usually load from saved content instead of making another model request.
- The study flow remains focused and easy to resume after dismissing the explanation.

### Product Acceptance

- In review, the explain option appears only after the answer is shown.
- In training, the explain option appears only after the answer is checked.
- In both directions, the explain option is associated with the Spanish word or phrase.
- Cards without a supported language-pair tag do not show the explain option.
- Current cards and newly created cards are classified as `en<->es`.
- Clicking explain shows a loading state when generation is needed.
- A saved explanation is reused on later clicks.
- A failed explanation request displays: "Sorry! Something went wrong with this explanation."
- Generated content is read-only.
- Automated tests can validate the behavior without performing real model calls.

## High-Level Technical Guidance

- The LLM interaction should be treated as a replaceable boundary rather than embedded directly into review or training UI logic.
- The model prompt should include both the Spanish word or phrase and the card's stored English translation, and should ask for a concise component-by-component explanation of why the Spanish supports that translation.
- The model should be instructed not to produce an unrelated alternate translation as the main output.
- The saved explanation layer should support loading a previous explanation before making a model request.
- The implementation planner should evaluate whether explanation reuse across identical Spanish/English pairs is simple enough to include; otherwise per-card persistence is acceptable.
- Configuration should allow the model provider credentials to remain outside source code.
- Tests should use a mock or test double for the model boundary so no real LLM cost or external dependency is introduced during automated runs.
- The language-pair tag should be represented as product state that can gate explainability now and allow future expansion or disabling later.

## Risks and Trade-Offs

- Model explanations can be wrong, overconfident, or phrased in a way that conflicts with the stored card translation.
- Using the stored English translation reduces mismatch risk but may cause the model to rationalize an imperfect card answer.
- Moderate-detail explanations are more useful than terse definitions but can take up significant space in the study UI.
- A modal-style surface is easy to read and dismiss, but it temporarily interrupts the card flow more than an inline expansion would.
- Shared caching across identical phrase pairs may reduce cost but should not be allowed to complicate the first version unnecessarily.
- Deferring regeneration means low-quality saved explanations may persist until a later improvement adds refresh behavior.
- Tagging all current cards as `en<->es` is intentionally simple, but future language-pair support will require more deliberate card classification.

## Assumptions

- The app remains a single-user authenticated study app for the first version of this feature.
- All current cards are English/Spanish cards.
- Cards are not editable in the current product, so saved explanations do not need edit-based invalidation.
- The first version can rely on on-demand generation only.
- The explanation should be optimized for quick study support, not comprehensive grammar education.
- The exact model can change later as long as the product behavior remains the same.
- The user is comfortable with occasional model imperfections as long as the feature is useful and failures are handled gracefully.

## Future Considerations

- Add a regenerate option for stale, incorrect, or improved-prompt explanations.
- Add prompt or explanation versioning so older cached explanations can be refreshed intentionally.
- Add support for additional language-pair tags beyond `en<->es`.
- Add an admin or maintenance workflow for reviewing, deleting, or replacing saved explanations.
- Consider inline explanation previews if the modal experience feels too disruptive during study.
- Consider richer grammar aids only if the user later wants the feature to expand beyond quick translation explanations.
