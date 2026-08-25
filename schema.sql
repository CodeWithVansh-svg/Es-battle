CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT DEFAULT '',
  ff_uid TEXT DEFAULT '',
  coins INTEGER NOT NULL DEFAULT 0,
  win_coins INTEGER NOT NULL DEFAULT 0,
  matches_played INTEGER NOT NULL DEFAULT 0,
  matches_won INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_rooms (
  match_id TEXT PRIMARY KEY,
  room_name TEXT NOT NULL DEFAULT '',
  room_password TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  timing_mode TEXT NOT NULL DEFAULT 'open',
  deadline TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_joins (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  room_name TEXT NOT NULL DEFAULT '',
  room_password TEXT NOT NULL DEFAULT '',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_results (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  winner_email TEXT NOT NULL,
  loser_email TEXT,
  winner_username TEXT NOT NULL DEFAULT '',
  loser_username TEXT,
  prize_coins INTEGER NOT NULL DEFAULT 15,
  decided_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recharge_requests (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  amount INTEGER NOT NULL,
  utr_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  wallet TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdraw_requests (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  amount INTEGER NOT NULL,
  upi_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recharge_status
  ON recharge_requests(status);

CREATE INDEX IF NOT EXISTS idx_recharge_user
  ON recharge_requests(user_email);

CREATE INDEX IF NOT EXISTS idx_results_match
  ON match_results(match_id, created_at DESC);
