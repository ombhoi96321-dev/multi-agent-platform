import { Pool } from "pg";

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is missing. Add it to .env.local in the project root."
      );
    }
    pool = new Pool({
      connectionString,
      // Most managed Postgres providers (Neon, Supabase, Render, RDS)
      // require SSL but use a self-signed chain, so verification is
      // relaxed rather than off. Set DATABASE_SSL=false for a local
      // Postgres instance that doesn't use SSL at all.
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params) {
  const db = getPool();
  return db.query(text, params);
}
