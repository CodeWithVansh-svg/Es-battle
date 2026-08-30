import { getSql, genId } from "../../lib/db.js";
import {
  requireUser,
  json,
  readBody,
  handleOptions,
  currentHourIST,
} from "../../lib/auth.js";

const ALLOWED = new Set(["lonewolf", "cs1v1"]);
const ENTRY_FEE = 10;
const MAX_PLAYERS = 2;

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, {
      error: "Method not allowed",
    });
  }

  try {
    const body = await readBody(req);

    const matchId = String(
      body.matchId || req.query?.matchId || ""
    ).trim();

    if (!ALLOWED.has(matchId)) {
      return json(res, 400, {
        error: "Invalid matchId.",
      });
    }

    const session = await requireUser(req);
    const sql = getSql();

    const rooms = await sql`
      SELECT *
      FROM match_rooms
      WHERE match_id = ${matchId}
      LIMIT 1
    `;

    const room = rooms[0];

    if (!room?.room_name || !room?.room_password) {
      return json(res, 400, {
        error:
          "Room is not configured yet. Ask admin to save room settings.",
      });
    }

    if (
      room.timing_mode === "before" &&
      room.deadline
    ) {
      const [h, m] = String(room.deadline)
        .split(":")
        .map(Number);

      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        const nowIST = new Date(
          new Date().toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
          })
        );

        const deadlineMinutes = h * 60 + m;

        const nowMinutes =
          nowIST.getHours() * 60 +
          nowIST.getMinutes();

        if (nowMinutes > deadlineMinutes) {
          return json(res, 400, {
            error:
              "The join window for today has closed.",
          });
        }
      }
    }

    const existing = await sql`
      SELECT
        room_name,
        room_password
      FROM match_joins
      WHERE match_id = ${matchId}
        AND user_email = ${session.email}
      LIMIT 1
    `;

    if (existing.length) {
      return json(res, 200, {
        success: true,
        alreadyJoined: true,
        roomName: existing[0].room_name,
        roomPassword:
          existing[0].room_password,
      });
    }

    const id = genId();

    const inserted = await sql`
      WITH lock_room AS (
        SELECT
          room_name,
          room_password
        FROM match_rooms
        WHERE match_id = ${matchId}
        FOR UPDATE
      ),
      capacity AS (
        SELECT COUNT(*)::int AS c
        FROM match_joins
        WHERE match_id = ${matchId}
      ),
      funded AS (
        SELECT coins
        FROM users
        WHERE email = ${session.email}
        FOR UPDATE
      ),
      ins AS (
        INSERT INTO match_joins (
          id,
          match_id,
          user_email,
          room_name,
          room_password
        )
        SELECT
          ${id},
          ${matchId},
          ${session.email},
          lock_room.room_name,
          lock_room.room_password
        FROM lock_room, capacity, funded
        WHERE
          capacity.c < ${MAX_PLAYERS}
          AND funded.coins >= ${ENTRY_FEE}
        RETURNING
          room_name,
          room_password
      )
      UPDATE users
      SET coins = coins - ${ENTRY_FEE}
      WHERE
        email = ${session.email}
        AND EXISTS (
          SELECT 1 FROM ins
        )
      RETURNING
        (
          SELECT room_name
          FROM ins
        ) AS room_name,
        (
          SELECT room_password
          FROM ins
        ) AS room_password
    `;

    if (!inserted.length) {
      const countRows = await sql`
        SELECT COUNT(*)::int AS c
        FROM match_joins
        WHERE match_id = ${matchId}
      `;

      if (
        (countRows[0]?.c || 0) >= MAX_PLAYERS
      ) {
        return json(res, 400, {
          error:
            "Match full — 2 players have already joined.",
        });
      }

      return json(res, 400, {
        error: "Not enough coins to join.",
      });
    }

    const {
      room_name,
      room_password,
    } = inserted[0];

    await sql`
      INSERT INTO wallet_transactions (
        id,
        user_email,
        transaction_type,
        wallet,
        amount,
        note
      )
      VALUES (
        ${genId()},
        ${session.email},
        'entry_fee',
        'coins',
        ${-ENTRY_FEE},
        ${`Joined ${matchId}`}
      )
    `;

    return json(res, 200, {
      success: true,
      roomName: room_name,
      roomPassword: room_password,
      timing_mode: room.timing_mode,
      deadline: room.deadline,
    });
  } catch (error) {
    console.error(error);

    return json(res, error.status || 500, {
      error: error.message || "Join failed.",
    });
  }
}
