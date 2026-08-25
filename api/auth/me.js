import { getSql } from "../../lib/db.js";
import {
  requireUser,
  json,
  handleOptions,
} from "../../lib/auth.js";

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, {
      error: "Method not allowed",
    });
  }

  try {
    const session = await requireUser(req);
    const sql = getSql();

    const rows = await sql`
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
      WHERE email = ${session.email}
      LIMIT 1
    `;

    const user = rows[0];

    if (!user) {
      return json(res, 404, {
        error: "User not found.",
      });
    }

    if (user.is_banned) {
      return json(res, 403, {
        error: "Account suspended.",
      });
    }

    return json(res, 200, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone || "",
        ff_uid: user.ff_uid || "",
        coins: Number(user.coins) || 0,
        win_coins: Number(user.win_coins) || 0,
        role: user.role,
        matches_played: Number(user.matches_played) || 0,
        matches_won: Number(user.matches_won) || 0,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || "Failed.",
    });
  }
}
