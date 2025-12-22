import pg from 'pg';

const { Pool } = pg;

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function buildConnectionString() {
  const direct = env('DATABASE_URL', '');
  if (direct) return direct;

  const host = env('PGHOST', '');
  const port = env('PGPORT', '5432');
  const user = env('PGUSER', '');
  const password = env('PGPASSWORD', '');
  const database = env('PGDATABASE', '');

  if (!host || !user || !database) return '';

  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  return `postgresql://${auth}@${host}:${port}/${encodeURIComponent(database)}`;
}

const connectionString = buildConnectionString();

export const pool = new Pool(
  connectionString
    ? { connectionString }
    : undefined
);

export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    throw e;
  } finally {
    client.release();
  }
}
