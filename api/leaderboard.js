import { getSql } from "../lib/db.js";
import { json, handleOptions } from "../lib/auth.js";

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, {
      error: "Method not allowed",
    });
  }

  try {
    const sql = getSql();

    const rows = await sql`
      SELECT
        username,
        email,
        win_coins,
        matches_played,
        matches_won
      FROM users
      WHERE role = 'user'
        AND is_banned = false
      ORDER BY
        win_coins DESC,
        matches_won DESC,
        matches_played ASC
      LIMIT 100
    `;

    return json(res, 200, {
      leaderboard: rows.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        email: user.email,
        winCoins: Number(user.win_coins) || 0,
        matchesPlayed:
          Number(user.matches_played) || 0,
        matchesWon:
          Number(user.matches_won) || 0,
      })),
    });
  } catch (error) {
    console.error(error);

    return json(res, error.status || 500, {
      error:
        error.message || "Failed to load leaderboard.",
    });
  }
}
