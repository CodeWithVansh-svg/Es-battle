import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const ADMIN_SEED = [
  {
    email: "dudhevansh8@gmail.com",
    password: "2345678910$$",
    username: "vansh_dada",
    phone: "8989921991",
    ff_uid: "9571892213",
  },
  {
    email: "samarthkhamele@gmail.com",
    password: "samarth333",
    username: "Samarth",
    phone: "",
    ff_uid: "1861297996",
  },
];

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.DATABASE_URL || "es-battle-dev-secret-change-me";
  return new TextEncoder().encode(secret.slice(0, 64));
}

export async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(password), hash);
}

export async function signToken(payload) {
  return new SignJWT({
    email: payload.email,
    role: payload.role || "user",
    username: payload.username || "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifyToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  if (typeof h === "string" && h.startsWith("Bearer ")) return h.slice(7).trim();
  return null;
}

export async function requireUser(req) {
  const token = getBearerToken(req);
  const payload = await verifyToken(token);
  if (!payload?.email) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return payload;
}

export async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== "admin") {
    const err = new Error("Admin only");
    err.status = 403;
    throw err;
  }
  return user;
}

export function isAdminEmail(email) {
  const n = String(email || "").trim().toLowerCase();
  return ADMIN_SEED.some((a) => a.email.toLowerCase() === n);
}

/** Ensure hardcoded admins exist in DB (hashed passwords). */
export async function ensureAdminsSeeded(sql) {
  for (const admin of ADMIN_SEED) {
    const rows = await sql`SELECT email FROM users WHERE email = ${admin.email.toLowerCase()} LIMIT 1`;
    if (rows.length) continue;
    const password_hash = await hashPassword(admin.password);
    await sql`
      INSERT INTO users (id, username, email, password_hash, phone, ff_uid, role, coins, win_coins)
      VALUES (
        ${`admin-${admin.email}`},
        ${admin.username},
        ${admin.email.toLowerCase()},
        ${password_hash},
        ${admin.phone || ""},
        ${admin.ff_uid || ""},
        'admin',
        0,
        0
      )
      ON CONFLICT (email) DO NOTHING
    `;
  }
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.end(JSON.stringify(body));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export async function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return true;
  }
  return false;
}
