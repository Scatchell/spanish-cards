import pg from 'pg';

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}

export type DbPool = pg.Pool;

// Anything that can run a query: the pool itself, or a checked-out client
// inside a transaction. Repository functions accept this so they work in
// both contexts.
export type DbQueryable = Pick<pg.Pool, 'query'>;

export async function withTransaction<T>(
  pool: DbPool,
  fn: (tx: DbQueryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
