/* eslint-disable camelcase */

// Structured answer-check output: bullets and the learner's reading are stored
// as fields instead of one markdown blob. critique_markdown stays (populated
// from the bullets) so this migration is non-destructive.
exports.up = (pgm) => {
  pgm.addColumns('answer_checks', {
    feedback_points: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    submitted_reading: { type: 'jsonb' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('answer_checks', ['feedback_points', 'submitted_reading']);
};
