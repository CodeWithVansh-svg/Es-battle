import { getSql, genId } from "../../lib/db.js";
import {
  requireAdmin,
  requireUser,
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

      const status = (req.query?.status || "pending").toString();

      const rows =
        status === "all"
          ? await sql`
              SELECT *
              FROM recharge_requests
              ORDER BY created_at DESC
              LIMIT 200
            `
          : await sql`
              SELECT *
              FROM recharge_requests
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
      const utr = String(
        body.utr || body.utr_number || ""
      ).trim();

      if (!Number.isFinite(amount) || amount < 10) {
        return json(res, 400, {
          error: "Amount must be at least 10.",
        });
      }

      if (!/^[0-9]{10,22}$/.test(utr)) {
        return json(res, 400, {
          error:
            "Enter a valid UTR / transaction reference number (digits only).",
        });
      }

      const id = genId();

      await sql`
        INSERT INTO recharge_requests (
          id,
          user_email,
          amount,
          utr_number,
          status
        )
        VALUES (
          ${id},
          ${session.email},
          ${amount},
          ${utr},
          'pending'
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
        FROM recharge_requests
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
          UPDATE recharge_requests
          SET status = 'approved'
          WHERE id = ${id}
        `;

        await sql`
          UPDATE users
          SET coins = coins + ${Number(reqRow.amount)}
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
            'recharge',
            'coins',
            ${Number(reqRow.amount)},
            ${`Recharge approved (UTR ${reqRow.utr_number})`}
          )
        `;
      } else {
        await sql`
          UPDATE recharge_requests
          SET
            status = 'rejected',
            reason = ${reason || null}
          WHERE id = ${id}
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
