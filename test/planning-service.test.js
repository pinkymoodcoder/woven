import test from "node:test";
import assert from "node:assert/strict";
import {
  activeCriticalCount,
  calculateLearnedAdjustments,
  createDailyNotificationPlan,
  generateSchedule,
  profileFromPreferences,
  scoreTaskPlacement,
  validatePlanningProfile
} from "../lib/planning-service.js";

const profile = profileFromPreferences("ana", {
  threadPoints: { work: 50, mind: 15, body: 15, social: 20 },
  threadPriority: ["work", "body", "mind", "social"],
  workDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  workSchedule: {
    friday: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:30" }]
  },
  dailyEnergy: { morning: 5, afternoon: 2, evening: 3 },
  weeklyEnergy: { friday: 4 },
  structure: 1,
  bufferTarget: 80
});

test("validates thread balance and priority order", () => {
  assert.equal(validatePlanningProfile(profile).valid, true);
  const invalid = { ...profile, threadBalance: { work: 90, mind: 5, body: 5, social: 5 } };
  assert.equal(validatePlanningProfile(invalid).valid, false);
});

test("counts active critical tasks for a day", () => {
  const tasks = [
    { id: "1", priority: "critical", due: "2026-07-24", status: "todo" },
    { id: "2", priority: "critical", due: "2026-07-24", status: "done" },
    { id: "3", priority: "critical", due: "2026-07-24", status: "todo" }
  ];
  assert.equal(activeCriticalCount(tasks, "2026-07-24"), 2);
});

test("scores high-energy tasks better in high-energy slots", () => {
  const task = { id: "deep", title: "Deep work", thread: "work", stitch: "growth", priority: "high", energyDemand: 5, duration: 60 };
  const morning = scoreTaskPlacement({ task, slot: { start: 9 * 60, end: 11 * 60, kind: "work" }, profile, date: "2026-07-24", dailyGoal: "make_progress", latestEnergy: 4 });
  const afternoon = scoreTaskPlacement({ task, slot: { start: 15 * 60, end: 17 * 60, kind: "work" }, profile, date: "2026-07-24", dailyGoal: "make_progress", latestEnergy: 4 });
  assert.ok(morning.score > afternoon.score);
  assert.ok(morning.reasons.length > 0);
});

test("preserve-energy planning creates capacity warnings and leaves tasks unscheduled", () => {
  const tasks = Array.from({ length: 6 }, (_, index) => ({
    id: `task-${index}`,
    title: `High demand ${index}`,
    thread: "work",
    stitch: "growth",
    priority: index < 3 ? "high" : "medium",
    energyDemand: 5,
    duration: 90,
    due: "2026-07-24"
  }));
  const result = generateSchedule({ date: "2026-07-24", profile, dailyGoal: "preserve_energy", latestEnergy: 1, latestMood: 2, existingTasks: tasks });
  assert.ok(result.unscheduledTasks.length > 0);
  assert.ok(result.warnings.some((warning) => ["energy_exceeds_capacity", "unscheduled_tasks", "too_many_high_priority"].includes(warning.code)));
});

test("random daytime notifications are persisted when an existing plan is passed", () => {
  const first = createDailyNotificationPlan({ userId: "ana", date: "2026-07-24", profile, random: () => 0.1 });
  const second = createDailyNotificationPlan({ userId: "ana", date: "2026-07-24", profile, existingPlan: first, random: () => 0.9 });
  assert.equal(first.notifications.find((item) => item.category === "daytime").time, second.notifications.find((item) => item.category === "daytime").time);
});

test("task reminders are scheduled 5 minutes before each scheduled task", () => {
  const plan = createDailyNotificationPlan({
    userId: "ana",
    date: "2026-07-24",
    profile,
    tasks: [{ id: "task-a", title: "Write proposal", start: "10:00", end: "11:00" }]
  });
  const reminder = plan.notifications.find((item) => item.category === "fixedTask" && item.taskId === "task-a");
  assert.equal(reminder.time, "09:55");
  assert.match(reminder.copy, /starts in 5 minutes/);
});

test("learned capacity waits for several reflections and then adapts gently", () => {
  const early = calculateLearnedAdjustments([{ satisfaction: 5, energyAtEnd: 5, didWhatTheyIntended: "yes" }]);
  assert.equal(early.capacityModifier, 1);
  const reflections = Array.from({ length: 5 }, () => ({ satisfaction: 5, energyAtEnd: 5, didWhatTheyIntended: "yes" }));
  const learned = calculateLearnedAdjustments(reflections);
  assert.ok(learned.capacityModifier > 1);
  assert.ok(learned.capacityModifier <= 1.04);
});
