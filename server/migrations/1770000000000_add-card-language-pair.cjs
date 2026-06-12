/* eslint-disable camelcase */

exports.up = (pgm) => {
  pgm.addColumn('cards', {
    language_pair: { type: 'varchar(20)', notNull: true, default: 'en<->es' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('cards', 'language_pair');
};
