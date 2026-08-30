import { getSql, genId } from "../../lib/db.js";
import {
  requireAdmin,
  json,
  readBody,
  handleOptions,
} from "../../lib/auth.js";

const ALLOWED = new Set(["lonewolf", "cs1v1"]);
const PRIZE_COINS = 15;

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, {
      error: "Method not allowed",
    });
  }

  try {
    const admin = await requireAdmin(req);

    const body = await readBody(req);

    const matchId = String(
      body.matchId || ""
    ).trim();

    const winnerEmail = String(
      body.winnerEmail || ""
    )
      .trim()
      .toLowerCase();

    if (!ALLOWED.has(matchId)) {
      return json(res, 400, {
        error: "Invalid matchId.",
      });
    }

    if (!winnerEmail) {
      return json(res, 400, {
        error: "winnerEmail is required.",
      });
    }

    const sql = getSql();

    const joins = await sql`
      SELECT
        mj.user_email,
        u.username
      FROM match_joins mj
      LEFT JOIN users u
        ON u.email = mj.user_email
      WHERE mj.match_id = ${matchId}
      ORDER BY mj.joined_at ASC
    `;

    if (joins.length < 2) {
      return json(res, 400, {
        error:
          "Both players must join before a result can be declared.",
      });
    }

    const winnerRow = joins.find(
      (j) =>
        j.user_email.toLowerCase() ===
        winnerEmail
    );

    if (!winnerRow) {
      return json(res, 400, {
        error:
          "That player has not joined this match.",
      });
    }

    const loserRow = joins.find(
      (j) =>
        j.user_email.toLowerCase() !==
        winnerEmail
    );

    const resultId = genId();

    await sql.transaction((tx) => [
      tx`
        INSERT INTO match_results (
          id,
          match_id,
          winner_email,
          loser_email,
          winner_username,
          loser_username,
          prize_coins,
          decided_by
        )
        VALUES (
          ${resultId},
          ${matchId},
          ${winnerRow.user_email},
          ${loserRow?.user_email || null},
          ${winnerRow.username || winnerRow.user_email},
          ${loserRow?.username || null},
          ${PRIZE_COINS},
          ${admin.email}
        )
      `,

      tx`
        UPDATE users
        SET
          coins = coins + ${PRIZE_COINS},
          win_coins = win_coins + ${PRIZE_COINS},
          matches_won = matches_won + 1,
          matches_played = matches_played + 1
        WHERE email = ${winnerRow.user_email}
      `,

      ...(loserRow
        ? [
            tx`
              UPDATE users
              SET matches_played =
                matches_played + 1
              WHERE email = ${loserRow.user_email}
            `,
          ]
        : []),

      tx`
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
          ${winnerRow.user_email},
          'prize',
          'win_coins',
          ${PRIZE_COINS},
          ${`Won ${matchId} match`}
        )
      `,

      tx`
        DELETE FROM match_joins
        WHERE match_id = ${matchId}
      `,
    ]);

    return json(res, 200, {
      success: true,
      result: {
        id: resultId,
        matchId,
        winnerEmail: winnerRow.user_email,
        loserEmail:
          loserRow?.user_email || "",
        winnerUsername:
          winnerRow.username ||
          winnerRow.user_email,
        loserUsername:
          loserRow?.username || "Opponent",
        prizeCoins: PRIZE_COINS,
      },
    });
  } catch (error) {
    console.error(error);

    return json(res, error.status || 500, {
      error:
        error.message ||
        "Failed to submit result.",
    });
  }
}
