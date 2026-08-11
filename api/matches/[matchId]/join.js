import { getSql, genId } from "../../../lib/db.js";
import { requireUser, json, handleOptions } from "../../../lib/auth.js";

const ALLOWED = new Set(["lonewolf", "cs1v1"]);
const ENTRY_FEE = 10;
const MAX_PLAYERS = 2;

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const matchId = String(req.query?.matchId || "").trim();
  if (!ALLOWED.has(matchId)) {
    return json(res, 400, { error: "Invalid match id." });
  }

  try {
    const session = await requireUser(req);
    const sql = getSql();

    const rooms = await sql`SELECT * FROM match_rooms WHERE match_id = ${matchId} LIMIT 1`;
    const room = rooms[0];
    if (!room?.room_name || !room?.room_password) {
      return json(res, 400, { error: "Room is not configured yet. Ask admin to save room settings." });
    }

    // Timing: only "before" closes joins after deadline
    if (room.timing_mode === "before" && room.deadline) {
      const [h, m] = String(room.deadline).split(":").map(Number);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        const now = new Date();
        const deadline = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
        if (Date.now() > deadline.getTime()) {
          return json(res, 400, { error: "The join window for today has closed." });
        }
      }
    }

    const existing = await sql`
      SELECT id FROM match_joins WHERE match_id = ${matchId} AND user_email = ${session.email} LIMIT 1
    `;
    if (existing.length) {
      const full = await sql`
        SELECT room_name, room_password FROM match_joins
        WHERE match_id = ${matchId} AND user_email = ${session.email} LIMIT 1
      `;
      return json(res, 200, {
        success: true,
        alreadyJoined: true,
        roomName: full[0]?.room_name || room.room_name,
        roomPassword: full[0]?.room_password || room.room_password,
      });
    }

    const countRows = await sql`
      SELECT COUNT(*)::int AS c FROM match_joins WHERE match_id = ${matchId}
    `;
    if ((countRows[0]?.c || 0) >= MAX_PLAYERS) {
      return json(res, 400, { error: "Match full — 2 players have already joined." });
    }

    const users = await sql`SELECT coins FROM users WHERE email = ${session.email} LIMIT 1`;
    const user = users[0];
    if (!user) return json(res, 404, { error: "Account not found." });
    if ((Number(user.coins) || 0) < ENTRY_FEE) {
      return json(res, 400, { error: "Not enough coins to join." });
    }

    await sql`UPDATE users SET coins = coins - ${ENTRY_FEE} WHERE email = ${session.email}`;
    await sql`
      INSERT INTO match_joins (id, match_id, user_email, room_name, room_password)
      VALUES (${genId()}, ${matchId}, ${session.email}, ${room.room_name}, ${room.room_password})
    `;
    await sql`
      INSERT INTO wallet_transactions (id, user_email, transaction_type, wallet, amount, note)
      VALUES (${genId()}, ${session.email}, 'entry_fee', 'coins', ${-ENTRY_FEE}, ${`Joined ${matchId}`})
    `;

    return json(res, 200, {
      success: true,
      roomName: room.room_name,
      roomPassword: room.room_password,
      timing_mode: room.timing_mode,
      deadline: room.deadline,
    });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || "Join failed." });
  }
}
