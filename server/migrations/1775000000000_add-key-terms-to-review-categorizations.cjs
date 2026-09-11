/* eslint-disable camelcase */

// The specific word(s) at the core of the diagnosed mistake — both the
// incorrect form the learner used and its correct replacement, where
// applicable (see server/src/prompts/categorize.md). Needed by the planned
// practice-sentence feature to find which words/forms recur across a
// learner's mistakes. Defaults to '{}' so the 8 rows categorized before this
// column existed remain valid without a backfill.
exports.up = (pgm) => {
  pgm.addColumn('review_categorizations', {
    key_terms: { type: 'text[]', notNull: true, default: '{}' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('review_categorizations', 'key_terms');
};
