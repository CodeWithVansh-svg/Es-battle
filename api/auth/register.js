import { getSql, genId } from "../../lib/db.js";
import {
  hashPassword,
  signToken,
  json,
  readBody,
  handleOptions,
  isAdminEmail,
  ensureAdminsSeeded,
} from "../../lib/auth.js";

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const phone = String(body.phone || "").trim();
    const ff_uid = String(body.ffUid || body.ff_uid || "").trim();

    if (!username || !email || !password) {
      return json(res, 400, { error: "Username, email and password are required." });
    }
    if (password.length < 6) {
      return json(res, 400, { error: "Password must be at least 6 characters." });
    }
    if (isAdminEmail(email)) {
      return json(res, 400, { error: "This email is reserved." });
    }

    const sql = getSql();
    await ensureAdminsSeeded(sql);

    const existing = await sql`SELECT email FROM users WHERE email = ${email} LIMIT 1`;
    if (existing.length) {
      return json(res, 409, { error: "An account with this email already exists." });
    }

    const password_hash = await hashPassword(password);
    const id = genId();
    await sql`
      INSERT INTO users (id, username, email, password_hash, phone, ff_uid, role, coins, win_coins)
      VALUES (${id}, ${username}, ${email}, ${password_hash}, ${phone}, ${ff_uid}, 'user', 0, 0)
    `;

    const token = await signToken({ email, role: "user", username });
    return json(res, 201, {
      success: true,
      token,
      user: {
        id,
        username,
        email,
        phone,
        ff_uid,
        coins: 0,
        win_coins: 0,
        role: "user",
      },
    });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || "Registration failed." });
  }
}
