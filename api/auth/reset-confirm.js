import { getSql } from "../../lib/db.js";
import {
  verifyResetToken,
  hashPassword,
  json,
  readBody,
  handleOptions,
} from "../../lib/auth.js";

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, {
      error: "Method not allowed",
    });
  }

  try {
    const body = await readBody(req);

    const token = String(body.token || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!token || !newPassword) {
      return json(res, 400, {
        error: "Token and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return json(res, 400, {
        error: "Password must be at least 6 characters.",
      });
    }

    const payload = await verifyResetToken(token);

    if (!payload) {
      return json(res, 400, {
        error: "This reset link is invalid or has expired.",
      });
    }

    const sql = getSql();

    const password_hash = await hashPassword(
      newPassword
    );

    const rows = await sql`
      UPDATE users
      SET password_hash = ${password_hash}
      WHERE email = ${payload.email}
      RETURNING email
    `;

    if (!rows.length) {
      return json(res, 404, {
        error: "Account not found.",
      });
    }

    return json(res, 200, {
      success: true,
      message: "Password updated. You can now log in.",
    });
  } catch (error) {
    console.error(error);

    return json(res, error.status || 500, {
      error: error.message || "Reset failed.",
    });
  }
}
