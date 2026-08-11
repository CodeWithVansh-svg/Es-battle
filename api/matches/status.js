import { getSql } from "../../lib/db.js";
import { getBearerToken, verifyToken, json, handleOptions } from "../../lib/auth.js";

const ALLOWED = new Set(["lonewolf", "cs1v1"]);

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const matchId = String(req.query?.matchId || "").trim();
  if (!ALLOWED.has(matchId)) {
    return json(res, 400, { error: "Invalid matchId." });
  }

  try {
    const sql = getSql();
    const rooms = await sql`SELECT * FROM match_rooms WHERE match_id = ${matchId} LIMIT 1`;
    const room = rooms[0] || null;
    const countRows = await sql`
      SELECT COUNT(*)::int AS c FROM match_joins WHERE match_id = ${matchId}
    `;
    const playerCount = countRows[0]?.c || 0;

    let myJoin = null;
    const token = getBearerToken(req);
    const session = await verifyToken(token);
    if (session?.email) {
      const rows = await sql`
        SELECT room_name, room_password, joined_at
        FROM match_joins
        WHERE match_id = ${matchId} AND user_email = ${session.email}
        LIMIT 1
      `;
      myJoin = rows[0] || null;
    }

    return json(res, 200, {
      matchId,
      playerCount,
      maxPlayers: 2,
      description: room?.description || "",
      timing_mode: room?.timing_mode || "open",
      deadline: room?.deadline || null,
      configured: Boolean(room?.room_name && room?.room_password),
      joined: Boolean(myJoin),
      roomName: myJoin?.room_name || null,
      roomPassword: myJoin?.room_password || null,
    });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || "Failed." });
  }
}
