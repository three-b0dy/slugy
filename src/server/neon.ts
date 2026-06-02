import { neon } from "@neondatabase/serverless";

const FALLBACK_DATABASE_URL = "postgresql://user:pass@localhost:5432/slugy";

export const primarySql = neon(
  process.env.DATABASE_URL || FALLBACK_DATABASE_URL,
);
export const replicaSql = process.env.DATABASE_REPLICA_URL
  ? neon(process.env.DATABASE_REPLICA_URL)
  : primarySql;

export const sql = replicaSql;
