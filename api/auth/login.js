import { getSql } from "../../lib/db.js";
import {
  verifyPassword,
  signToken,
  json,
  readBody,
  handleOptions,
  ensureAdminsSeeded,
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

    const password = String(body.password || "");

    if (!email || !password) {
      return json(res, 400, {
        error: "Email and password are required.",
      });
    }

    const sql = getSql();

    await ensureAdminsSeeded(sql);

    const rows = await sql`
      SELECT
        id,
        username,
        email,
        password_hash,
        phone,
        ff_uid,
        coins,
        win_coins,
        role,
        is_banned
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    const user = rows[0];

    if (!user) {
      return json(res, 401, {
        error: "Invalid email or password.",
      });
    }

    if (user.is_banned) {
      return json(res, 403, {
        error: "This account has been suspended.",
      });
    }

    const ok = await verifyPassword(
      password,
      user.password_hash
    );

    if (!ok) {
      return json(res, 401, {
        error: "Invalid email or password.",
      });
    }

    const token = await signToken({
      email: user.email,
      role: user.role,
      username: user.username,
    });

    return json(res, 200, {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone || "",
        ff_uid: user.ff_uid || "",
        coins: Number(user.coins) || 0,
        win_coins: Number(user.win_coins) || 0,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);

    return json(res, error.status || 500, {
      error: error.message || "Login failed.",
    });
  }
}
