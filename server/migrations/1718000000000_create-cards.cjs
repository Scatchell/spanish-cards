/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('cards', {
    id: 'id',
    spanish_text: { type: 'varchar(70)', notNull: true },
    english_text: { type: 'varchar(70)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('cards', 'cards_spanish_text_not_blank', {
    check: "btrim(spanish_text) <> ''",
  });
  pgm.addConstraint('cards', 'cards_english_text_not_blank', {
    check: "btrim(english_text) <> ''",
  });
};

exports.down = (pgm) => {
  pgm.dropTable('cards');
};
