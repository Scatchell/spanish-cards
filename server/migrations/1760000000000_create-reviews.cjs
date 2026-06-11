/* eslint-disable camelcase */

// Review history: one row per answered card, powering the progress dashboard
// (reviews per day, correct rates, streaks). Rows cascade-delete with their
// card — acceptable for the single-user MVP per epic 03.
exports.up = (pgm) => {
  pgm.createTable('reviews', {
    id: 'id',
    card_id: {
      type: 'integer',
      notNull: true,
      references: 'cards',
      onDelete: 'CASCADE',
    },
    // Prompt direction the user trained: 'spanish-to-english' | 'english-to-spanish'.
    direction: { type: 'varchar(20)', notNull: true },
    // Whether answer matching judged the typed answer correct, before any
    // manual rating override.
    detected_correct: { type: 'boolean', notNull: true },
    // Final FSRS rating chosen: 'again' | 'hard' | 'good' | 'easy'.
    rating: { type: 'varchar(5)', notNull: true },
    // True when the card was due at review time; false for extra practice
    // ahead of schedule.
    was_due: { type: 'boolean', notNull: true },
    reviewed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('reviews', 'reviewed_at');
  pgm.createIndex('reviews', 'card_id');
};

exports.down = (pgm) => {
  pgm.dropTable('reviews');
};
