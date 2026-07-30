import { neon } from "@neondatabase/serverless";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=["']?(.+?)["']?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const databaseUrl = process.env.DATABASE_URL || globalThis.Netlify?.env?.get?.("DATABASE_URL");
const sql = databaseUrl ? neon(databaseUrl) : null;

export const hasDatabase = () => Boolean(sql);

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const passwordHash = (password, salt = randomBytes(16).toString("hex")) => {
  const derived = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${derived}`;
};

const verifyPassword = (password, stored) => {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = passwordHash(password, salt).split(":")[1];
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
};

export async function createAccount({ email, name, password, appState }) {
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Enter a valid email address.");
  if (String(password || "").length < 8) throw new Error("Password must be at least 8 characters.");
  const rows = await sql`
    insert into woven_users (email, name, password_hash)
    values (${normalizedEmail}, ${name || "Ana"}, ${passwordHash(password)})
    returning id, email, name, created_at
  `;
  await saveAccountState(rows[0].id, appState);
  const session = await createSession(rows[0].id);
  return { user: rows[0], session };
}

export async function loginAccount({ email, password }) {
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  const rows = await sql`select id, email, name, password_hash, created_at from woven_users where email = ${String(email || "").trim().toLowerCase()}`;
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) throw new Error("Email or password is incorrect.");
  const session = await createSession(user.id);
  delete user.password_hash;
  return { user, session };
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await sql`insert into woven_sessions (user_id, token_hash, expires_at) values (${userId}, ${hashToken(token)}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function userFromToken(token) {
  if (!sql || !token) return null;
  const rows = await sql`
    select u.id, u.email, u.name, u.created_at
    from woven_sessions s
    join woven_users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()
    limit 1
  `;
  return rows[0] || null;
}

export async function logoutToken(token) {
  if (!sql || !token) return;
  await sql`delete from woven_sessions where token_hash = ${hashToken(token)}`;
}

export async function loadAccountState(userId) {
  if (!sql || !userId) return null;
  const rows = await sql`select * from woven_app_state where user_id = ${userId}`;
  return rows[0] || null;
}

export async function saveAccountState(userId, state = {}) {
  if (!sql || !userId) return;
  await sql`
    insert into woven_app_state (
      user_id, profile, preferences, planning_profile, tasks, meetings, checkins,
      daily_intentions, reflections, notification_preferences, notification_plans, learned_adjustments, updated_at
    )
    values (
      ${userId}, ${JSON.stringify(state.profile || {})}, ${JSON.stringify(state.preferences || {})},
      ${JSON.stringify(state.planningProfile || {})}, ${JSON.stringify(state.tasks || [])},
      ${JSON.stringify(state.meetings || [])}, ${JSON.stringify(state.checkins || [])},
      ${JSON.stringify(state.dailyIntentions || [])}, ${JSON.stringify(state.reflections || [])},
      ${JSON.stringify(state.notificationPreferences || {})}, ${JSON.stringify(state.notificationPlans || [])},
      ${JSON.stringify(state.learnedAdjustments || {})}, now()
    )
    on conflict (user_id) do update set
      profile = excluded.profile,
      preferences = excluded.preferences,
      planning_profile = excluded.planning_profile,
      tasks = excluded.tasks,
      meetings = excluded.meetings,
      checkins = excluded.checkins,
      daily_intentions = excluded.daily_intentions,
      reflections = excluded.reflections,
      notification_preferences = excluded.notification_preferences,
      notification_plans = excluded.notification_plans,
      learned_adjustments = excluded.learned_adjustments,
      updated_at = now()
  `;
}

export async function deleteAccount(userId) {
  if (!sql || !userId) return;
  await sql`delete from woven_users where id = ${userId}`;
}
