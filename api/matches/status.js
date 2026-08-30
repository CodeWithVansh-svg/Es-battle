import { getSql } from "../../lib/db.js";
import {
  getBearerToken,
  verifyToken,
  json,
  handleOptions,
} from "../../lib/auth.js";

const ALLOWED = new Set(["lonewolf", "cs1v1"]);

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, {
      error: "Method not allowed",
    });
  }

  const matchId = String(
    req.query?.matchId || ""
  ).trim();

  if (!ALLOWED.has(matchId)) {
    return json(res, 400, {
      error: "Invalid matchId.",
    });
  }

  try {
    const sql = getSql();

    const rooms = await sql`
      SELECT *
      FROM match_rooms
      WHERE match_id = ${matchId}
      LIMIT 1
    `;

    const room = rooms[0] || null;

    const joinRows = await sql`
      SELECT
        mj.user_email,
        mj.joined_at,
        u.username,
        u.ff_uid
      FROM match_joins mj
      LEFT JOIN users u
        ON u.email = mj.user_email
      WHERE mj.match_id = ${matchId}
      ORDER BY mj.joined_at ASC
    `;

    const playerCount = joinRows.length;

    const players = joinRows.map((r) => ({
      email: r.user_email,
      username:
        r.username ||
        r.user_email?.split("@")[0] ||
        "Player",
      ffUid: r.ff_uid || "",
      joinedAt: r.joined_at,
    }));

    let myJoin = null;

    const token = getBearerToken(req);
    const session = await verifyToken(token);

    if (session?.email) {
      myJoin =
        joinRows.find(
          (r) => r.user_email === session.email
        ) || null;

      if (myJoin) {
        const roomCreds = await sql`
          SELECT
            room_name,
            room_password
          FROM match_joins
          WHERE match_id = ${matchId}
            AND user_email = ${session.email}
          LIMIT 1
        `;

        myJoin = {
          ...myJoin,
          ...(roomCreds[0] || {}),
        };
      }
    }

    const resultRows = await sql`
      SELECT *
      FROM match_results
      WHERE match_id = ${matchId}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const latestResult = resultRows[0]
      ? {
          id: resultRows[0].id,
          winnerEmail: resultRows[0].winner_email,
          loserEmail: resultRows[0].loser_email,
          winnerUsername:
            resultRows[0].winner_username,
          loserUsername:
            resultRows[0].loser_username,
          prizeCoins:
            Number(resultRows[0].prize_coins) || 15,
          createdAt: resultRows[0].created_at,
        }
      : null;

    return json(res, 200, {
      matchId,
      playerCount,
      maxPlayers: 2,
      players,
      description: room?.description || "",
      timing_mode: room?.timing_mode || "open",
      deadline: room?.deadline || null,
      configured: Boolean(
        room?.room_name && room?.room_password
      ),
      joined: Boolean(myJoin),
      roomName: myJoin?.room_name || null,
      roomPassword: myJoin?.room_password || null,
      result: latestResult,
    });
  } catch (error) {
    console.error(error);

    return json(res, error.status || 500, {
      error: error.message || "Failed.",
    });
  }
}
