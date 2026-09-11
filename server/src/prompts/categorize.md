You are classifying a Spanish-learner's mistake on one flashcard review attempt
into exactly one category. You are given, for each numbered item: the
direction trained, the verdict the learner received, the expected ("correct")
phrase, and the phrase the learner actually submitted.

Categories (pick exactly one per item):

1. `vocabulary` — Learner knows the general structure but chooses the wrong
   word or confuses similar words. E.g. expected "conocer a María", submitted
   "saber a María".
2. `verb_form` — Correct verb/concept, but wrong person, tense, mood, or verb
   form. E.g. expected "viajaré", submitted "viajo"; expected "tuvimos",
   submitted "tenimos".
3. `agreement` — Gender or singular/plural disagreement between nouns,
   articles, adjectives, etc. E.g. "la casa blanco" instead of "la casa
   blanca".
4. `grammar_words` — Problems with articles, prepositions, pronouns,
   auxiliaries, reflexives, ser/estar, por/para, etc. E.g. "soy cansado"
   instead of "estoy cansado"; "para dos horas" instead of "por dos horas".
5. `word_order` — The right pieces are mostly present but arranged using an
   incorrect structure: pronoun placement, negation, adjective position,
   question structure.
6. `missing_extra_meaning` — Important information is omitted, added, or
   mistranslated, changing or corrupting the intended meaning. E.g. "I never
   go there" translated as "Voy allí" (missing "never").
7. `spelling_accents` — The intended word/form is evident, but spelling,
   diacritics, or written form is wrong. E.g. "tambien" for "también";
   "hablo" for "habló".
8. `idiom` — Grammatically plausible Spanish that is too literal, uses the
   wrong collocation, or isn't how Spanish normally expresses the idea. E.g.
   "soy 20 años" instead of "tengo 20 años".
9. `recall_failure` — There isn't enough correct material to diagnose a
   specific grammar mistake: a blank response, a completely unrelated
   response, or a response with no usable partial answer.

Rules:
- Treat likely typos/keystroke slips as `spelling_accents`, never as the
  underlying grammar/vocabulary category they superficially resemble — unless
  the misspelling also reflects a distinct grammar error (e.g. a genuinely
  wrong verb form that happens to also be misspelled), in which case
  categorize by the grammar error instead.
- If a mistake could plausibly fit two categories, pick the single category
  that best explains the root cause of the error, not every category that
  technically applies.
- Use `recall_failure` only when there isn't enough submitted material to
  diagnose anything more specific — not merely because the answer is very
  wrong.
- For each item, write one short, concrete sentence for `rationale` naming the
  specific words or forms involved, e.g. "Confused the present tense of ir
  for the future tense of viajar."
- For `keyTerms`, list only the specific Spanish word(s) that are the actual
  locus of the diagnosed mistake, not every word in the phrase. Where the
  learner used a wrong word/form, include both it and its correct
  replacement, e.g. expected "cerrada" submitted "cerrado" gives
  `["cerrado", "cerrada"]` — the learner may need to practice telling both
  forms apart. Leave `keyTerms` empty when there is no specific word to
  reference (e.g. a blank or wholly unrelated `recall_failure`).
- Return exactly one result per input item, using the same `index` value
  given for that item.
