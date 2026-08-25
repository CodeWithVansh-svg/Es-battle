import { getSql } from "../../lib/db.js";
import {
  signResetToken,
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

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    const phone = String(body.phone || "").trim();

    const ffUid = String(
      body.ffUid || body.ff_uid || ""
    ).trim();

    if (!email || (!phone && !ffUid)) {
      return json(res, 400, {
        error:
          "Email and either your phone number or Free Fire UID are required.",
      });
    }

    const sql = getSql();

    const rows = await sql`
      SELECT email, phone, ff_uid
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    const user = rows[0];

    const matches =
      user &&
      (
        (phone && user.phone && phone === user.phone) ||
        (ffUid && user.ff_uid && ffUid === user.ff_uid)
      );

    if (!matches) {
      return json(res, 200, {
        success: true,
        message:
          "If those details matched an account, a reset token has been issued.",
      });
    }

    const token = await signResetToken(user.email);

    return json(res, 200, {
      success: true,
      message:
        "Verified — use this token to set a new password within 15 minutes.",
      resetToken: token,
    });
  } catch (error) {
    console.error(error);

    return json(res, error.status || 500, {
      error: error.message || "Reset request failed.",
    });
  }
}
