/* eslint-disable camelcase */

// Replaces the flat `key_terms` array with a `practice_targets` table: one
// row per expected/submitted pair behind a categorized mistake, needed by
// the planned practice-sentence feature to look up "other mistakes with this
// same expected term" via an indexed exact-match query (awkward to express
// against a text[] column). No `type` column — the parent row's `category`
// already classifies the mistake.
//
// Existing review_categorizations rows can't be reshaped into the new
// format, so they're truncated here; this is a single-user app and the data
// is fully regeneratable by the categorization job re-processing
// review_history on its next tick. Accepted data loss, not a bug.
exports.up = (pgm) => {
  pgm.sql('TRUNCATE review_categorizations RESTART IDENTITY CASCADE');

  pgm.dropColumn('review_categorizations', 'key_terms');

  pgm.createTable('practice_targets', {
    id: 'id',
    review_categorization_id: {
      type: 'integer',
      notNull: true,
      references: 'review_categorizations',
      onDelete: 'CASCADE',
    },
    // The correct word/form for this locus of the mistake.
    expected: { type: 'text', notNull: true },
    // What the learner actually submitted, if there's a specific wrong form
    // to point at — null for omissions (nothing was submitted for this
    // locus) rather than an empty string.
    submitted: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('practice_targets', 'expected');
};

exports.down = (pgm) => {
  pgm.dropTable('practice_targets');
  pgm.addColumn('review_categorizations', {
    key_terms: { type: 'text[]', notNull: true, default: '{}' },
  });
};
