/* eslint-disable camelcase */

// Append-only analytical log of every training attempt. Deliberately
// independent: NO foreign key to cards/reviews, every analysis field
// snapshotted onto the row. Write-only from the app's perspective in this
// phase; a future analysis feature is the only intended reader. Safe to prune
// by attempted_at later with no cross-table cleanup.
exports.up = (pgm) => {
  pgm.createTable('review_history', {
    id: 'id',
    // Informational/debugging reference only — intentionally NOT a foreign key,
    // so deleting a card never touches history (and vice versa).
    card_id: { type: 'integer', notNull: true },
    // Prompt direction trained: 'spanish-to-english' | 'english-to-spanish'.
    direction: { type: 'varchar(20)', notNull: true },
    // Three-state verdict: 'correct' | 'correctWithDifferences' | 'incorrect'.
    verdict: { type: 'varchar(25)', notNull: true },
    // FSRS rating chosen: 'again' | 'hard' | 'good' | 'easy'.
    rating: { type: 'varchar(5)', notNull: true },
    // The expected answer phrase, snapshotted at attempt time (card text is
    // capped at varchar(70), so this can never overflow).
    correct_text: { type: 'varchar(70)', notNull: true },
    // The raw text the user submitted (may be empty if they didn't remember).
    submitted_text: { type: 'varchar(255)', notNull: true },
    attempted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Supports future time-based analysis and timestamp pruning.
  pgm.createIndex('review_history', 'attempted_at');
};

exports.down = (pgm) => {
  pgm.dropTable('review_history');
};
