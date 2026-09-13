/* eslint-disable camelcase */

// One row per mistake (review_categorizations row), holding the last
// generated set of practice sentences plus a snapshot of the historical
// examples that produced them. UNIQUE on review_categorization_id makes
// "generate" always an upsert: regenerating overwrites in place, there is no
// history of past generations. JSONB (not child tables) because nothing ever
// needs an indexed/exact-match query into individual examples or sentences —
// they're always read and written as one whole blob per mistake.
exports.up = (pgm) => {
  pgm.createTable('practice_sessions', {
    id: 'id',
    review_categorization_id: {
      type: 'integer',
      notNull: true,
      unique: true,
      references: 'review_categorizations',
      onDelete: 'CASCADE',
    },
    model: { type: 'text', notNull: true },
    generated_at: { type: 'timestamptz', notNull: true },
    examples_snapshot: { type: 'jsonb', notNull: true },
    sentences: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('practice_sessions');
};
