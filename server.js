import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activeCriticalCount,
  calculateLearnedAdjustments,
  createDailyNotificationPlan,
  generateSchedule,
  isValidTime,
  minutes,
  profileFromPreferences,
  toTime,
  validatePlanningProfile
} from "./lib/planning-service.js";
import { dailyGoals } from "./lib/planning-config.js";
import {
  createAccount,
  deleteAccount,
  hasDatabase,
  loadAccountState,
  loginAccount,
  logoutToken,
  saveAccountState,
  userFromToken
} from "./lib/auth-db.js";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(appDir, "public");
const dataDir = path.join(appDir, "data");
const dataFile = path.join(dataDir, "state.json");
const port = Number(process.env.PORT || 5186);
const appTimeZone = "Europe/Bucharest";
const sessionCookieName = "woven_session";

const fixedTaskRange = (task) => {
  if (task.scheduleMode !== "fixed" || !isValidTime(task.fixedStart) || !isValidTime(task.fixedEnd)) return null;
  const start = minutes(task.fixedStart);
  const end = minutes(task.fixedEnd);
  if (end <= start) return null;
  return { start, end };
};

const localParts = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

const localPart = (type, date = new Date()) => localParts(date).find((part) => part.type === type)?.value;

const todayIso = () => `${localPart("year")}-${localPart("month")}-${localPart("day")}`;

const nowMinutes = () => Number(localPart("hour")) * 60 + Number(localPart("minute"));

const cookieValue = (request, name) =>
  (request.headers.cookie || "")
    .split(";")
    .map((item) => item.trim().split("="))
    .find(([key]) => key === name)?.[1];

const authCookie = (token, expiresAt) =>
  `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;

const clearAuthCookie = () => `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

const db = {
  profiles: [
    {
      id: "ana",
      name: "Ana",
      role: "Product designer",
      chronotype: "morning",
      workHours: { start: "09:00", end: "18:00" },
      weeklyIntentions: {
        workTarget: 34,
        mindTarget: 8,
        socialTarget: 5,
        bodyTarget: 6
      },
      energyPattern: {
        monday: { morning: 56, midday: 45, afternoon: 50, evening: 62 },
        tuesday: { morning: 82, midday: 65, afternoon: 58, evening: 48 },
        wednesday: { morning: 78, midday: 68, afternoon: 56, evening: 46 },
        thursday: { morning: 74, midday: 62, afternoon: 52, evening: 50 },
        friday: { morning: 66, midday: 58, afternoon: 48, evening: 70 },
        saturday: { morning: 72, midday: 78, afternoon: 76, evening: 74 },
        sunday: { morning: 62, midday: 66, afternoon: 60, evening: 48 }
      }
    },
    {
      id: "mira",
      name: "Mira",
      role: "Operations lead",
      chronotype: "steady",
      workHours: { start: "08:30", end: "17:30" },
      weeklyIntentions: {
        workTarget: 32,
        mindTarget: 10,
        socialTarget: 6,
        bodyTarget: 5
      },
      energyPattern: {
        monday: { morning: 62, midday: 62, afternoon: 58, evening: 50 },
        tuesday: { morning: 70, midday: 68, afternoon: 62, evening: 52 },
        wednesday: { morning: 72, midday: 70, afternoon: 64, evening: 55 },
        thursday: { morning: 70, midday: 68, afternoon: 64, evening: 56 },
        friday: { morning: 66, midday: 64, afternoon: 58, evening: 68 },
        saturday: { morning: 64, midday: 74, afternoon: 72, evening: 70 },
        sunday: { morning: 60, midday: 66, afternoon: 62, evening: 50 }
      }
    }
  ],
  currentProfileId: "ana",
  meetings: [],
  tasks: [
    {
      id: "task-1784877299684",
      status: "todo",
      due: "2026-07-24",
      duration: 60,
      scheduleMode: "fixed",
      fixedStart: "13:00",
      fixedEnd: "14:00",
      priority: "high",
      difficulty: 2,
      energy: 3,
      mood: "neutral",
      category: "work",
      stitch: "contribution",
      project: "Bletchley",
      title: "rony meeting",
      description: ""
    },
    {
      id: "task-1784877328378",
      status: "todo",
      due: "2026-07-24",
      duration: 60,
      scheduleMode: "fixed",
      fixedStart: "19:00",
      fixedEnd: "20:00",
      priority: "medium",
      difficulty: 3,
      energy: 4,
      mood: "good",
      category: "body",
      stitch: "joy",
      project: "General",
      title: "badminton",
      description: ""
    },
    {
      id: "task-1784877359654",
      status: "todo",
      due: "2026-07-24",
      duration: 60,
      scheduleMode: "flexible",
      priority: "medium",
      difficulty: 2,
      energy: 2,
      mood: "bright",
      category: "work",
      stitch: "contribution",
      project: "Furside",
      title: "CEO responsibilities",
      description: ""
    },
    {
      id: "task-1784877401012",
      status: "todo",
      due: "2026-07-24",
      duration: 120,
      scheduleMode: "flexible",
      priority: "high",
      difficulty: 4,
      energy: 3,
      mood: "good",
      category: "work",
      stitch: "growth",
      project: "Woven",
      title: "woven app structure",
      description: ""
    },
    {
      id: "task-1784877449501",
      status: "todo",
      due: "2026-07-24",
      duration: 10,
      scheduleMode: "flexible",
      priority: "low",
      difficulty: 3,
      energy: 3,
      mood: "heavy",
      category: "body",
      stitch: "maintenance",
      project: "General",
      title: "laundry",
      description: ""
    },
    {
      id: "task-1784877496398",
      status: "todo",
      due: "2026-07-24",
      duration: 30,
      scheduleMode: "flexible",
      priority: "critical",
      difficulty: 2,
      energy: 3,
      mood: "neutral",
      category: "work",
      stitch: "contribution",
      project: "Bletchley",
      title: "prepare for rony meeting",
      description: ""
    }
  ],
  checkins: [
    {
      id: "checkin-1",
      profileId: "ana",
      date: todayIso(),
      energy: 68,
      mood: 72,
      focus: 64,
      note: "Clear morning, softer afternoon."
    }
  ],
  preferences: {},
  planningProfiles: {},
  dailyIntentions: [],
  reflections: [],
  notificationPreferences: {},
  notificationPlans: [],
  learnedAdjustments: {}
};

const persistDb = async () => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    dataFile,
    JSON.stringify(
      {
        currentProfileId: db.currentProfileId,
        profiles: db.profiles,
        tasks: db.tasks,
        meetings: db.meetings,
        checkins: db.checkins,
        preferences: db.preferences,
        planningProfiles: db.planningProfiles,
        dailyIntentions: db.dailyIntentions,
        reflections: db.reflections,
        notificationPreferences: db.notificationPreferences,
        notificationPlans: db.notificationPlans,
        learnedAdjustments: db.learnedAdjustments
      },
      null,
      2
    )
  );
};

const loadPersistedDb = async () => {
  if (!existsSync(dataFile)) {
    await persistDb();
    return;
  }
  const saved = JSON.parse(await readFile(dataFile, "utf8"));
  if (saved.currentProfileId) db.currentProfileId = saved.currentProfileId;
  if (Array.isArray(saved.profiles)) db.profiles = saved.profiles;
  if (Array.isArray(saved.tasks)) db.tasks = saved.tasks;
  if (Array.isArray(saved.meetings)) db.meetings = saved.meetings;
  if (Array.isArray(saved.checkins)) db.checkins = saved.checkins;
  if (saved.preferences && typeof saved.preferences === "object") db.preferences = saved.preferences;
  if (saved.planningProfiles && typeof saved.planningProfiles === "object") db.planningProfiles = saved.planningProfiles;
  if (Array.isArray(saved.dailyIntentions)) db.dailyIntentions = saved.dailyIntentions;
  if (Array.isArray(saved.reflections)) db.reflections = saved.reflections;
  if (saved.notificationPreferences && typeof saved.notificationPreferences === "object") db.notificationPreferences = saved.notificationPreferences;
  if (Array.isArray(saved.notificationPlans)) db.notificationPlans = saved.notificationPlans;
  if (saved.learnedAdjustments && typeof saved.learnedAdjustments === "object") db.learnedAdjustments = saved.learnedAdjustments;
};

const exportUserState = (profileId = db.currentProfileId) => ({
  profile: db.profiles.find((item) => item.id === profileId) || db.profiles[0],
  preferences: db.preferences[profileId] || {},
  planningProfile: db.planningProfiles[profileId] || {},
  tasks: db.tasks,
  meetings: db.meetings,
  checkins: db.checkins.filter((item) => item.profileId === profileId),
  dailyIntentions: db.dailyIntentions.filter((item) => item.profileId === profileId),
  reflections: db.reflections.filter((item) => item.profileId === profileId),
  notificationPreferences: db.notificationPreferences[profileId] || {},
  notificationPlans: db.notificationPlans.filter((item) => item.userId === profileId),
  learnedAdjustments: db.learnedAdjustments[profileId] || {}
});

const applyAccountState = (user, row) => {
  const profile = {
    ...(row?.profile || {}),
    id: user.id,
    name: row?.profile?.name || user.name || "Ana",
    role: row?.profile?.role || "Woven user",
    workHours: row?.profile?.workHours || { start: "09:00", end: "18:00" },
    energyPattern: row?.profile?.energyPattern || db.profiles[0].energyPattern
  };
  db.currentProfileId = user.id;
  db.profiles = [profile];
  db.preferences = { [user.id]: row?.preferences || {} };
  db.planningProfiles = { [user.id]: row?.planning_profile || row?.planningProfile || {} };
  db.tasks = row?.tasks || [];
  db.meetings = row?.meetings || [];
  db.checkins = (row?.checkins || []).map((item) => ({ ...item, profileId: user.id, userId: user.id }));
  db.dailyIntentions = (row?.daily_intentions || row?.dailyIntentions || []).map((item) => ({ ...item, profileId: user.id, userId: user.id }));
  db.reflections = (row?.reflections || []).map((item) => ({ ...item, profileId: user.id, userId: user.id }));
  db.notificationPreferences = { [user.id]: row?.notification_preferences || row?.notificationPreferences || {} };
  db.notificationPlans = (row?.notification_plans || row?.notificationPlans || []).map((item) => ({ ...item, userId: user.id }));
  db.learnedAdjustments = { [user.id]: row?.learned_adjustments || row?.learnedAdjustments || {} };
};

const persistUserState = async (profileId = db.currentProfileId) => {
  if (hasDatabase()) await saveAccountState(profileId, exportUserState(profileId));
  await persistDb();
};

const authContext = async (request) => {
  const token = cookieValue(request, sessionCookieName);
  const user = await userFromToken(token);
  if (!user) return { user: null, token };
  const accountState = await loadAccountState(user.id);
  applyAccountState(user, accountState);
  return { user, token };
};

const requireUser = async (request, response) => {
  const context = await authContext(request);
  if (!context.user) {
    json(response, 401, { error: "Please log in to continue." });
    return null;
  }
  return context;
};

const periodFor = (time) => {
  const value = typeof time === "number" ? time : minutes(time);
  if (value < 12 * 60) return "morning";
  if (value < 14 * 60) return "midday";
  if (value < 18 * 60) return "afternoon";
  return "evening";
};

const dayName = (date) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

const latestCheckin = (profileId, date) =>
  [...db.checkins].reverse().find((item) => item.profileId === profileId && item.date === date);

const planningProfileFor = (profileId) => {
  const legacyProfile = db.profiles.find((item) => item.id === profileId) || db.profiles[0];
  if (!db.planningProfiles[profileId]) {
    db.planningProfiles[profileId] = profileFromPreferences(profileId, db.preferences[profileId] || {}, legacyProfile);
  }
  return db.planningProfiles[profileId];
};

const dailyIntentionFor = (profileId, date) =>
  [...db.dailyIntentions].reverse().find((item) => item.profileId === profileId && item.date === date)?.goal || "stay_balanced";

const planningCheckinsFor = (profileId, date) =>
  db.checkins
    .filter((item) => item.profileId === profileId && item.date === date)
    .map((item) => ({
      ...item,
      userId: item.profileId,
      energy: Number(item.energy) > 5 ? Math.max(1, Math.round(Number(item.energy) / 20)) : Number(item.energy || 3),
      mood: Number(item.mood) > 5 ? Math.max(1, Math.round(Number(item.mood) / 20)) : Number(item.mood || 3)
    }));

const priorityWeight = {
  low: 1,
  medium: 3,
  high: 4,
  critical: 5
};

const moodWeight = {
  drained: 1,
  heavy: 1,
  neutral: 2,
  calm: 3,
  good: 4,
  bright: 5,
  excited: 5
};

const validMoods = ["drained", "heavy", "neutral", "calm", "good", "bright", "excited"];
const validStitches = ["growth", "maintenance", "joy", "contribution"];

const energyForSlot = (profile, date, slotStart) => {
  const pattern = profile.energyPattern[dayName(date)] || profile.energyPattern.monday;
  const base = pattern[periodFor(slotStart)] || 60;
  const checkin = latestCheckin(profile.id, date);
  if (!checkin) return base;
  return Math.round(base * 0.65 + checkin.energy * 0.25 + checkin.focus * 0.1);
};

const scoreTask = (task, slotStart, profile, date) => {
  const slotEnergy = energyForSlot(profile, date, slotStart);
  const requiredEnergy = task.energy * 20;
  const energyFit = 100 - Math.abs(slotEnergy - requiredEnergy);
  const urgency = task.due === date ? 18 : 0;
  const mood = latestCheckin(profile.id, date)?.mood ?? 65;
  const taskMood = moodWeight[task.mood] || 3;
  const softness = mood < 50 ? taskMood * 3 : 0;
  return (priorityWeight[task.priority] || 3) * 22 + energyFit * 0.7 - task.difficulty * 5 + taskMood * 4 + urgency + softness;
};

const subtractBusy = (windows, busy) => {
  let open = [...windows];
  for (const block of busy) {
    const next = [];
    for (const window of open) {
      if (block.end <= window.start || block.start >= window.end) {
        next.push(window);
        continue;
      }
      if (block.start > window.start) next.push({ start: window.start, end: block.start });
      if (block.end < window.end) next.push({ start: block.end, end: window.end });
    }
    open = next;
  }
  return open.filter((window) => window.end - window.start >= 20);
};

const clipPastWindows = (windows, date) => {
  if (date !== todayIso()) return windows;
  const now = nowMinutes();
  return windows
    .map((window) => ({ ...window, start: Math.max(window.start, now) }))
    .filter((window) => window.end - window.start >= 20);
};

const selfCareLibrary = [
  { title: "Walk outside", category: "body", duration: 30, energy: 2, mood: "bright", preferred: ["16:00", "19:30"] },
  { title: "Quiet lunch away from the desk", category: "mind", duration: 45, energy: 1, mood: "good", preferred: ["12:00", "14:30"] },
  { title: "Message a friend", category: "social", duration: 20, energy: 2, mood: "bright", preferred: ["17:30", "21:00"] },
  { title: "Stretch and reset", category: "body", duration: 15, energy: 1, mood: "good", preferred: ["14:00", "17:30"] },
  { title: "Evening buffer", category: "mind", duration: 30, energy: 1, mood: "good", preferred: ["19:00", "21:00"] }
];

const fitPreferredWindow = (window, preferred, duration) => {
  const preferredStart = minutes(preferred[0]);
  const preferredEnd = minutes(preferred[1]);
  const start = Math.max(window.start, preferredStart);
  const end = Math.min(window.end, preferredEnd);
  if (end - start < duration) return null;
  return { start, end };
};

function buildSchedule(profileId = db.currentProfileId, date = todayIso()) {
  const legacyProfile = db.profiles.find((item) => item.id === profileId) || db.profiles[0];
  const planningProfile = planningProfileFor(legacyProfile.id);
  const intention = dailyIntentionFor(legacyProfile.id, date);
  const checkins = planningCheckinsFor(legacyProfile.id, date);
  const latest = [...checkins].reverse()[0];
  const meetings = db.meetings.filter((item) => item.date === date).map((item) => ({ ...item, category: "work", thread: "work" }));
  const taskPool = db.tasks
    .filter((task) => !task.due || task.due <= date)
    .map((task) => ({
      ...task,
      thread: task.thread || task.category,
      energyDemand: task.energyDemand || task.energy,
      estimatedDurationMinutes: task.estimatedDurationMinutes || task.duration,
      flexibility: task.flexibility || (task.scheduleMode === "fixed" ? "fixed" : "flexible")
    }));
  const result = generateSchedule({
    date,
    profile: planningProfile,
    dailyGoal: intention,
    latestEnergy: latest?.energy || 3,
    latestMood: latest?.mood || 3,
    existingTasks: taskPool,
    existingMeetings: meetings,
    recentCheckIns: checkins,
    recentReflections: db.reflections.filter((item) => item.profileId === legacyProfile.id),
    learnedAdjustments: db.learnedAdjustments[legacyProfile.id] || {}
  });
  const allItems = result.recommendedSchedule.map((item) => ({
    id: item.id,
    type: item.type || "task",
    title: item.title,
    description: item.description,
    project: item.project || "Woven",
    category: item.category || item.thread,
    thread: item.thread || item.category,
    source: item.source,
    priority: item.priority,
    difficulty: item.difficulty,
    mood: item.mood,
    stitch: item.stitch,
    status: item.status,
    scheduleMode: item.scheduleMode || (item.flexibility === "fixed" ? "fixed" : "flexible"),
    start: item.start,
    end: item.end,
    energy: item.energy || item.energyDemand,
    requiredEnergy: item.energyDemand || item.energy,
    slotEnergy: item.slotEnergy,
    reasons: item.reasons || []
  }));
  return {
    profile: legacyProfile,
    planningProfile,
    date,
    timeZone: appTimeZone,
    currentTime: date === todayIso() ? toTime(nowMinutes()) : null,
    checkin: latestCheckin(legacyProfile.id, date),
    dailyIntention: intention,
    items: allItems,
    unscheduled: result.unscheduledTasks,
    warnings: result.warnings,
    explanation: result.explanation,
    capacitySummary: result.capacitySummary,
    debug: result.debug,
    rhythm: legacyProfile.energyPattern[dayName(date)] || legacyProfile.energyPattern.monday
  };
}

function buildAnalytics(profileId = db.currentProfileId) {
  const profile = db.profiles.find((item) => item.id === profileId) || db.profiles[0];
  const schedule = buildSchedule(profile.id, todayIso()).items;
  const totals = {};
  const projects = {};
  for (const item of schedule) {
    const duration = minutes(item.end) - minutes(item.start);
    totals[item.category] = (totals[item.category] || 0) + duration;
    projects[item.project || item.category] = (projects[item.project || item.category] || 0) + duration;
  }
  const totalMinutes = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  return {
    profileId: profile.id,
    balance: Object.entries(totals).map(([name, value]) => ({
      name,
      minutes: value,
      percent: Math.round((value / totalMinutes) * 100)
    })),
    projects: Object.entries(projects).map(([name, value]) => ({
      name,
      minutes: value,
      percent: Math.round((value / totalMinutes) * 100)
    })),
    targets: profile.weeklyIntentions,
    insight:
      (totals.work || 0) > (totals.personal || 0) * 4
        ? "Today is work-heavy. Woven protected a few small recovery pockets so the day has room to breathe."
        : "Today has a workable balance between focus, care, and personal time."
  };
}

const json = (response, status, body, headers = {}) => {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
};

const parseBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

export const api = async (request, response, url) => {
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const context = await authContext(request);
    return json(response, 200, { user: context.user, databaseConnected: hasDatabase() });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/signup") {
    const body = await parseBody(request);
    const name = body.name || "Ana";
    const appState = exportUserState();
    appState.profile = { ...appState.profile, name, id: undefined };
    const { user, session } = await createAccount({ email: body.email, name, password: body.password, appState });
    const row = await loadAccountState(user.id);
    applyAccountState(user, row);
    return json(response, 201, { user }, { "set-cookie": authCookie(session.token, session.expiresAt) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await parseBody(request);
    const { user, session } = await loginAccount({ email: body.email, password: body.password });
    const row = await loadAccountState(user.id);
    applyAccountState(user, row);
    return json(response, 200, { user }, { "set-cookie": authCookie(session.token, session.expiresAt) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookieValue(request, sessionCookieName);
    await logoutToken(token);
    return json(response, 200, { loggedOut: true }, { "set-cookie": clearAuthCookie() });
  }

  if (request.method === "DELETE" && url.pathname === "/api/auth/account") {
    const context = await requireUser(request, response);
    if (!context) return;
    await deleteAccount(context.user.id);
    return json(response, 200, { deleted: true }, { "set-cookie": clearAuthCookie() });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const context = await requireUser(request, response);
    if (!context) return;
    return json(response, 200, { message: "Password reset email delivery is ready for a transactional email provider." });
  }

  const publicAuthPaths = ["/api/auth/me", "/api/auth/signup", "/api/auth/login"];
  if (!publicAuthPaths.includes(url.pathname)) {
    const context = await requireUser(request, response);
    if (!context) return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    return json(response, 200, {
      profiles: db.profiles,
      currentProfileId: db.currentProfileId,
      tasks: db.tasks,
      meetings: db.meetings,
      checkins: db.checkins,
      preferences: db.preferences,
      planningProfiles: db.planningProfiles,
      dailyIntentions: db.dailyIntentions,
      reflections: db.reflections,
      notificationPreferences: db.notificationPreferences,
      notificationPlans: db.notificationPlans,
      learnedAdjustments: db.learnedAdjustments
    });
  }

  if (request.method === "POST" && url.pathname === "/api/preferences") {
    const body = await parseBody(request);
    const profileId = body.profileId || db.currentProfileId;
    db.preferences[profileId] = {
      ...(db.preferences[profileId] || {}),
      ...body.preferences,
      completedAt: new Date().toISOString()
    };
    const legacyProfile = db.profiles.find((item) => item.id === profileId) || db.profiles[0];
    db.planningProfiles[profileId] = profileFromPreferences(profileId, db.preferences[profileId], legacyProfile);
    if (body.preferences?.callName) {
      const profile = db.profiles.find((item) => item.id === profileId);
      if (profile) profile.name = body.preferences.callName;
    }
    await persistUserState(profileId);
    return json(response, 200, { profileId, preferences: db.preferences[profileId], planningProfile: db.planningProfiles[profileId] });
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/planning-profile/")) {
    const profileId = url.pathname.split("/").pop() || db.currentProfileId;
    const planningProfile = planningProfileFor(profileId);
    return json(response, 200, { profileId, planningProfile, validation: validatePlanningProfile(planningProfile) });
  }

  if (request.method === "POST" && url.pathname === "/api/planning-profile") {
    const body = await parseBody(request);
    const profileId = body.profileId || db.currentProfileId;
    const planningProfile = {
      ...planningProfileFor(profileId),
      ...body.profile,
      userId: profileId,
      updatedAt: new Date().toISOString()
    };
    const validation = validatePlanningProfile(planningProfile);
    if (!validation.valid) return json(response, 422, { error: "Invalid planning profile", validation });
    db.planningProfiles[profileId] = planningProfile;
    await persistUserState(profileId);
    return json(response, 200, { profileId, planningProfile, validation });
  }

  if (request.method === "POST" && url.pathname === "/api/daily-intentions") {
    const body = await parseBody(request);
    const profileId = body.profileId || db.currentProfileId;
    const date = body.date || todayIso();
    const goal = dailyGoals.includes(body.goal) ? body.goal : "stay_balanced";
    const existing = db.dailyIntentions.find((item) => item.profileId === profileId && item.date === date);
    if (existing) {
      existing.goal = goal;
      existing.updatedAt = new Date().toISOString();
      await persistUserState(profileId);
      return json(response, 200, existing);
    }
    const intention = { id: `intention-${Date.now()}`, profileId, userId: profileId, date, goal, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.dailyIntentions.push(intention);
    await persistUserState(profileId);
    return json(response, 201, intention);
  }

  if (request.method === "GET" && url.pathname === "/api/schedule") {
    return json(response, 200, buildSchedule(url.searchParams.get("profileId") || undefined, url.searchParams.get("date") || todayIso()));
  }

  if (request.method === "GET" && url.pathname === "/api/analytics") {
    return json(response, 200, buildAnalytics(url.searchParams.get("profileId") || undefined));
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    const body = await parseBody(request);
    const scheduleMode = body.scheduleMode === "fixed" ? "fixed" : "flexible";
    const fixedRange =
      scheduleMode === "fixed" && fixedTaskRange({ scheduleMode, fixedStart: body.fixedStart, fixedEnd: body.fixedEnd });
    const duration = fixedRange ? fixedRange.end - fixedRange.start : Number(body.duration || 45);
    const due = body.due || todayIso();
    const priority = ["low", "medium", "high", "critical"].includes(body.priority) ? body.priority : "medium";
    if (priority === "critical" && activeCriticalCount(db.tasks, due) >= 2) {
      return json(response, 409, { error: "You already have two critical tasks for this day. Move, complete, or lower the priority of one before adding another." });
    }
    const task = {
      id: `task-${Date.now()}`,
      status: "todo",
      due,
      duration,
      estimatedDurationMinutes: duration,
      scheduleMode,
      flexibility: scheduleMode === "fixed" ? "fixed" : "flexible",
      fixedStart: fixedRange ? body.fixedStart : undefined,
      fixedEnd: fixedRange ? body.fixedEnd : undefined,
      priority,
      difficulty: Number(body.difficulty || 3),
      energy: Number(body.energy || 3),
      energyDemand: Number(body.energy || 3),
      mood: validMoods.includes(body.mood) ? body.mood : "neutral",
      category: ["work", "social", "body", "mind"].includes(body.category) ? body.category : "work",
      thread: ["work", "social", "body", "mind"].includes(body.category) ? body.category : "work",
      stitch: validStitches.includes(body.stitch) ? body.stitch : "maintenance",
      project: body.project || "General",
      title: body.title || "Untitled task",
      description: body.description || ""
    };
    db.tasks.push(task);
    await persistUserState(db.currentProfileId);
    return json(response, 201, task);
  }

  if (request.method === "DELETE" && url.pathname === "/api/tasks") {
    db.tasks = [];
    await persistUserState(db.currentProfileId);
    return json(response, 200, { deleted: true, tasks: db.tasks });
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/tasks/")) {
    const id = url.pathname.split("/").pop();
    const initialLength = db.tasks.length;
    db.tasks = db.tasks.filter((item) => item.id !== id);
    if (db.tasks.length === initialLength) return json(response, 404, { error: "Task not found" });
    await persistUserState(db.currentProfileId);
    return json(response, 200, { deleted: true, id });
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/tasks/")) {
    const id = url.pathname.split("/").pop();
    const task = db.tasks.find((item) => item.id === id);
    if (!task) return json(response, 404, { error: "Task not found" });
    const body = await parseBody(request);
    const nextPriority = body.priority || task.priority;
    const nextDue = body.due || task.due || todayIso();
    if (nextPriority === "critical" && task.priority !== "critical" && activeCriticalCount(db.tasks, nextDue, id) >= 2) {
      return json(response, 409, { error: "You already have two critical tasks for this day. Move, complete, or lower the priority of one before adding another." });
    }
    Object.assign(task, body);
    task.thread = task.thread || task.category;
    task.category = task.category || task.thread;
    task.energyDemand = Number(task.energyDemand || task.energy || 3);
    task.estimatedDurationMinutes = Number(task.estimatedDurationMinutes || task.duration || 45);
    if (body.status === "done" && !task.completedAt) task.completedAt = new Date().toISOString();
    if (body.status && body.status !== "done") delete task.completedAt;
    await persistUserState(db.currentProfileId);
    return json(response, 200, task);
  }

  if (request.method === "POST" && url.pathname === "/api/checkins") {
    const body = await parseBody(request);
    const profileId = body.profileId || db.currentProfileId;
    const checkin = {
      id: `checkin-${Date.now()}`,
      profileId,
      userId: profileId,
      date: body.date || todayIso(),
      timestamp: new Date().toISOString(),
      type: ["morning", "daytime", "evening"].includes(body.type) ? body.type : "morning",
      energy: Number(body.energy || 3),
      mood: Number(body.mood || 3),
      focus: Number(body.focus || body.energy || 3),
      note: body.note || ""
    };
    db.checkins.push(checkin);
    await persistUserState(profileId);
    return json(response, 201, checkin);
  }

  if (request.method === "POST" && url.pathname === "/api/reflections") {
    const body = await parseBody(request);
    const profileId = body.profileId || db.currentProfileId;
    const reflection = {
      id: `reflection-${Date.now()}`,
      profileId,
      userId: profileId,
      date: body.date || todayIso(),
      satisfaction: Number(body.satisfaction || 3),
      didWhatTheyIntended: ["yes", "partly", "no"].includes(body.didWhatTheyIntended) ? body.didWhatTheyIntended : "partly",
      energyAtEnd: Number(body.energyAtEnd || 3),
      note: body.note || "",
      createdAt: new Date().toISOString()
    };
    db.reflections.push(reflection);
    db.learnedAdjustments[profileId] = calculateLearnedAdjustments(
      db.reflections.filter((item) => item.profileId === profileId),
      db.learnedAdjustments[profileId]
    );
    await persistUserState(profileId);
    return json(response, 201, { reflection, learnedAdjustments: db.learnedAdjustments[profileId] });
  }

  if (request.method === "POST" && url.pathname === "/api/learned-adjustments/reset") {
    const body = await parseBody(request);
    const profileId = body.profileId || db.currentProfileId;
    db.learnedAdjustments[profileId] = { capacityModifier: 1, periodEnergyModifiers: {}, weekdayModifiers: {}, updatedAt: new Date().toISOString() };
    await persistUserState(profileId);
    return json(response, 200, db.learnedAdjustments[profileId]);
  }

  if (request.method === "POST" && url.pathname === "/api/notifications/preferences") {
    const body = await parseBody(request);
    const profileId = body.profileId || db.currentProfileId;
    db.notificationPreferences[profileId] = {
      ...(db.notificationPreferences[profileId] || {}),
      ...body.preferences,
      updatedAt: new Date().toISOString()
    };
    db.planningProfiles[profileId] = {
      ...planningProfileFor(profileId),
      notificationSettings: {
        ...planningProfileFor(profileId).notificationSettings,
        ...db.notificationPreferences[profileId]
      },
      updatedAt: new Date().toISOString()
    };
    await persistUserState(profileId);
    return json(response, 200, { profileId, notificationPreferences: db.notificationPreferences[profileId] });
  }

  if (request.method === "POST" && url.pathname === "/api/notifications/plan") {
    const body = await parseBody(request);
    const profileId = body.profileId || db.currentProfileId;
    const date = body.date || todayIso();
    const existing = db.notificationPlans.find((item) => item.userId === profileId && item.date === date);
    const schedule = buildSchedule(profileId, date);
    const plan = createDailyNotificationPlan({
      userId: profileId,
      date,
      profile: planningProfileFor(profileId),
      tasks: schedule.items.filter((item) => item.type === "task"),
      meetings: schedule.items.filter((item) => item.type === "meeting"),
      existingPlan: existing
    });
    if (!existing) db.notificationPlans.push(plan);
    await persistUserState(profileId);
    return json(response, 200, plan);
  }

  if (request.method === "POST" && url.pathname === "/api/calendar/teams/sync") {
    return json(response, 200, {
      status: "mocked",
      message: "Teams calendar sync boundary is ready for Microsoft Graph OAuth. Sample Teams meetings are loaded for the prototype.",
      meetings: db.meetings.filter((item) => item.source === "teams")
    });
  }

  return json(response, 404, { error: "Not found" });
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml"
};

export const ready = loadPersistedDb();
await ready;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname.startsWith("/api/")) return await api(request, response, url);

      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = path.normalize(path.join(publicDir, requested));
      if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
        response.writeHead(302, { location: "/" });
        response.end();
        return;
      }

      const ext = path.extname(filePath);
      response.writeHead(200, { "content-type": contentTypes[ext] || "application/octet-stream" });
      response.end(await readFile(filePath));
    } catch (error) {
      json(response, 500, { error: error.message });
    }
  }).listen(port, () => {
    console.log(`Woven is running at http://localhost:${port}`);
  });
}
