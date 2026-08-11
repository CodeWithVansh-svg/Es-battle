import { neon } from "@neondatabase/serverless";

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add it in Vercel → Project → Settings → Environment Variables.");
  }
  return neon(url);
}

export function genId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
