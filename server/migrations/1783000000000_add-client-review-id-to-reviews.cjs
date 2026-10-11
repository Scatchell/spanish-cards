/* eslint-disable camelcase */

// Idempotency key for offline-queued reviews. The client generates a UUID per
// rating; a retry after a lost response re-sends the same id and the unique
// index turns the repeat into a no-op instead of a second FSRS advance.
// Nullable so legacy rows (and any future non-client writer) stay valid;
// the partial index ignores NULLs.
exports.up = (pgm) => {
  pgm.addColumn('reviews', { client_review_id: { type: 'uuid' } });
  pgm.createIndex('reviews', ['card_id', 'client_review_id'], {
    name: 'reviews_card_client_review_id_key',
    unique: true,
    where: 'client_review_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('reviews', ['card_id', 'client_review_id'], {
    name: 'reviews_card_client_review_id_key',
  });
  pgm.dropColumn('reviews', 'client_review_id');
};
