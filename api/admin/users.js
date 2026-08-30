import { getSql, genId } from "../../lib/db.js";
import {
  requireAdmin,
  json,
  readBody,
  handleOptions,
} from "../../lib/auth.js";

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  try {
    const sql = getSql();

    if (req.method === "GET") {
      await requireAdmin(req);

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
          matches_played:
            Number(u.matches_played) || 0,
          matches_won:
            Number(u.matches_won) || 0,
          created_at: u.created_at,
        })),
      });
    }

    if (req.method === "PATCH") {
      const admin = await requireAdmin(req);
      const body = await readBody(req);

      const email = String(
        body.email || ""
      )
        .trim()
        .toLowerCase();

      const amount = Number(
        body.amount
      );

      const note = String(
        body.note || ""
      ).trim();

      if (!email) {
        return json(res, 400, {
          error: "User email is required.",
        });
      }

      if (
        !Number.isFinite(amount) ||
        !Number.isInteger(amount) ||
        amount === 0
      ) {
        return json(res, 400, {
          error:
            "Amount must be a non-zero integer.",
        });
      }

      const users = await sql`
        SELECT
          id,
          email,
          username,
          coins,
          win_coins
        FROM users
        WHERE email = ${email}
        LIMIT 1
      `;

      const user = users[0];

      if (!user) {
        return json(res, 404, {
          error: "User not found.",
        });
      }

      /*
       * Positive amount:
       *   add win coins
       *
       * Negative amount:
       *   remove win coins
       *
       * We never allow the balance to become negative.
       */
      const updated = await sql`
        UPDATE users
        SET win_coins = win_coins + ${amount}
        WHERE email = ${email}
          AND win_coins + ${amount} >= 0
        RETURNING
          id,
          username,
          email,
          coins,
          win_coins
      `;

      if (!updated.length) {
        return json(res, 400, {
          error:
            "Operation would make the user's win coin balance negative.",
        });
      }

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
          ${email},
          'admin_adjustment',
          'win_coins',
          ${amount},
          ${
            note ||
            `Balance adjusted by admin ${admin.email}`
          }
        )
      `;

      return json(res, 200, {
        success: true,
        user: {
          id: updated[0].id,
          username:
            updated[0].username,
          email:
            updated[0].email,
          coins:
            Number(updated[0].coins) || 0,
          win_coins:
            Number(updated[0].win_coins) || 0,
        },
      });
    }

    return json(res, 405, {
      error: "Method not allowed.",
    });
  } catch (error) {
    console.error(
      "Admin users API error:",
      error
    );

    return json(
      res,
      error.status || 500,
      {
        error:
          error.message ||
          "Failed to process request.",
      }
    );
  }
}
