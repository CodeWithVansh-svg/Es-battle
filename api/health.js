import { sql } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    await sql`SELECT 1`;

    return res.status(200).json({
      ok: true,
      database: "connected"
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return res.status(500).json({
      ok: false,
      database: "error",
      error: error.message
    });
  }
}
