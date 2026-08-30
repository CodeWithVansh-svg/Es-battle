import { getSql, genId } from "../../lib/db.js";
import {
  requireAdmin,
  requireUser,
  json,
  readBody,
  handleOptions,
  currentHourIST,
} from "../../lib/auth.js";

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  try {
    const sql = getSql();

    if (req.method === "GET") {
      await requireAdmin(req);

      const status = (req.query?.status || "pending").toString();

      const rows =
        status === "all"
          ? await sql`
              SELECT *
              FROM withdraw_requests
              ORDER BY created_at DESC
              LIMIT 200
            `
          : await sql`
              SELECT *
              FROM withdraw_requests
              WHERE status = ${status}
              ORDER BY created_at DESC
              LIMIT 200
            `;

      return json(res, 200, {
        requests: rows,
      });
    }

    if (req.method === "POST") {
      const session = await requireUser(req);
      const body = await readBody(req);

      const amount = Number(body.amount);

      const upi = String(
        body.upi || body.upi_id || ""
      ).trim();

      if (!Number.isFinite(amount) || amount < 30) {
        return json(res, 400, {
          error: "Minimum withdrawal is 30 win coins.",
        });
      }

      if (
        !/^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,64}$/.test(upi)
      ) {
        return json(res, 400, {
          error: "Enter a valid UPI ID (e.g. name@bank).",
        });
      }

      const hour = currentHourIST();

      if (hour < 14 || hour >= 21) {
        return json(res, 400, {
          error:
            "Withdrawals are only allowed between 2:00 PM and 9:00 PM IST.",
        });
      }

      const inMatch = await sql`
        SELECT id
        FROM match_joins
        WHERE user_email = ${session.email}
        LIMIT 1
      `;

      if (inMatch.length) {
        return json(res, 400, {
          error: "You can't withdraw while you're in a match.",
        });
      }

      const id = genId();

      const updated = await sql`
        UPDATE users
        SET win_coins = win_coins - ${amount}
        WHERE email = ${session.email}
          AND win_coins >= ${amount}
        RETURNING win_coins
      `;

      if (!updated.length) {
        return json(res, 400, {
          error: "Not enough win coins.",
        });
      }

      await sql`
        INSERT INTO withdraw_requests (
          id,
          user_email,
          amount,
          upi_id,
          status
        )
        VALUES (
          ${id},
          ${session.email},
          ${amount},
          ${upi},
          'pending'
        )
      `;

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
          'withdraw',
          'win_coins',
          ${-amount},
          'Withdrawal requested'
        )
      `;

      return json(res, 201, {
        success: true,
        id,
      });
    }

    if (req.method === "PATCH") {
      await requireAdmin(req);

      const body = await readBody(req);

      const id = String(body.id || "").trim();
      const action = String(body.action || "").trim();
      const reason = String(body.reason || "").trim();

      if (!id || !["approve", "reject"].includes(action)) {
        return json(res, 400, {
          error: "id and action (approve|reject) required.",
        });
      }

      const rows = await sql`
        SELECT *
        FROM withdraw_requests
        WHERE id = ${id}
        LIMIT 1
      `;

      const reqRow = rows[0];

      if (!reqRow) {
        return json(res, 404, {
          error: "Request not found.",
        });
      }

      if (reqRow.status !== "pending") {
        return json(res, 400, {
          error: "Request already processed.",
        });
      }

      if (action === "approve") {
        await sql`
          UPDATE withdraw_requests
          SET status = 'paid'
          WHERE id = ${id}
        `;
      } else {
        await sql`
          UPDATE withdraw_requests
          SET
            status = 'rejected',
            reason = ${reason || null}
          WHERE id = ${id}
        `;

        await sql`
          UPDATE users
          SET win_coins = win_coins + ${Number(reqRow.amount)}
          WHERE email = ${reqRow.user_email}
        `;

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
            ${reqRow.user_email},
            'refund',
            'win_coins',
            ${Number(reqRow.amount)},
            ${`Withdrawal rejected${
              reason ? `: ${reason}` : ""
            }`}
          )
        `;
      }

      return json(res, 200, {
        success: true,
      });
    }

    return json(res, 405, {
      error: "Method not allowed",
    });
  } catch (error) {
    console.error(error);

    return json(res, error.status || 500, {
      error: error.message || "Failed.",
    });
  }
}
