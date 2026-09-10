/* eslint-disable camelcase */

// One row per categorized review_history attempt. Real FK (unlike
// review_history's deliberate non-FK relationship to cards) because
// review_history is append-only and never edited/deleted after insert, so
// there's no risk of a dangling reference. ON DELETE CASCADE guards against
// orphaned categorization rows if a future feature ever deletes history rows
// (nothing does today). UNIQUE(review_history_id) doubles as the anti-join
// key the categorization job uses to find unprocessed rows.
exports.up = (pgm) => {
  pgm.createTable('review_categorizations', {
    id: 'id',
    review_history_id: {
      type: 'integer',
      notNull: true,
      references: 'review_history',
      onDelete: 'CASCADE',
    },
    // One of a fixed set of 9 slugs, enforced at the app layer (see
    // server/src/categorization/repository.ts), not a DB check constraint.
    category: { type: 'varchar(40)', notNull: true },
    // One-sentence explanation from the LLM for why this category was picked.
    rationale: { type: 'text', notNull: true },
    model: { type: 'varchar(50)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('review_categorizations', 'review_categorizations_review_history_id_unique', {
    unique: ['review_history_id'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('review_categorizations');
};
