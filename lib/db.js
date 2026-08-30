import { neon } from "@neondatabase/serverless";

let sqlClient;

export function getSql() {
  if (sqlClient) {
    return sqlClient;
  }

  const connectionString =
    process.env.DATABASE_URL;

  if (!connectionString) {
    const error = new Error(
      "DATABASE_URL is not configured."
    );

    error.status = 500;
    throw error;
  }

  sqlClient = neon(connectionString);

  return sqlClient;
}

export function genId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}
