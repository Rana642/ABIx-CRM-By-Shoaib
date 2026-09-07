import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __ayaCrmPool: Pool | undefined;
}

export const pool =
  global.__ayaCrmPool ??
  new Pool({
    host: process.env.PGHOST || 'postgres',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'aya_os',
    max: 5,
  });

if (process.env.NODE_ENV !== 'production') {
  global.__ayaCrmPool = pool;
}
