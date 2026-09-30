/* eslint-disable camelcase */
// Introduces accounts. Every pre-existing card and review_history row is
// assigned to the owner account in the same transaction; no other column
// value or row changes. Child tables (card_schedules, reviews,
// card_alternate_answers, review_categorizations, practice_targets,
// practice_sessions) are scoped through their existing links to these two
// roots. explanations/answer_checks stay global, anonymous caches.
const OWNER_EMAIL = 'scatchell@gmail.com';

exports.up = (pgm) => {
  pgm.createTable('users', {
    id: 'id',
    email: { type: 'varchar(254)', notNull: true, unique: true },
    // Null until the user sets a password through a one-time link.
    password_hash: { type: 'text' },
    // Bumped to invalidate every session cookie the user holds.
    session_version: { type: 'integer', notNull: true, default: 0 },
    // SHA-256 hex of the one-time set-password token; the raw token is never stored.
    set_password_token_hash: { type: 'text' },
    set_password_expires_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('users', 'users_email_normalized', { check: 'email = lower(btrim(email))' });
  pgm.createIndex('users', 'set_password_token_hash', { unique: true, where: 'set_password_token_hash IS NOT NULL' });
  pgm.sql(`INSERT INTO users (email) VALUES ('${OWNER_EMAIL}')`);

  for (const table of ['cards', 'review_history']) {
    pgm.addColumn(table, { user_id: { type: 'integer' } });
    pgm.sql(`UPDATE ${table} SET user_id = (SELECT id FROM users WHERE email = '${OWNER_EMAIL}')`);
    // Fails the whole transaction if any row were missed.
    pgm.alterColumn(table, 'user_id', { notNull: true });
    pgm.addConstraint(table, `${table}_user_id_fkey`, {
      foreignKeys: { columns: 'user_id', references: 'users(id)', onDelete: 'RESTRICT' },
    });
  }
  pgm.createIndex('cards', 'user_id');
  pgm.createIndex('review_history', ['user_id', 'attempted_at']);
};

exports.down = (pgm) => {
  // Rolling back with several users would silently merge everyone's data
  // into one single-user deck.
  pgm.sql(`DO $$ BEGIN
    IF (SELECT count(*) FROM users) > 1 THEN
      RAISE EXCEPTION 'Refusing to roll back: more than one user exists';
    END IF;
  END $$`);
  pgm.dropColumn('review_history', 'user_id');
  pgm.dropColumn('cards', 'user_id');
  pgm.dropTable('users');
};
