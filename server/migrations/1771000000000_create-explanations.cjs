/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.createTable('explanations', {
    id: 'id',
    spanish_text: { type: 'varchar(70)', notNull: true },
    english_text: { type: 'varchar(70)', notNull: true },
    content_markdown: { type: 'text', notNull: true },
    model: { type: 'varchar(50)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('explanations', 'explanations_pair_unique', {
    unique: ['spanish_text', 'english_text'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('explanations');
};
