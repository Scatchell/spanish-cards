/* eslint-disable camelcase */

// Cached verdicts are only valid for the prompt that produced them. Keying on
// prompt_version lets a prompt change retire stale rows without deleting them.
exports.up = (pgm) => {
  pgm.addColumn('answer_checks', {
    prompt_version: { type: 'integer', notNull: true, default: 1 },
  });
  pgm.dropConstraint('answer_checks', 'answer_checks_key_unique');
  pgm.addConstraint('answer_checks', 'answer_checks_key_unique', {
    unique: ['spanish_text', 'english_text', 'direction', 'submitted_normalized', 'prompt_version'],
  });
};

exports.down = (pgm) => {
  pgm.sql('DELETE FROM answer_checks WHERE prompt_version <> 1');
  pgm.dropConstraint('answer_checks', 'answer_checks_key_unique');
  pgm.addConstraint('answer_checks', 'answer_checks_key_unique', {
    unique: ['spanish_text', 'english_text', 'direction', 'submitted_normalized'],
  });
  pgm.dropColumn('answer_checks', 'prompt_version');
};
