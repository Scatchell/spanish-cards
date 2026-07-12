/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('answer_checks', {
    id: 'id',
    spanish_text: { type: 'varchar(70)', notNull: true },
    english_text: { type: 'varchar(70)', notNull: true },
    // Which language was the prompt: 'spanish-to-english' | 'english-to-spanish'.
    direction: { type: 'varchar(20)', notNull: true },
    // Normalized (lowercased, de-accented, punctuation-stripped) submitted answer.
    submitted_normalized: { type: 'text', notNull: true },
    verdict: { type: 'varchar(10)', notNull: true }, // 'valid' | 'invalid'
    suggested_answer: { type: 'varchar(70)' }, // null unless verdict = 'valid'
    critique_markdown: { type: 'text', notNull: true },
    model: { type: 'varchar(50)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('answer_checks', 'answer_checks_key_unique', {
    unique: ['spanish_text', 'english_text', 'direction', 'submitted_normalized'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('answer_checks');
};
