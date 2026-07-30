import {
  dailyGoals,
  goalConfig,
  planningRules,
  priorities,
  priorityScore,
  schedulingWeights,
  stitches,
  threads
} from "./planning-config.js";

export const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const mondayFirst = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const minutes = (time) => {
  const [hours, mins] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + mins;
};

export const toTime = (value) => {
  const normalized = ((value % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60).toString().padStart(2, "0");
  const mins = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
};

export const isValidTime = (time) => /^\d{2}:\d{2}$/.test(time || "") && Number.isFinite(minutes(time));

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
const dateWeekday = (date) => new Date(`${date}T12:00:00`).getDay();
const dayKey = (date) => dayNames[dateWeekday(date)];

const scaleEnergy = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  if (numeric > 5) return clamp(Math.round(numeric / 20), 1, 5);
  return clamp(Math.round(numeric), 1, 5);
};

const normalizeBalance = (value = {}) => {
  const raw = Object.fromEntries(threads.map((thread) => [thread, Math.max(0, Number(value[thread] ?? 25))]));
  const total = Object.values(raw).reduce((sum, item) => sum + item, 0) || 1;
  let assigned = 0;
  return Object.fromEntries(threads.map((thread, index) => {
    const next = index === threads.length - 1 ? 100 - assigned : Math.round((raw[thread] / total) * 100);
    assigned += next;
    return [thread, next];
  }));
};

const normalizePriorityOrder = (order = []) => {
  const unique = order.filter((item, index) => threads.includes(item) && order.indexOf(item) === index);
  return [...unique, ...threads.filter((thread) => !unique.includes(thread))];
};

const normalizeWorkSchedule = (preferences = {}, legacyProfile = {}) => {
  const schedule = preferences.workSchedule || {};
  const enabledDays = new Set(preferences.workDays || ["monday", "tuesday", "wednesday", "thursday", "friday"]);
  return mondayFirst.map((day, index) => {
    const ranges = Array.isArray(schedule[day]) ? schedule[day] : [];
    const timeRanges = ranges
      .filter((range) => isValidTime(range.start) && isValidTime(range.end) && range.start !== range.end)
      .map((range) => ({ start: range.start, end: range.end }));
    if (!timeRanges.length && !preferences.completedAt && enabledDays.has(day) && legacyProfile.workHours) {
      timeRanges.push({ start: legacyProfile.workHours.start, end: legacyProfile.workHours.end });
    }
    return {
      dayOfWeek: index === 6 ? 0 : index + 1,
      day,
      enabled: enabledDays.has(day),
      timeRanges
    };
  });
};

const normalizeDailyEnergy = (preferences = {}, legacyProfile = {}) => {
  const daily = preferences.dailyEnergy || {};
  const fallback = legacyProfile.energyPattern?.monday || {};
  return {
    early_morning: scaleEnergy(daily.early_morning ?? daily.morning ?? fallback.morning ?? 3),
    morning: scaleEnergy(daily.morning ?? fallback.morning ?? 3),
    afternoon: scaleEnergy(daily.afternoon ?? fallback.afternoon ?? 3),
    evening: scaleEnergy(daily.evening ?? fallback.evening ?? 3),
    late_evening: scaleEnergy(daily.late_evening ?? daily.evening ?? fallback.evening ?? 3)
  };
};

const normalizeWeeklyEnergy = (preferences = {}, legacyProfile = {}) =>
  Object.fromEntries(mondayFirst.map((day) => [day, scaleEnergy(preferences.weeklyEnergy?.[day] ?? legacyProfile.energyPattern?.[day]?.morning ?? 3)]));

export function profileFromPreferences(profileId, preferences = {}, legacyProfile = {}) {
  const structureMap = ["flexible", "balanced", "structured"];
  const now = new Date().toISOString();
  return {
    userId: profileId,
    threadBalance: normalizeBalance(preferences.threadPoints || preferences.threadBalance),
    threadPriorityOrder: normalizePriorityOrder(preferences.threadPriority || preferences.threadPriorityOrder),
    workSchedule: normalizeWorkSchedule(preferences, legacyProfile),
    dailyEnergyPattern: normalizeDailyEnergy(preferences, legacyProfile),
    weeklyEnergyPattern: normalizeWeeklyEnergy(preferences, legacyProfile),
    structurePreference: structureMap[Number(preferences.structure)] || preferences.structurePreference || "balanced",
    planningCapacityPercent: clamp(preferences.bufferTarget || preferences.planningCapacityPercent || 80, 50, 100),
    notificationSettings: defaultNotificationSettings(preferences.notificationSettings),
    createdAt: preferences.createdAt || now,
    updatedAt: now
  };
}

export function validatePlanningProfile(profile) {
  const errors = [];
  const balanceTotal = Object.values(profile.threadBalance || {}).reduce((sum, value) => sum + Number(value), 0);
  if (balanceTotal !== 100) errors.push("Thread balance must total 100.");
  if (normalizePriorityOrder(profile.threadPriorityOrder).join(",") !== (profile.threadPriorityOrder || []).join(",")) {
    errors.push("Thread priority order must contain Work, Mind, Body, and Social exactly once.");
  }
  for (const day of profile.workSchedule || []) {
    for (const range of day.timeRanges || []) {
      if (!isValidTime(range.start) || !isValidTime(range.end) || range.start === range.end) errors.push(`Invalid work range for ${day.day}.`);
    }
  }
  if (!["flexible", "balanced", "structured"].includes(profile.structurePreference)) errors.push("Structure preference is invalid.");
  return { valid: errors.length === 0, errors };
}

export function defaultNotificationSettings(existing = {}) {
  return {
    enabled: false,
    quietHours: { start: "22:00", end: "07:00" },
    morning: true,
    daytime: true,
    evening: true,
    intention: true,
    fixedTask: true,
    adjustment: true,
    morningWindow: "08:30",
    eveningWindow: "20:30",
    ...existing
  };
}

export function normalizeTask(task = {}) {
  const fixed = task.flexibility === "fixed" || task.scheduleMode === "fixed";
  return {
    ...task,
    thread: threads.includes(task.thread) ? task.thread : threads.includes(task.category) ? task.category : "work",
    category: threads.includes(task.category) ? task.category : threads.includes(task.thread) ? task.thread : "work",
    stitch: stitches.includes(task.stitch) ? task.stitch : "maintenance",
    priority: priorities.includes(task.priority) ? task.priority : "medium",
    estimatedDurationMinutes: Math.max(10, Number(task.estimatedDurationMinutes || task.duration || 45)),
    duration: Math.max(10, Number(task.duration || task.estimatedDurationMinutes || 45)),
    energyDemand: scaleEnergy(task.energyDemand || task.energy || 3),
    energy: scaleEnergy(task.energy || task.energyDemand || 3),
    flexibility: fixed ? "fixed" : task.flexibility || (task.preferredTimeStart ? "preferred_time" : "flexible"),
    due: task.due,
    deadline: task.deadline || task.due,
    completedAt: task.completedAt || (task.status === "done" ? task.updatedAt || task.completedAt : undefined)
  };
}

export function activeCriticalCount(tasks, date, ignoreId = null) {
  return tasks
    .map(normalizeTask)
    .filter((task) => task.id !== ignoreId)
    .filter((task) => task.priority === "critical" && task.status !== "done" && !task.cancelledAt && !task.archivedAt)
    .filter((task) => (task.due || date) === date)
    .length;
}

const workRangesForDate = (profile, date) => {
  const weekday = dateWeekday(date);
  const day = (profile.workSchedule || []).find((item) => item.dayOfWeek === weekday || item.day === dayNames[weekday]);
  if (!day?.enabled) return [];
  return (day.timeRanges || []).map((range) => {
    const start = minutes(range.start);
    let end = minutes(range.end);
    if (end <= start) end += 1440;
    return { start, end, kind: "work" };
  });
};

const defaultDayWindows = () => [{ start: 8 * 60, end: 21 * 60, kind: "personal" }];

const subtractBusy = (windows, busy, buffer = 0) => {
  let open = windows.map((item) => ({ ...item }));
  for (const block of busy) {
    const next = [];
    const busyStart = block.start - buffer;
    const busyEnd = block.end + buffer;
    for (const window of open) {
      if (busyEnd <= window.start || busyStart >= window.end) {
        next.push(window);
        continue;
      }
      if (busyStart > window.start) next.push({ ...window, end: busyStart });
      if (busyEnd < window.end) next.push({ ...window, start: busyEnd });
    }
    open = next;
  }
  return open.filter((window) => window.end - window.start >= 10);
};

const periodForMinute = (minute) => {
  const value = ((minute % 1440) + 1440) % 1440;
  if (value < 9 * 60) return "early_morning";
  if (value < 12 * 60) return "morning";
  if (value < 17 * 60) return "afternoon";
  if (value < 21 * 60) return "evening";
  return "late_evening";
};

const energyModifier = (energy) => ({ 1: 0.48, 2: 0.62, 3: 0.82, 4: 1, 5: 1.12 }[scaleEnergy(energy)] || 0.82);

export function expectedEnergyForSlot(profile, date, slotStart, latestEnergy = 3, learned = {}) {
  const period = periodForMinute(slotStart);
  const weekday = dayKey(date);
  const base = profile.dailyEnergyPattern?.[period] || 3;
  const weekly = (profile.weeklyEnergyPattern?.[weekday] || 3) / 3;
  const learnedPeriod = learned.periodEnergyModifiers?.[period] || 1;
  const learnedWeekday = learned.weekdayModifiers?.[weekday] || 1;
  return clamp(base * weekly * energyModifier(latestEnergy) * learnedPeriod * learnedWeekday, 1, 5);
}

const durationByThread = (tasks) => {
  const totals = Object.fromEntries(threads.map((thread) => [thread, 0]));
  tasks.map(normalizeTask).forEach((task) => {
    totals[task.thread] += task.estimatedDurationMinutes;
  });
  return totals;
};

const threadBalanceGap = (profile, weekTasks, thread) => {
  const totals = durationByThread(weekTasks);
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  const actual = (totals[thread] / total) * 100;
  return (profile.threadBalance?.[thread] || 25) - actual;
};

const dailyGoalFit = (task, goal) => {
  const config = goalConfig[goal] || goalConfig.stay_balanced;
  let score = 0;
  if (config.preferredThreads.includes(task.thread)) score += 0.45;
  if (config.preferredStitches.includes(task.stitch)) score += 0.45;
  if (task.energyDemand <= config.maxEnergyDemand) score += 0.25;
  if (["preserve_energy", "feel_better", "enjoy_the_day"].includes(goal) && task.energyDemand >= 4) score -= 0.6;
  return score;
};

export function scoreTaskPlacement({ task, slot, profile, date, dailyGoal, latestEnergy, weekTasks = [], learnedAdjustments = {} }) {
  const normalized = normalizeTask(task);
  const expectedEnergy = expectedEnergyForSlot(profile, date, slot.start, latestEnergy, learnedAdjustments);
  const energyMatch = 1 - Math.abs(expectedEnergy - normalized.energyDemand) / 4;
  const deadlineDistance = normalized.deadline ? Math.max(0, (new Date(`${normalized.deadline}T12:00:00`) - new Date(`${date}T12:00:00`)) / 86400000) : 7;
  const urgency = normalized.priority === "critical" ? 1 : normalized.deadline ? Math.max(0, 1 - Math.min(deadlineDistance, 7) / 7) : 0;
  const threadRank = profile.threadPriorityOrder.indexOf(normalized.thread);
  const threadPreference = 1 - Math.max(0, threadRank) / 3;
  const balance = clamp(threadBalanceGap(profile, weekTasks, normalized.thread) / 50, -1, 1);
  const durationFit = clamp((slot.end - slot.start - normalized.estimatedDurationMinutes) / Math.max(normalized.estimatedDurationMinutes, 1), -1, 1);
  const workCompatibility = normalized.thread !== "work" || slot.kind === "work" || normalized.flexibility === "fixed" ? 1 : -1;
  const score =
    priorityScore[normalized.priority] * schedulingWeights.priority +
    urgency * schedulingWeights.urgency +
    energyMatch * schedulingWeights.energyMatch +
    balance * schedulingWeights.threadBalance +
    threadPreference * schedulingWeights.threadPreference +
    dailyGoalFit(normalized, dailyGoal) * schedulingWeights.dailyGoalFit +
    durationFit * schedulingWeights.durationFit +
    (normalized.stitch === "growth" && dailyGoal === "make_progress" ? schedulingWeights.stitchFit : 0) +
    workCompatibility * schedulingWeights.workCompatibility -
    Number(normalized.deferrals || 0) * schedulingWeights.deferralPenalty;
  const reasons = [
    energyMatch > 0.7
      ? `Fits this slot because ${normalized.title} needs ${normalized.energyDemand}/5 energy and this period is expected around ${Math.round(expectedEnergy)}/5.`
      : null,
    balance > 0.2 ? `Suggested because your ${normalized.thread} thread is below its weekly target.` : null,
    urgency > 0.7 ? normalized.priority === "critical" ? "Prioritised because it is marked Critical." : "Prioritised because its deadline is close." : null,
    workCompatibility > 0 && normalized.thread === "work" ? "Kept inside work hours because this is a Work task." : null,
    dailyGoalFit(normalized, dailyGoal) > 0.5 ? `Matches today's goal: ${dailyGoal.replaceAll("_", " ")}.` : null
  ].filter(Boolean).slice(0, 2);
  return { score, reasons, debug: { energyMatch, urgency, balance, threadPreference, durationFit, workCompatibility, expectedEnergy } };
}

const latestCheckinForDate = (checkins, userId, date) =>
  [...checkins].reverse().find((item) => (item.userId === userId || item.profileId === userId) && item.date === date);

const capacityMultiplierFor = (profile, dailyGoal, latestEnergy, learned = {}) => {
  const structure = {
    flexible: planningRules.flexibleCapacityMultiplier,
    balanced: planningRules.balancedStructureCapacityMultiplier,
    structured: planningRules.structuredCapacityMultiplier
  }[profile.structurePreference] || planningRules.balancedStructureCapacityMultiplier;
  const goal = goalConfig[dailyGoal]?.capacityMultiplier || planningRules.balancedCapacityMultiplier;
  const selected = (profile.planningCapacityPercent || 80) / 100;
  return clamp(structure * goal * selected * energyModifier(latestEnergy) * (learned.capacityModifier || 1), 0.25, 1.05);
};

export function generateSchedule(context) {
  const profile = context.profile;
  const date = context.date;
  const dailyGoal = dailyGoals.includes(context.dailyGoal) ? context.dailyGoal : "stay_balanced";
  const latestEnergy = scaleEnergy(context.latestEnergy || latestCheckinForDate(context.recentCheckIns || [], profile.userId, date)?.energy || 3);
  const latestMood = scaleEnergy(context.latestMood || latestCheckinForDate(context.recentCheckIns || [], profile.userId, date)?.mood || 3);
  const buffer = profile.structurePreference === "structured" ? 5 : profile.structurePreference === "flexible" ? planningRules.minimumBufferMinutes : 15;
  const tasks = (context.existingTasks || []).map(normalizeTask);
  const fixedTasks = tasks.filter((task) => task.flexibility === "fixed" && isValidTime(task.fixedStart) && isValidTime(task.fixedEnd));
  const meetings = (context.existingMeetings || []).map((meeting) => normalizeTask({ ...meeting, thread: "work", category: "work", stitch: "contribution", priority: "medium", energyDemand: 3, energy: 3, flexibility: "fixed", fixedStart: meeting.start, fixedEnd: meeting.end, type: "meeting" }));
  const fixedBusy = [...fixedTasks, ...meetings].map((task) => {
    let start = minutes(task.fixedStart || task.start);
    let end = minutes(task.fixedEnd || task.end);
    if (end <= start) end += 1440;
    return { task, start, end };
  }).sort((a, b) => a.start - b.start);
  const allWindows = defaultDayWindows();
  const workWindows = workRangesForDate(profile, date);
  const personalWindows = subtractBusy(allWindows, workWindows, 0);
  const candidateWindows = [...workWindows, ...personalWindows].sort((a, b) => a.start - b.start);
  const openWindows = subtractBusy(candidateWindows, fixedBusy, buffer);
  const rawCapacity = openWindows.reduce((sum, slot) => sum + slot.end - slot.start, 0);
  const capacityMinutes = Math.round(rawCapacity * capacityMultiplierFor(profile, dailyGoal, latestEnergy, context.learnedAdjustments || {}));
  let plannedMinutes = fixedBusy.reduce((sum, item) => sum + item.end - item.start, 0);
  const scheduled = fixedBusy.map(({ task, start, end }) => ({
    ...task,
    type: task.type || "task",
    scheduledStart: toTime(start),
    scheduledEnd: toTime(end),
    start: toTime(start),
    end: toTime(end),
    reasons: task.thread === "work" ? ["Kept inside work hours because this is a Work task."] : ["Kept at its fixed time."]
  }));
  const unscheduledTasks = [];
  const scoredDebug = [];
  const flexibleTasks = tasks.filter((task) => !fixedTasks.some((fixed) => fixed.id === task.id) && task.status !== "done");
  const slots = openWindows.map((slot) => ({ ...slot }));
  const highEnergyByEnd = [];

  for (const task of flexibleTasks) {
    if (plannedMinutes + task.estimatedDurationMinutes > capacityMinutes && task.priority !== "critical") {
      unscheduledTasks.push({ ...task, reason: "Outside today's estimated capacity." });
      continue;
    }
    const allowedSlots = task.thread === "work" ? slots.filter((slot) => slot.kind === "work") : slots;
    let best = null;
    for (const slot of allowedSlots) {
      if (slot.end - slot.start < task.estimatedDurationMinutes) continue;
      if (task.energyDemand >= 4) {
        const adjacentHigh = highEnergyByEnd.filter((item) => Math.abs(item - slot.start) <= buffer + 10).length;
        if (adjacentHigh >= planningRules.highEnergyConsecutiveLimit) continue;
      }
      const scored = scoreTaskPlacement({ task, slot, profile, date, dailyGoal, latestEnergy, weekTasks: context.weekTasks || tasks, learnedAdjustments: context.learnedAdjustments || {} });
      scoredDebug.push({ taskId: task.id, slot: `${toTime(slot.start)}-${toTime(slot.end)}`, score: scored.score, debug: scored.debug });
      if (!best || scored.score > best.score) best = { slot, scored };
    }
    if (!best) {
      unscheduledTasks.push({ ...task, reason: task.thread === "work" ? "No available work-hours slot." : "No available slot." });
      continue;
    }
    const start = best.slot.start;
    const end = start + task.estimatedDurationMinutes;
    scheduled.push({ ...task, type: "task", scheduledStart: toTime(start), scheduledEnd: toTime(end), start: toTime(start), end: toTime(end), reasons: best.scored.reasons });
    if (task.energyDemand >= 4) highEnergyByEnd.push(end);
    plannedMinutes += task.estimatedDurationMinutes;
    best.slot.start = end + buffer;
  }

  const sorted = scheduled.sort((a, b) => minutes(a.start) - minutes(b.start));
  const warnings = validateDayPlan({ profile, date, tasks: sorted, unscheduledTasks, dailyGoal, latestEnergy, latestMood, capacityMinutes, plannedMinutes, rawCapacity });
  return {
    recommendedSchedule: sorted,
    unscheduledTasks,
    warnings,
    explanation: [
      `Planned against a ${Math.round(capacityMinutes)} minute effective capacity.`,
      `Today's goal is ${dailyGoal.replaceAll("_", " ")}.`,
      latestEnergy <= 2 ? "Capacity was softened because today's energy is low." : "Energy fit was considered for each available slot."
    ],
    capacitySummary: { rawCapacity, capacityMinutes, plannedMinutes, latestEnergy, latestMood },
    debug: scoredDebug
  };
}

export function validateDayPlan({ profile, date, tasks, unscheduledTasks = [], dailyGoal, latestEnergy, capacityMinutes, plannedMinutes, rawCapacity }) {
  const activeTasks = tasks.map(normalizeTask).filter((task) => task.status !== "done");
  const warnings = [];
  const highCount = activeTasks.filter((task) => ["high", "critical"].includes(task.priority)).length;
  const criticalCount = activeTasks.filter((task) => task.priority === "critical").length;
  const highEnergyDemand = activeTasks.reduce((sum, task) => sum + (task.energyDemand >= 4 ? task.energyDemand * task.estimatedDurationMinutes : 0), 0);
  const workWindows = workRangesForDate(profile, date);
  const outsideWork = activeTasks.filter((task) => task.thread === "work" && task.flexibility !== "fixed" && task.start && !workWindows.some((range) => minutes(task.start) >= range.start && minutes(task.end) <= range.end));

  if (plannedMinutes > capacityMinutes) warnings.push({ code: "duration_exceeds_capacity", message: `Today has ${plannedMinutes} planned minutes, above your estimated ${capacityMinutes} minute capacity.`, actions: ["Review tasks", "Move suggested tasks", "Keep the plan anyway"] });
  if (latestEnergy <= 2 && highEnergyDemand > capacityMinutes * 2) warnings.push({ code: "energy_exceeds_capacity", message: "Today asks for more high-energy work than your check-in suggests is available.", actions: ["Lighten the rest of today", "Keep the plan anyway"] });
  if (highCount >= planningRules.highPriorityWarningThreshold) warnings.push({ code: "too_many_high_priority", message: `Today has ${highCount} high or critical priority tasks. Consider choosing the few that truly need protection.`, actions: ["Review tasks", "Lower selected priorities", "Keep the plan anyway"] });
  if (criticalCount > planningRules.maxCriticalTasksPerDay) warnings.push({ code: "too_many_critical", message: "You already have two critical tasks for this day. Move, complete, or lower the priority of one before adding another.", actions: ["Review tasks"] });
  if (outsideWork.length) warnings.push({ code: "work_outside_hours", message: `${outsideWork.length} Work task is outside your work schedule.`, actions: ["Move into work hours", "Keep the plan anyway"] });
  if (["preserve_energy", "feel_better", "enjoy_the_day"].includes(dailyGoal) && capacityMinutes > rawCapacity * 0.82) warnings.push({ code: "insufficient_buffer", message: "This day is packed tightly for the goal you chose. Consider leaving more open space.", actions: ["Move suggested tasks", "Keep the plan anyway"] });
  if (unscheduledTasks.length) warnings.push({ code: "unscheduled_tasks", message: `${unscheduledTasks.length} task could not fit cleanly into today.`, actions: ["Review tasks", "Move suggested tasks"] });
  return warnings;
}

export function createDailyNotificationPlan({ userId, date, profile, tasks = [], meetings = [], existingPlan, random = Math.random }) {
  if (existingPlan?.date === date) return existingPlan;
  const settings = profile.notificationSettings || defaultNotificationSettings();
  const scheduledItems = [...tasks, ...meetings].filter((item) => item.start || item.fixedStart);
  const fixedBusy = scheduledItems.map((item) => ({
    start: minutes(item.fixedStart || item.start || "09:00"),
    end: minutes(item.fixedEnd || item.end || "09:30")
  }));
  const pickOpenTime = (start, end) => {
    const options = [];
    for (let value = minutes(start); value <= minutes(end); value += 15) {
      if (!fixedBusy.some((busy) => value >= busy.start && value < busy.end)) options.push(value);
    }
    return toTime(options[Math.floor(random() * options.length)] || minutes(start));
  };
  const firstWork = workRangesForDate(profile, date).sort((a, b) => a.start - b.start)[0];
  const lastTaskEnd = [...fixedBusy].sort((a, b) => b.end - a.end)[0]?.end;
  const taskReminders = settings.fixedTask
    ? scheduledItems.map((item) => {
      const start = minutes(item.fixedStart || item.start);
      return {
        id: `${date}-task-${item.id}`,
        category: "fixedTask",
        taskId: item.id,
        time: toTime(start - 5),
        copy: `${item.title || "Your task"} starts in 5 minutes.`
      };
    })
    : [];
  return {
    userId,
    date,
    timeZone: "Europe/Bucharest",
    notifications: [
      settings.morning ? { id: `${date}-morning`, category: "morning", time: toTime(Math.max(minutes(settings.morningWindow || "08:30"), (firstWork?.start || 9 * 60) - 30)), copy: "Good morning. How are your energy and mood today?" } : null,
      settings.intention ? { id: `${date}-intention`, category: "intention", time: toTime(Math.max(minutes(settings.morningWindow || "08:30") + 5, (firstWork?.start || 9 * 60) - 20)), copy: "What do you need from today?" } : null,
      settings.daytime ? { id: `${date}-daytime`, category: "daytime", time: pickOpenTime(planningRules.daytimeCheckinWindow.start, planningRules.daytimeCheckinWindow.end), copy: "Small check-in: how are you feeling now?" } : null,
      settings.evening ? { id: `${date}-evening`, category: "evening", time: toTime(Math.max(minutes(settings.eveningWindow || "20:30"), (lastTaskEnd || 18 * 60) + 30)), copy: "How did today's weave feel?" } : null
    ].filter(Boolean).concat(taskReminders),
    createdAt: new Date().toISOString()
  };
}

export function calculateLearnedAdjustments(reflections = [], previous = {}) {
  if (reflections.length < 3) return { capacityModifier: previous.capacityModifier || 1, periodEnergyModifiers: previous.periodEnergyModifiers || {}, weekdayModifiers: previous.weekdayModifiers || {}, updatedAt: new Date().toISOString() };
  const recent = reflections.slice(-14);
  const satisfaction = recent.reduce((sum, item) => sum + Number(item.satisfaction || 3), 0) / recent.length;
  const energyEnd = recent.reduce((sum, item) => sum + Number(item.energyAtEnd || 3), 0) / recent.length;
  const intendedRate = recent.filter((item) => item.didWhatTheyIntended === "yes").length / recent.length;
  const target = satisfaction >= 4 && energyEnd >= 3.5 && intendedRate > 0.65 ? 1.04 : satisfaction < 2.7 || energyEnd < 2.3 ? 0.94 : 1;
  const current = previous.capacityModifier || 1;
  return {
    capacityModifier: clamp(current + clamp(target - current, -0.04, 0.04), 0.75, 1.15),
    periodEnergyModifiers: previous.periodEnergyModifiers || {},
    weekdayModifiers: previous.weekdayModifiers || {},
    updatedAt: new Date().toISOString()
  };
}
