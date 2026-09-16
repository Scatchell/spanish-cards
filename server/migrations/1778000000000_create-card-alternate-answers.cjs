/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('card_alternate_answers', {
    id: 'id',
    card_id: {
      type: 'integer',
      notNull: true,
      references: 'cards',
      onDelete: 'CASCADE',
    },
    field: { type: 'varchar(10)', notNull: true },
    text: { type: 'varchar(70)', notNull: true },
    position: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('card_alternate_answers', 'card_alternate_answers_field_check', {
    check: "field IN ('spanish', 'english')",
  });
  pgm.addConstraint('card_alternate_answers', 'card_alternate_answers_text_not_blank', {
    check: "btrim(text) <> ''",
  });
  pgm.createIndex('card_alternate_answers', ['card_id', 'field', 'position']);
};

exports.down = (pgm) => {
  pgm.dropTable('card_alternate_answers');
};
