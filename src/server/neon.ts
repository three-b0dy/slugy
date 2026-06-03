import postgres from "postgres";

const FALLBACK_DATABASE_URL = "postgresql://user:pass@localhost:5432/slugy";

export const primarySql = postgres(
  process.env.DATABASE_URL || FALLBACK_DATABASE_URL,
);
export const replicaSql = process.env.DATABASE_REPLICA_URL
  ? postgres(process.env.DATABASE_REPLICA_URL)
  : primarySql;

export const sql = replicaSql;
