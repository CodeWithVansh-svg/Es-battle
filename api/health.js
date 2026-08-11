import { json, handleOptions } from "../lib/auth.js";

export default async function handler(req, res) {
  if (await handleOptions(req, res)) return;
  const hasDb = Boolean(process.env.DATABASE_URL);
  json(res, 200, {
    ok: true,
    api: true,
    database: hasDb,
    mode: hasDb ? "remote" : "missing-database-url",
  });
}
