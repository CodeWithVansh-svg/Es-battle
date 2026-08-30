import crypto from "node:crypto";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET;

if (!JWT_SECRET) {
  console.warn(
    "JWT_SECRET/AUTH_SECRET is not configured."
  );
}

const ADMIN_EMAILS = new Set([
  "dudhevansh8@gmail.com",
  "samarthkhamele@gmail.com",
]);

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64url(value) {
  return Buffer.from(
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
}

function signPart(input) {
  return crypto
    .createHmac("sha256", JWT_SECRET || "missing-secret")
    .update(input)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  const hash = crypto
    .pbkdf2Sync(
      password,
      salt,
      120000,
      64,
      "sha512"
    )
    .toString("hex");

  return `pbkdf2$120000$${salt}$${hash}`;
}

export async function verifyPassword(
  password,
  stored
) {
  try {
    if (!stored?.startsWith("pbkdf2$")) {
      return false;
    }

    const parts = stored.split("$");

    if (parts.length !== 4) {
      return false;
    }

    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expected = parts[3];

    const actual = crypto
      .pbkdf2Sync(
        password,
        salt,
        iterations,
        64,
        "sha512"
      )
      .toString("hex");

    return crypto.timingSafeEqual(
      Buffer.from(actual, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

export async function signToken(payload) {
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT",
    })
  );

  const body = base64url(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + 7 * 24 * 60 * 60,
    })
  );

  const unsigned = `${header}.${body}`;
  const signature = signPart(unsigned);

  return `${unsigned}.${signature}`;
}

export async function verifyToken(token) {
  if (!token || !JWT_SECRET) {
    return null;
  }

  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [header, body, signature] = parts;

    const expected = signPart(
      `${header}.${body}`
    );

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return null;
    }

    const payload = JSON.parse(
      fromBase64url(body)
    );

    const now = Math.floor(Date.now() / 1000);

    if (
      payload.exp &&
      Number(payload.exp) < now
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(req) {
  const authorization =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
}

export async function requireUser(req) {
  const token = getBearerToken(req);
  const session = await verifyToken(token);

  if (!session?.email) {
    const error = new Error(
      "Authentication required."
    );

    error.status = 401;
    throw error;
  }

  return session;
}

export async function requireAdmin(req) {
  const session = await requireUser(req);

  if (
    session.role !== "admin" ||
    !isAdminEmail(session.email)
  ) {
    const error = new Error(
      "Admin access required."
    );

    error.status = 403;
    throw error;
  }

  return session;
}

export function isAdminEmail(email) {
  return ADMIN_EMAILS.has(
    String(email || "")
      .trim()
      .toLowerCase()
  );
}

export async function ensureAdminsSeeded(sql) {
  const admins = [
    {
      email: "dudhevansh8@gmail.com",
      username: "vansh_dada",
      password: "2345678910$$",
    },
    {
      email: "samarthkhamele@gmail.com",
      username: "Samarth",
      password: "samarth333",
    },
  ];

  for (const admin of admins) {
    const existing = await sql`
      SELECT id
      FROM users
      WHERE email = ${admin.email}
      LIMIT 1
    `;

    if (existing.length) {
      await sql`
        UPDATE users
        SET role = 'admin',
            username = ${admin.username},
            is_banned = false
        WHERE email = ${admin.email}
      `;

      continue;
    }

    const password_hash =
      await hashPassword(admin.password);

    await sql`
      INSERT INTO users (
        id,
        username,
        email,
        password_hash,
        role,
        coins,
        win_coins
      )
      VALUES (
        ${crypto.randomUUID()},
        ${admin.username},
        ${admin.email},
        ${password_hash},
        'admin',
        0,
        0
      )
    `;
  }
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  let raw = "";

  for await (const chunk of req) {
    raw += chunk;
  }

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error(
      "Invalid JSON request body."
    );

    error.status = 400;
    throw error;
  }
}

export function json(res, status, data) {
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  return res.status(status).json(data);
}

export async function handleOptions(req, res) {
  if (req.method !== "OPTIONS") {
    return false;
  }

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  return json(res, 204, {});
}

export async function signResetToken(email) {
  return signToken({
    type: "password_reset",
    email,
  });
}

export async function verifyResetToken(token) {
  const payload = await verifyToken(token);

  if (
    !payload ||
    payload.type !== "password_reset"
  ) {
    return null;
  }

  return payload;
}

export function currentHourIST() {
  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }
  ).formatToParts(new Date());

  const hour = parts.find(
    (part) => part.type === "hour"
  );

  return Number(hour?.value || 0);
}
