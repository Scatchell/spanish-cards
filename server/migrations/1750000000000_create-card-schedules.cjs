/* eslint-disable camelcase */

// FSRS scheduling state, 1:1 with cards. A card without a row here is "new"
// and treated as immediately due (falling back to cards.created_at).
exports.up = (pgm) => {
  pgm.createTable('card_schedules', {
    card_id: {
      type: 'integer',
      primaryKey: true,
      references: 'cards',
      onDelete: 'CASCADE',
    },
    due: { type: 'timestamptz', notNull: true },
    stability: { type: 'double precision', notNull: true },
    difficulty: { type: 'double precision', notNull: true },
    elapsed_days: { type: 'double precision', notNull: true },
    scheduled_days: { type: 'double precision', notNull: true },
    learning_steps: { type: 'integer', notNull: true },
    reps: { type: 'integer', notNull: true },
    lapses: { type: 'integer', notNull: true },
    state: { type: 'smallint', notNull: true },
    last_review: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('card_schedules', 'due');
};

exports.down = (pgm) => {
  pgm.dropTable('card_schedules');
};
