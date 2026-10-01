/* eslint-disable camelcase */
// Moves both LLM caches onto one hand-bumped PROMPT_VERSION string
// (server/src/prompt-version.ts). Cache keys no longer include the version,
// so each key holds exactly one row: a lookup that finds a row stamped with
// an older version or a different model regenerates it and overwrites it in
// place, so superseded output isn't kept.
//
// answer_checks rows from before integer version 4 are already unreachable
// (the app only asks for 4) and would collide with the narrowed unique key,
// so they're deleted — accepted, they're dead cache. Everything else is
// backfilled to '1.0.0', the initial PROMPT_VERSION, i.e. treated as current
// so the deploy doesn't trigger a burst of OpenAI calls.
exports.up = (pgm) => {
  pgm.sql('DELETE FROM answer_checks WHERE prompt_version <> 4');
  pgm.dropConstraint('answer_checks', 'answer_checks_key_unique');
  pgm.dropColumn('answer_checks', 'prompt_version');
  pgm.addColumn('answer_checks', {
    prompt_version: { type: 'varchar(20)', notNull: true, default: '1.0.0' },
  });
  // The default only exists for the backfill; the app must always stamp it.
  pgm.alterColumn('answer_checks', 'prompt_version', { default: null });
  pgm.addConstraint('answer_checks', 'answer_checks_key_unique', {
    unique: ['spanish_text', 'english_text', 'direction', 'submitted_normalized'],
  });

  pgm.addColumn('explanations', {
    prompt_version: { type: 'varchar(20)', notNull: true, default: '1.0.0' },
  });
  pgm.alterColumn('explanations', 'prompt_version', { default: null });
};

exports.down = (pgm) => {
  pgm.dropColumn('explanations', 'prompt_version');

  pgm.dropConstraint('answer_checks', 'answer_checks_key_unique');
  pgm.dropColumn('answer_checks', 'prompt_version');
  // Restore the integer column as 1779 left it (default 1), marking surviving
  // rows as 4 — the only version the pre-semver app serves. Deleted older
  // rows are not recoverable (they were unreachable cache).
  pgm.addColumn('answer_checks', {
    prompt_version: { type: 'integer', notNull: true, default: 4 },
  });
  pgm.alterColumn('answer_checks', 'prompt_version', { default: 1 });
  pgm.addConstraint('answer_checks', 'answer_checks_key_unique', {
    unique: ['spanish_text', 'english_text', 'direction', 'submitted_normalized', 'prompt_version'],
  });
};
