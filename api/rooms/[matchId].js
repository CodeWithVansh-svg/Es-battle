import { getSql } from "../../lib/db.js";
import { requireAdmin, json, readBody, handleOptions } from "../../lib/auth.js";

const ALLOWED = new Set(["lonewolf", "cs1v1"]);

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  const matchId = String(req.query?.matchId || "").trim();
  if (!ALLOWED.has(matchId)) {
    return json(res, 400, { error: "Invalid match id." });
  }

  try {
    const sql = getSql();

    if (req.method === "GET") {
      const rows = await sql`SELECT * FROM match_rooms WHERE match_id = ${matchId} LIMIT 1`;
      const room = rows[0] || {
        match_id: matchId,
        room_name: "",
        room_password: "",
        description: "",
        timing_mode: "open",
        deadline: null,
      };
      // Hide password from non-participants on public GET — only return config metadata for UI
      // Password is revealed after join via match join endpoint / stored join record.
      return json(res, 200, {
        room: {
          match_id: room.match_id,
          room_name: room.room_name || "",
          description: room.description || "",
          timing_mode: room.timing_mode || "open",
          deadline: room.deadline || null,
          configured: Boolean(room.room_name && room.room_password),
        },
      });
    }

    if (req.method === "PUT") {
      await requireAdmin(req);
      const body = await readBody(req);
      const room_name = String(body.room_name || body.name || "").trim();
      const room_password = String(body.room_password || body.password || "").trim();
      const description = String(body.description || "").trim();
      const timing_mode = String(body.timing_mode || "open").trim();
      const deadline = body.deadline ? String(body.deadline).trim() : null;

      if (!room_name || !room_password) {
        return json(res, 400, { error: "Room name and password are required." });
      }
      if (["before", "at"].includes(timing_mode) && !deadline) {
        return json(res, 400, { error: "Time is required for this timing mode." });
      }

      await sql`
        INSERT INTO match_rooms (match_id, room_name, room_password, description, timing_mode, deadline, updated_at)
        VALUES (${matchId}, ${room_name}, ${room_password}, ${description}, ${timing_mode}, ${deadline}, NOW())
        ON CONFLICT (match_id) DO UPDATE SET
          room_name = EXCLUDED.room_name,
          room_password = EXCLUDED.room_password,
          description = EXCLUDED.description,
          timing_mode = EXCLUDED.timing_mode,
          deadline = EXCLUDED.deadline,
          updated_at = NOW()
      `;

      return json(res, 200, { success: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || "Failed." });
  }
}
