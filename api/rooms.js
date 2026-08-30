import { getSql } from "../lib/db.js";
import {
  requireAdmin,
  json,
  readBody,
  handleOptions,
} from "../lib/auth.js";

const ALLOWED_MATCHES = new Set([
  "lonewolf",
  "cs1v1",
]);

const ALLOWED_TIMING_MODES = new Set([
  "open",
  "before",
  "at",
]);

export default async function handler(req, res) {
  if (await handleOptions(req, res)) {
    return;
  }

  const matchId = String(
    req.query?.matchId || ""
  ).trim();

  if (!ALLOWED_MATCHES.has(matchId)) {
    return json(res, 400, {
      error:
        "Invalid matchId. Use lonewolf or cs1v1.",
    });
  }

  try {
    const sql = getSql();

    if (req.method === "GET") {
      const rows = await sql`
        SELECT
          match_id,
          room_name,
          description,
          timing_mode,
          deadline,
          updated_at
        FROM match_rooms
        WHERE match_id = ${matchId}
        LIMIT 1
      `;

      const room = rows[0];

      if (!room) {
        return json(res, 200, {
          room: {
            match_id: matchId,
            room_name: "",
            description: "",
            timing_mode: "open",
            deadline: null,
            configured: false,
          },
        });
      }

      return json(res, 200, {
        room: {
          match_id:
            room.match_id,
          room_name:
            room.room_name || "",
          description:
            room.description || "",
          timing_mode:
            room.timing_mode || "open",
          deadline:
            room.deadline || null,
          configured: Boolean(
            room.room_name
          ),
          updated_at:
            room.updated_at,
        },
      });
    }

    if (req.method === "PUT") {
      await requireAdmin(req);

      const body =
        await readBody(req);

      const roomName = String(
        body.room_name ||
          body.name ||
          ""
      ).trim();

      const roomPassword =
        String(
          body.room_password ||
            body.password ||
            ""
        ).trim();

      const description =
        String(
          body.description || ""
        ).trim();

      const timingMode =
        String(
          body.timing_mode ||
            "open"
        ).trim();

      const deadline =
        body.deadline
          ? String(
              body.deadline
            ).trim()
          : null;

      if (!roomName) {
        return json(res, 400, {
          error:
            "Room name is required.",
        });
      }

      if (!roomPassword) {
        return json(res, 400, {
          error:
            "Room password is required.",
        });
      }

      if (
        !ALLOWED_TIMING_MODES.has(
          timingMode
        )
      ) {
        return json(res, 400, {
          error:
            "Invalid timing mode.",
        });
      }

      if (
        timingMode !== "open" &&
        !deadline
      ) {
        return json(res, 400, {
          error:
            "A deadline/time is required for this timing mode.",
        });
      }

      await sql`
        INSERT INTO match_rooms (
          match_id,
          room_name,
          room_password,
          description,
          timing_mode,
          deadline,
          updated_at
        )
        VALUES (
          ${matchId},
          ${roomName},
          ${roomPassword},
          ${description},
          ${timingMode},
          ${deadline},
          NOW()
        )
        ON CONFLICT (match_id)
        DO UPDATE SET
          room_name =
            EXCLUDED.room_name,
          room_password =
            EXCLUDED.room_password,
          description =
            EXCLUDED.description,
          timing_mode =
            EXCLUDED.timing_mode,
          deadline =
            EXCLUDED.deadline,
          updated_at =
            NOW()
      `;

      return json(res, 200, {
        success: true,
      });
    }

    if (req.method === "DELETE") {
      await requireAdmin(req);

      await sql`
        DELETE FROM match_joins
        WHERE match_id = ${matchId}
      `;

      await sql`
        UPDATE match_rooms
        SET
          room_name = '',
          room_password = '',
          description = '',
          timing_mode = 'open',
          deadline = NULL,
          updated_at = NOW()
        WHERE match_id = ${matchId}
      `;

      return json(res, 200, {
        success: true,
      });
    }

    return json(res, 405, {
      error: "Method not allowed.",
    });
  } catch (error) {
    console.error(
      "Rooms API error:",
      error
    );

    return json(
      res,
      error.status || 500,
      {
        error:
          error.message ||
          "Failed to process room.",
      }
    );
  }
}
