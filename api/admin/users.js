import { getSql } from "../../lib/db.js";
import { requireAdmin, json, handleOptions } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, {
      error: "Method not allowed",
    });
  }

  try {
    await requireAdmin(req);

    const sql = getSql();

    const users = await sql`
      SELECT
        id,
        username,
        email,
        phone,
        ff_uid,
        coins,
        win_coins,
        role,
        is_banned,
        matches_played,
        matches_won,
        created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 500
    `;

    return json(res, 200, {
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        phone: u.phone || "",
        ff_uid: u.ff_uid || "",
        coins: Number(u.coins) || 0,
        win_coins: Number(u.win_coins) || 0,
        role: u.role,
        is_banned: !!u.is_banned,
        matches_played: Number(u.matches_played) || 0,
        matches_won: Number(u.matches_won) || 0,
        created_at: u.created_at,
      })),
    });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || "Failed.",
    });
  }
}
