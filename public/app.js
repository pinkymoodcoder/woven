const state = {
  profileId: null,
  schedule: null,
  source: null,
  notificationTimers: new Map(),
  authMode: "signup",
  user: null,
  meetingStatus: {},
  activeView: "today",
  calendarView: "week",
  threadFilter: "all",
  energyView: "day"
};
const quizState = {
  step: 0,
  threadPriority: ["work", "body", "mind", "social"],
  choicePriority: ["priority", "threadBalance", "energyMatch", "duration"]
};

const $ = (selector) => document.querySelector(selector);
const appTimeZone = "Europe/Bucharest";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: appTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

const minuteSteps = [0, 10, 15, 30, 45];
const difficultyLabels = ["Very light", "Light", "Moderate", "Demanding", "Deep work"];
const energyLabels = ["Tiny spark", "Gentle", "Steady", "High", "Peak"];
const priorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};
const stitchLabels = {
  growth: "Growth",
  maintenance: "Maintenance",
  joy: "Joy",
  contribution: "Contribution"
};
const pageMeta = {
  today: { eyebrow: "Today", title: "Your rhythm" },
  calendar: { eyebrow: "Calendar", title: "Your time, woven" },
  week: { eyebrow: "Week", title: "The weekly read" },
  "energy-map": { eyebrow: "Energy map", title: "Your energy pattern" }
};
const labelFor = {
  work: "Work",
  social: "Social",
  body: "Body",
  mind: "Mind"
};
const colorFor = {
  work: "#ff8c36",
  social: "#ea6779",
  mind: "#649ed1",
  body: "#78b483"
};
const threadShadeFor = {
  work: ["#ffede1", "#ffc69c", "#ff8c36"],
  social: ["#fae9eb", "#fbb9c2", "#ea6779"],
  mind: ["#ced9e3", "#bbdfff", "#649ed1"],
  body: ["#e8ebe8", "#b7e2bf", "#78b483"]
};
const stitchShadeFor = {
  growth: threadShadeFor.body,
  maintenance: threadShadeFor.mind,
  joy: threadShadeFor.work,
  contribution: threadShadeFor.social
};
const orbFields = {
  work: { position: "42% 62%", weight: 1.08 },
  social: { position: "34% 32%", weight: 0.98 },
  mind: { position: "70% 43%", weight: 1 },
  body: { position: "58% 76%", weight: 0.92 }
};
const iconFor = {
  work: "&#9670;",
  social: "&#9825;",
  mind: "&#9680;",
  body: "&#9679;"
};
const moodScores = {
  drained: 15,
  heavy: 30,
  neutral: 55,
  calm: 68,
  good: 78,
  bright: 90,
  excited: 94
};
const moodEmojiForTask = {
  drained: "\u{1f62d}",
  heavy: "\u{1f614}",
  neutral: "\u{1f610}",
  calm: "\u{1f60c}",
  good: "\u{1f642}",
  bright: "\u2728",
  excited: "\u{1f929}"
};
const checkinMoodLabels = ["Very low", "Low", "Neutral", "Good", "Bright"];
const checkinMoodEmoji = ["\u{1f614}", "\u{1f641}", "\u{1f610}", "\u{1f642}", "\u2728"];
const reflectionLabels = ["Hard", "Heavy", "Okay", "Good", "Really good"];
const weekDayLabels = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const choiceLabels = {
  priority: "Priority",
  threadBalance: "Thread balance",
  energyMatch: "Energy match",
  duration: "Estimated duration"
};
const structureLabels = [
  { title: "\u{1f33f} Flexible", copy: "Woven can move tasks around and leave room for spontaneous moments." },
  { title: "\u2696 Balanced", copy: "Woven keeps a plan but adapts when life changes." },
  { title: "\u{1f3af} Highly Structured", copy: "Once your day is planned, avoid unnecessary changes." }
];
const dailyGoalLabels = {
  accomplish_more: "Get as much done as possible",
  preserve_energy: "Preserve my energy",
  enjoy_the_day: "Enjoy my time",
  feel_better: "Feel better",
  make_progress: "Make meaningful progress",
  stay_balanced: "Keep the day balanced"
};

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function minutesFromTime(time) {
  const [hours, mins] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + mins;
}

function localMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: appTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value || 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value || 0);
}

async function showWovenNotification(notification) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
  const title = notification.category === "fixedTask" ? "Task starts soon" : "Woven";
  if (registration?.showNotification) {
    await registration.showNotification(title, {
      body: notification.copy,
      tag: notification.id,
      data: "/"
    });
    return;
  }
  new Notification(title, { body: notification.copy, tag: notification.id });
}

function scheduleLocalNotifications(plan) {
  for (const timer of state.notificationTimers.values()) clearTimeout(timer);
  state.notificationTimers.clear();
  const now = localMinutesNow();
  for (const notification of plan.notifications || []) {
    const delayMinutes = minutesFromTime(notification.time) - now;
    if (delayMinutes < 0 || delayMinutes > 24 * 60) continue;
    const timer = setTimeout(() => showWovenNotification(notification), delayMinutes * 60 * 1000);
    state.notificationTimers.set(notification.id, timer);
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  const signup = mode === "signup";
  $("#authEyebrow").textContent = signup ? "Welcome to Woven" : "Welcome back";
  $("#authTitle").textContent = signup ? "Create your account" : "Log in";
  $("#authCopy").textContent = signup ? "Save your rhythm, tasks, check-ins, and planning profile with Neon." : "Return to your woven schedule.";
  $("#authSubmit").textContent = signup ? "Sign up" : "Log in";
  $("#toggleAuthMode").textContent = signup ? "I already have an account" : "Create a new account";
  $("#authForm [name='name']").classList.toggle("is-hidden", !signup);
  $("#authError").textContent = "";
}

function showAuthModal(mode = "signup") {
  setAuthMode(mode);
  $("#authModal").showModal();
}

async function continueAfterAuth(user) {
  state.user = user;
  $("#authModal").close();
  const initial = await api("/api/state");
  state.profileId = initial.currentProfileId;
  state.source = initial;
  renderProfiles(initial.profiles, state.profileId);
  await refresh();
  if (!state.source.preferences?.[state.profileId]?.completedAt) openIntroQuiz();
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours}h ${rest}m`;
}

function parseDate(date) {
  return new Date(`${date}T12:00:00`);
}

function toIsoDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function addDays(date, days) {
  const next = new Date(parseDate(date));
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
}

function weekDates(anchor = today) {
  const date = parseDate(anchor);
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => toIsoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index, 12)));
}

function monthDates(anchor = today) {
  const date = parseDate(anchor);
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length: days }, (_, index) => toIsoDate(new Date(date.getFullYear(), date.getMonth(), index + 1, 12)));
}

function dayLabel(date, options = { weekday: "short", day: "numeric" }) {
  return parseDate(date).toLocaleDateString("en-US", options);
}

function allTasks() {
  return [...(state.source?.tasks || []), ...(state.source?.meetings || []).map((meeting) => ({
    ...meeting,
    type: "meeting",
    status: state.meetingStatus[meeting.id] || "todo",
    category: "work",
    stitch: "contribution",
    priority: "medium",
    energy: 3,
    difficulty: 2,
    duration: durationBetween(meeting.start, meeting.end),
    due: meeting.date || today
  }))];
}

function tasksForDates(dates) {
  const dateSet = new Set(dates);
  return allTasks().filter((task) => dateSet.has(task.due || task.date || today));
}

function countBy(items, key) {
  return items.reduce((result, item) => {
    const value = item[key] || "uncategorized";
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function taskEnergyCost(task) {
  return Math.round(energyDrain({ energy: task.energy || 3, duration: task.duration || 30 }));
}

function renderProfiles(profiles, currentProfileId) {
  const active = profiles.find((profile) => profile.id === currentProfileId);
  $("#profileName").textContent = active?.name || "Profile";
}

function itemSubtitle(item) {
  if (item.type === "meeting") return `${item.project} - Work meeting from Teams`;
  const scheduleLabel = item.scheduleMode === "fixed" ? "Fixed time" : priorityLabels[item.priority] || item.priority;
  const stitch = stitchLabels[item.stitch] || "Maintenance";
  return `${item.project} - ${scheduleLabel} - ${labelFor[item.category] || item.category} - ${stitch}`;
}

function energyLabel(value) {
  const index = Math.max(1, Math.min(5, Number(value || 3))) - 1;
  return energyLabels[index];
}

function latestTodayCheckin(type) {
  return [...(state.source?.checkins || [])].reverse().find((item) => item.profileId === state.profileId && item.date === today && item.type === type);
}

function todayReflection() {
  return [...(state.source?.reflections || [])].reverse().find((item) => item.profileId === state.profileId && item.date === today);
}

function renderPlanningStrip(schedule) {
  const goal = schedule.dailyIntention || "stay_balanced";
  const morning = latestTodayCheckin("morning");
  const daytime = latestTodayCheckin("daytime");
  const reflection = todayReflection();
  $("#planningStrip").innerHTML = `
    <label class="planner-control">
      <span>Today needs</span>
      <select id="dailyGoalSelect">
        ${Object.entries(dailyGoalLabels).map(([value, label]) => `<option value="${value}" ${value === goal ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </label>
    <div class="planner-control">
      <span>Morning</span>
      <button type="button" data-checkin-type="morning">${morning ? `${morning.energy}/5 energy` : "Check in"}</button>
    </div>
    <div class="planner-control">
      <span>Daytime</span>
      <button type="button" data-checkin-type="daytime">${daytime ? `${daytime.mood}/5 mood` : "Check in"}</button>
    </div>
    <div class="planner-control">
      <span>Evening</span>
      <button type="button" id="openReflection">${reflection ? "Reflected" : "Reflect"}</button>
    </div>
  `;
  $("#dailyGoalSelect").addEventListener("change", async (event) => {
    await api("/api/daily-intentions", {
      method: "POST",
      body: JSON.stringify({ profileId: state.profileId, date: today, goal: event.target.value })
    });
    await refresh();
  });
  document.querySelectorAll("[data-checkin-type]").forEach((button) => {
    button.addEventListener("click", () => openCheckinModal(button.dataset.checkinType));
  });
  $("#openReflection").addEventListener("click", openReflectionModal);
}

function renderPlanningWarnings(schedule) {
  const warnings = schedule.warnings || [];
  $("#planningWarnings").innerHTML = warnings.length
    ? warnings.map((warning) => `<article><strong>${warning.message}</strong><span>${(warning.actions || []).join(" / ")}</span></article>`).join("")
    : `<article class="soft-ok">No planning contradictions detected.</article>`;
}

function updateCheckinLabels() {
  const form = $("#checkinForm");
  const energy = Number(form.energy.value);
  const mood = Number(form.mood.value);
  $("[data-checkin-output='energy']").textContent = energyLabels[energy - 1];
  $("[data-checkin-output='mood']").textContent = `${checkinMoodEmoji[mood - 1]} ${checkinMoodLabels[mood - 1]}`;
}

function updateReflectionLabels() {
  const form = $("#reflectionForm");
  const satisfaction = Number(form.satisfaction.value);
  const energyAtEnd = Number(form.energyAtEnd.value);
  $("[data-reflection-output='satisfaction']").textContent = reflectionLabels[satisfaction - 1];
  $("[data-reflection-output='energyAtEnd']").textContent = energyLabels[energyAtEnd - 1];
}

function openCheckinModal(type = "morning") {
  const form = $("#checkinForm");
  form.reset();
  form.type.value = type;
  $("#checkinEyebrow").textContent = type === "daytime" ? "Daytime check-in" : "Morning check-in";
  updateCheckinLabels();
  $("#checkinModal").showModal();
}

function openReflectionModal() {
  $("#reflectionForm").reset();
  updateReflectionLabels();
  $("#reflectionModal").showModal();
}

function renderSchedule(schedule) {
  const visibleItems = schedule.items.filter((item) => item.type === "task" || item.type === "meeting");
  $("#daySummary").textContent = `${schedule.profile.name}, ${visibleItems.length} tasks woven into today.`;
  $("#heroSummary").textContent = `${schedule.profile.name}, your day has ${visibleItems.length} scheduled moments.`;
  updateOrb(visibleItems);
  renderPlanningStrip(schedule);
  renderPlanningWarnings(schedule);

  $("#timeline").innerHTML = visibleItems
    .map((item) => {
      const isMeeting = item.type === "meeting";
      const isTask = item.type === "task";
      const status = isMeeting ? state.meetingStatus[item.id] : item.status;
      const isDone = status === "done";
      return `
        <article class="timeline-item ${item.type} ${item.category || ""} ${isDone ? "done" : ""}">
          <div class="timeline-time">${item.start}<br />${item.end}</div>
          <label class="timeline-check">
            ${
              isTask
                ? `<input type="checkbox" data-task-id="${item.id}" ${isDone ? "checked" : ""} aria-label="Mark ${item.title} done" />`
                : `<input type="checkbox" data-meeting-id="${item.id}" ${isDone ? "checked" : ""} aria-label="Mark ${item.title} done" />`
            }
          </label>
          <div>
            <h3>${item.title}</h3>
            <p>${itemSubtitle(item)}</p>
          </div>
          <span class="chip">${energyLabel(item.requiredEnergy || item.energy)}</span>
          ${
            isTask
              ? `<div class="timeline-actions">
                  <button type="button" data-edit-task="${item.id}" title="Edit task" aria-label="Edit ${item.title}">Edit</button>
                  <button type="button" data-delete-task="${item.id}" title="Delete task" aria-label="Delete ${item.title}">Delete</button>
                </div>`
              : ""
          }
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-task-id]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      await api(`/api/tasks/${event.target.dataset.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: event.target.checked ? "done" : "todo" })
      });
      await refresh();
    });
  });

  document.querySelectorAll("[data-meeting-id]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      state.meetingStatus[event.target.dataset.meetingId] = event.target.checked ? "done" : "todo";
      await refresh();
    });
  });

  document.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.source.tasks.find((item) => item.id === button.dataset.editTask);
      if (task) openTaskForm(task);
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
      await refresh();
    });
  });
}

function updateOrb(items) {
  const counts = ["work", "social", "mind", "body"].reduce((result, category) => {
    result[category] = items.filter((item) => item.category === category).length;
    return result;
  }, {});
  const total = Math.max(items.length, 1);
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "work";
  const orb = $(".orb");
  const ring = $(".orb-ring");
  const active = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => a[1] - b[1]);
  const fieldLayers = active.map(([category, count]) => {
    const share = count / total;
    const { position, weight } = orbFields[category];
    const size = Math.round((34 + share * 60) * weight);
    const core = Math.max(14, Math.round(size * 0.36));
    const alpha = Math.min(0.88, 0.34 + share * 0.56);
    return `radial-gradient(circle at ${position}, ${toRgba(colorFor[category], alpha)} 0%, ${toRgba(colorFor[category], alpha * 0.7)} ${core}%, transparent ${size}%)`;
  });
  const washLayers = [
    `linear-gradient(135deg, ${toRgba(colorFor[dominant], 0.2)}, rgba(255, 255, 255, 0.28) 46%, ${toRgba(colorFor[dominant], 0.16)})`,
    "radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.24), transparent 72%)"
  ];

  orb.style.setProperty("--orb-core", colorFor[dominant]);
  orb.style.setProperty(
    "--orb-gradient",
    active.length
      ? [...fieldLayers, ...washLayers].join(", ")
      : `radial-gradient(circle at 50% 50%, ${toRgba(colorFor.work, 0.68)}, rgba(255, 255, 255, 0.42))`
  );
  ring.style.setProperty("--ring-color", colorFor[dominant]);
  $("#heroInsight").textContent = orbInsight(counts, total);
}

function toRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}

function orbInsight(counts, total) {
  const active = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${count} ${labelFor[category].toLowerCase()}`);
  if (!active.length) return "Add a task and the orb will start weaving your day by color.";
  if (active.length === 1) return `The orb is fully ${labelFor[Object.keys(counts).find((key) => counts[key] > 0)].toLowerCase()} today.`;
  return `The orb is adapting to ${total} tasks: ${active.join(", ")}.`;
}

function renderProductivity() {
  const scheduledTasks = state.schedule.items
    .filter((item) => item.type === "task")
    .map((item) => ({
      ...(state.source.tasks.find((task) => task.id === item.id) || {}),
      ...item,
      duration: durationBetween(item.start, item.end)
    }));
  const scheduledMeetings = state.schedule.items.filter((item) => item.type === "meeting").map((meeting) => ({
    ...meeting,
    category: "work",
    energy: 3,
    duration: durationBetween(meeting.start, meeting.end),
    status: state.meetingStatus[meeting.id] || "todo"
  }));
  const dayItems = [...scheduledTasks, ...scheduledMeetings];
  const scheduleDate = state.schedule?.date || today;
  const checkins = state.source.checkins.filter((checkin) => checkin.profileId === state.profileId && checkin.date === scheduleDate);
  const latestCheckin = checkins.at(-1);
  const startingEnergy = Number(latestCheckin?.energy || 70);
  const completedDrain = dayItems
    .filter((task) => task.status === "done")
    .reduce((sum, task) => sum + energyDrain(task), 0);
  const energyLeft = Math.max(0, Math.round(startingEnergy - completedDrain));
  const averageMood =
    checkins.length > 0
      ? Math.round(checkins.reduce((sum, checkin) => sum + Number(checkin.mood || 0), 0) / checkins.length)
      : "--";
  const moodEmoji = moodFor(averageMood);
  const categoryCounts = ["work", "social", "mind", "body"].map((category) => ({
    category,
    count: dayItems.filter((task) => task.category === category).length
  }));
  const largestCategory = Math.max(...categoryCounts.map((item) => item.count), 1);

  $("#taskCount").textContent = dayItems.length;
  $("#doneCount").textContent = dayItems.filter((task) => task.status === "done").length;
  $("#energyRemaining").textContent = `${energyLeft}%`;
  $("#batteryFill").style.width = `${energyLeft}%`;
  $("#batteryFill").dataset.level = energyLeft < 25 ? "low" : energyLeft < 50 ? "medium" : "high";
  $("#averageMood").textContent = moodEmoji;
  $("#threadChart").innerHTML = categoryCounts
    .map(
      (item) => `
        <div class="thread-row ${item.category}">
          <span>${iconFor[item.category]} ${labelFor[item.category]}</span>
          <div class="thread-track"><i style="width: ${Math.max((item.count / largestCategory) * 100, item.count ? 18 : 4)}%"></i></div>
          <strong>${item.count}</strong>
        </div>
      `
    )
    .join("");
}

function renderAppView() {
  const meta = pageMeta[state.activeView] || pageMeta.today;
  $("#pageEyebrow").textContent = meta.eyebrow;
  $("#pageTitle").textContent = meta.title;
  $("#heroPanel").classList.toggle("is-hidden", state.activeView !== "today");
  document.querySelectorAll(".app-view").forEach((view) => {
    view.classList.toggle("is-hidden", view.dataset.view !== state.activeView);
  });
  document.querySelectorAll("nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${state.activeView}`);
  });
  if (state.activeView === "calendar") renderCalendarPage();
  if (state.activeView === "week") renderWeekPage();
  if (state.activeView === "energy-map") renderEnergyMapPage();
}

function renderCalendarPage() {
  const dates = state.calendarView === "day" ? [today] : state.calendarView === "month" ? monthDates(today) : weekDates(today);
  const filtered = state.threadFilter === "all" ? tasksForDates(dates) : tasksForDates(dates).filter((task) => task.category === state.threadFilter);
  $("#calendarSummary").textContent =
    state.calendarView === "week"
      ? `${filtered.length} tasks across this week`
      : state.calendarView === "day"
        ? `${filtered.length} tasks today`
        : `${filtered.length} tasks this month`;
  renderThreadFilters();
  $("#calendarBoard").className = `calendar-board ${state.calendarView}`;
  $("#calendarBoard").innerHTML = dates
    .map((date) => {
      const tasks = filtered.filter((task) => (task.due || task.date || today) === date);
      return `
        <article class="calendar-day ${date === today ? "today" : ""}">
          <header>
            <span>${dayLabel(date)}</span>
            <strong>${tasks.length}</strong>
          </header>
          <div class="calendar-task-list">
            ${
              tasks.length
                ? tasks
                    .map(
                      (task) => `
                        <button class="calendar-task ${task.category || "work"} ${state.calendarView !== "day" ? "compact" : ""}" type="button" data-view-task="${task.id}">
                          <span>${task.fixedStart || task.start || "Flex"}</span>
                          <strong>${task.title}</strong>
                          <small>${labelFor[task.category] || "Work"} - ${stitchLabels[task.stitch] || "Maintenance"}</small>
                        </button>
                      `
                    )
                    .join("")
                : `<p class="empty-note">Open space</p>`
            }
          </div>
        </article>
      `;
    })
    .join("");
  attachTaskDetailButtons();
}

function renderThreadFilters() {
  $("#calendarFilters").innerHTML = ["all", "work", "mind", "body", "social"]
    .map(
      (thread) => `
        <button class="${state.threadFilter === thread ? "active" : ""} ${thread}" type="button" data-thread-filter="${thread}">
          ${thread === "all" ? "All threads" : labelFor[thread]}
        </button>
      `
    )
    .join("");
  document.querySelectorAll("[data-thread-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.threadFilter = button.dataset.threadFilter;
      renderCalendarPage();
    });
  });
}

function renderWeekPage() {
  const dates = weekDates(today);
  const tasks = tasksForDates(dates);
  const completed = tasks.filter((task) => task.status === "done");
  const threadCounts = countBy(tasks, "category");
  const stitchCounts = countBy(tasks, "stitch");
  const moodAverage = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + (moodScores[task.mood] || 55), 0) / tasks.length) : "--";
  $("#weekMetrics").innerHTML = `
    <article class="report-card orange"><strong>${tasks.length}</strong><span>tasks total</span></article>
    <article class="report-card pink"><strong>${completed.length}</strong><span>completed</span></article>
    <article class="report-card blue"><strong>${tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0}%</strong><span>completion</span></article>
    <article class="report-card green"><strong>${moodFor(moodAverage)}</strong><span>average mood</span></article>
  `;
  $("#weekInsight").innerHTML = `<h3>${balanceComment(threadCounts, stitchCounts)}</h3><p>${balanceRecommendation(threadCounts, stitchCounts)}</p>`;
  $("#weekThreadChart").innerHTML = chartRows(["work", "mind", "body", "social"], threadCounts, labelFor);
  $("#weekStitchChart").innerHTML = chartRows(["growth", "maintenance", "joy", "contribution"], stitchCounts, stitchLabels, "stitch");
  renderMoodReport(tasks);
  renderWeekEnergyChart(dates, tasks);
  attachTaskDetailButtons();
}

function chartRows(keys, counts, labels, palette = "default") {
  const max = Math.max(...keys.map((key) => counts[key] || 0), 1);
  return keys
    .map((key) => {
      const value = counts[key] || 0;
      const ratio = value / max;
      const fill =
        palette === "stitch"
          ? shadeGradient(stitchShadeFor[key], ratio, value)
          : palette === "thread"
            ? shadeGradient(threadShadeFor[key], ratio, value)
            : undefined;
      return `
        <div class="thread-row ${key}">
          <span>${labels[key]}</span>
          <div class="thread-track"><i style="width:${Math.max(ratio * 100, value ? 18 : 4)}%; ${fill ? `--bar-fill:${fill}` : ""}"></i></div>
          <strong>${value}</strong>
        </div>
      `;
    })
    .join("");
}

function balanceComment(threadCounts, stitchCounts) {
  const activeThreads = Object.values(threadCounts).filter(Boolean).length;
  const activeStitches = Object.values(stitchCounts).filter(Boolean).length;
  if (activeThreads >= 3 && activeStitches >= 3) return "This week has a fairly balanced weave.";
  if ((threadCounts.work || 0) > Math.max(1, (threadCounts.body || 0) + (threadCounts.mind || 0) + (threadCounts.social || 0))) return "This week leans strongly toward work.";
  return "This week is still missing a few threads or stitches.";
}

function balanceRecommendation(threadCounts, stitchCounts) {
  const missingThreads = ["mind", "body", "social"].filter((key) => !threadCounts[key]).map((key) => labelFor[key].toLowerCase());
  const missingStitches = ["growth", "joy", "contribution", "maintenance"].filter((key) => !stitchCounts[key]).map((key) => stitchLabels[key].toLowerCase());
  if (missingThreads.length) return `Consider adding a small ${missingThreads[0]} task so the week does not collapse into one mode.`;
  if (missingStitches.length) return `A ${missingStitches[0]} stitch would give the week a little more texture.`;
  return "Keep a small recovery pocket after high-energy work so the balance holds.";
}

function renderMoodReport(tasks) {
  const sorted = [...tasks].sort((a, b) => (moodScores[b.mood] || 55) - (moodScores[a.mood] || 55));
  const best = sorted.slice(0, 3);
  const hardest = sorted.slice(-3).reverse();
  $("#weekMoodReport").innerHTML = `
    <div><h3>Good mood tasks</h3>${taskMoodList(best)}</div>
    <div><h3>Harder mood tasks</h3>${taskMoodList(hardest)}</div>
  `;
}

function taskMoodList(tasks) {
  if (!tasks.length) return `<p class="empty-note">No tasks yet</p>`;
  return tasks.map((task) => `<button type="button" data-view-task="${task.id}">${moodEmojiForTask[task.mood] || "\u{1f610}"} ${task.title}</button>`).join("");
}

function renderWeekEnergyChart(dates, tasks) {
  const max = Math.max(...dates.map((date) => tasks.filter((task) => (task.due || today) === date).reduce((sum, task) => sum + taskEnergyCost(task), 0)), 1);
  $("#weekEnergyChart").innerHTML = dates
    .map((date) => {
      const value = tasks.filter((task) => (task.due || today) === date).reduce((sum, task) => sum + taskEnergyCost(task), 0);
      return `<div><span style="height:${Math.max((value / max) * 100, value ? 12 : 4)}%"></span><small>${dayLabel(date, { weekday: "short" })}</small><strong>${value}</strong></div>`;
    })
    .join("");
}

function renderEnergyMapPage() {
  const dates = state.energyView === "day" ? [today] : state.energyView === "month" ? monthDates(today) : weekDates(today);
  const tasks = tasksForDates(dates);
  const totalEnergy = tasks.reduce((sum, task) => sum + taskEnergyCost(task), 0);
  $("#energyUseMap").innerHTML = `<h3>${state.energyView} use</h3><strong>${totalEnergy}</strong><p>estimated energy spent across ${tasks.length} tasks.</p>`;
  $("#energyThreadMap").innerHTML = `<h3>By thread</h3>${energyRows(["work", "mind", "body", "social"], tasks, "category", labelFor, "thread")}`;
  $("#energyStitchMap").innerHTML = `<h3>By stitch</h3>${energyRows(["growth", "maintenance", "joy", "contribution"], tasks, "stitch", stitchLabels, "stitch")}`;
  const profile = state.source.profiles.find((item) => item.id === state.profileId);
  const rhythm = state.schedule?.rhythm || profile?.energyPattern?.friday || {};
  $("#energyRhythmMap").innerHTML = `<h3>Prone to energy</h3>${Object.entries(rhythm).map(([period, value]) => `<div class="rhythm-row battery-rhythm"><span>${period}</span><div><i style="width:${value}%"></i></div><strong>${value}%</strong></div>`).join("")}`;
  $("#energyRecommendations").innerHTML = `<h3>Could energize you</h3>${energyRecommendations(tasks)}`;
}

function energyRows(keys, tasks, field, labels, palette = "default") {
  const totals = keys.reduce((result, key) => {
    result[key] = tasks.filter((task) => task[field] === key).reduce((sum, task) => sum + taskEnergyCost(task), 0);
    return result;
  }, {});
  const max = Math.max(...Object.values(totals), 1);
  return keys
    .map((key) => {
      const value = totals[key] || 0;
      const ratio = value / max;
      const width = Math.max(ratio * 100, value ? 12 : 4);
      const fill =
        palette === "thread"
          ? shadeGradient(threadShadeFor[key], ratio, value)
          : palette === "stitch"
            ? shadeGradient(stitchShadeFor[key], ratio, value)
            : "linear-gradient(90deg, var(--orange), var(--pink))";
      return `<div class="rhythm-row ${key}"><span>${labels[key]}</span><div><i style="width:${width}%; --bar-fill:${fill}"></i></div><strong>${value}</strong></div>`;
    })
    .join("");
}

function shadeGradient(shades, ratio, value) {
  const [low, mid, high] = shades || threadShadeFor.work;
  if (!value) return "transparent";
  if (ratio < 0.34) return `linear-gradient(90deg, ${low}, ${low})`;
  if (ratio < 0.67) return `linear-gradient(90deg, ${low} 0%, ${mid} 100%)`;
  return `linear-gradient(90deg, ${low} 0%, ${mid} 52%, ${high} 100%)`;
}

function energyRecommendations(tasks) {
  const workHeavy = tasks.filter((task) => task.category === "work").length > tasks.length / 2;
  const bodyLight = !tasks.some((task) => task.category === "body");
  const mindLight = !tasks.some((task) => task.category === "mind");
  const ideas = [
    workHeavy ? "Add a 20-minute mind reset after your longest work block." : "Protect one open pocket before adding more commitments.",
    bodyLight ? "A short walk or stretching task would replenish body energy." : "Pair body tasks with a lower-energy admin task afterwards.",
    mindLight ? "Add a quiet review or reading task to soften cognitive load." : "Keep mind tasks away from your lowest afternoon dip."
  ];
  return `<ul>${ideas.map((idea) => `<li>${idea}</li>`).join("")}</ul>`;
}

function openTaskDetail(id) {
  const task = allTasks().find((item) => item.id === id);
  if (!task) return;
  const editableTask = state.source.tasks.find((item) => item.id === task.id);
  $("#taskDetail").innerHTML = `
    <div class="modal-title">
      <div>
        <p class="eyebrow">${labelFor[task.category] || "Work"} - ${stitchLabels[task.stitch] || "Maintenance"}</p>
        <h2>${task.title}</h2>
      </div>
      <button class="icon-button light" type="button" data-close-detail>&times;</button>
    </div>
    <p>${task.description || "No description yet."}</p>
    <dl>
      <div><dt>Project</dt><dd>${task.project || "General"}</dd></div>
      <div><dt>Priority</dt><dd>${priorityLabels[task.priority] || "Medium"}</dd></div>
      <div><dt>Energy</dt><dd>${energyLabel(task.energy)}</dd></div>
      <div><dt>Duration</dt><dd>${formatDuration(Number(task.duration || 0))}</dd></div>
      <div><dt>Mood</dt><dd>${moodEmojiForTask[task.mood] || "\u{1f610}"}</dd></div>
    </dl>
    ${editableTask ? `<div class="title-actions"><button class="soft-button" type="button" data-detail-edit="${task.id}">Edit task</button></div>` : ""}
  `;
  $("[data-close-detail]").addEventListener("click", () => $("#taskDetailModal").close());
  const editButton = $("[data-detail-edit]");
  if (editButton) {
    editButton.addEventListener("click", () => {
      $("#taskDetailModal").close();
      openTaskForm(editableTask);
    });
  }
  $("#taskDetailModal").showModal();
}

function attachTaskDetailButtons() {
  document.querySelectorAll("[data-view-task]").forEach((button) => {
    button.addEventListener("click", () => openTaskDetail(button.dataset.viewTask));
  });
}

function navigateTo(view) {
  state.activeView = pageMeta[view] ? view : "today";
  renderAppView();
}

function durationBetween(start, end) {
  const [startHours, startMinutes] = start.split(":").map(Number);
  const [endHours, endMinutes] = end.split(":").map(Number);
  return endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
}

function validTimeRange(start, end) {
  return /^\d{2}:\d{2}$/.test(start || "") && /^\d{2}:\d{2}$/.test(end || "") && durationBetween(start, end) > 0;
}

function energyDrain(task) {
  const energy = Number(task.energy || 0);
  const duration = Number(task.duration || 0);
  return (energy * duration) / 20;
}

function moodFor(value) {
  if (value === "--") return "--";
  if (value < 40) return "\u{1f614}";
  if (value < 65) return "\u{1f610}";
  if (value < 82) return "\u{1f642}";
  return "\u2728";
}

function updateRangeLabels() {
  const difficulty = Number($("#taskForm [name='difficulty']").value);
  const energy = Number($("#taskForm [name='energy']").value);
  const minutes = minuteSteps[Number($("#taskForm [name='durationMinutes']").value)];
  const hours = Number($("#taskForm [name='durationHours']").value);
  const duration = hours * 60 + minutes;
  $("[data-output='difficulty']").textContent = difficultyLabels[difficulty - 1];
  $("[data-output='energy']").textContent = energyLabels[energy - 1];
  $("[data-output='minutes']").textContent = `${minutes} min`;
  $("[data-output='hours']").textContent = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  $("[data-output='duration']").textContent = formatDuration(duration);
}

function updateScheduleMode() {
  const mode = $("#taskForm [name='scheduleMode']:checked")?.value || "flexible";
  document.querySelectorAll("[data-schedule-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.schedulePanel !== mode);
  });
  document.querySelectorAll("#taskForm [name='fixedStart'], #taskForm [name='fixedEnd']").forEach((input) => {
    input.required = mode === "fixed";
  });
}

function setDurationControls(duration) {
  const safeDuration = Math.max(0, Number(duration || 45));
  const hours = Math.min(8, Math.floor(safeDuration / 60));
  const remainingMinutes = safeDuration - hours * 60;
  const minuteIndex = minuteSteps.reduce(
    (best, value, index) => (Math.abs(value - remainingMinutes) < Math.abs(minuteSteps[best] - remainingMinutes) ? index : best),
    0
  );
  $("#taskForm [name='durationHours']").value = String(hours);
  $("#taskForm [name='durationMinutes']").value = String(minuteIndex);
  updateRangeLabels();
}

function resetTaskForm() {
  const form = $("#taskForm");
  form.reset();
  form.taskId.value = "";
  form.project.value = "Woven";
  form.priority.value = "medium";
  form.category.value = "work";
  form.stitch.value = "maintenance";
  form.mood.value = "neutral";
  form.scheduleMode.value = "flexible";
  setDurationControls(45);
  updateScheduleMode();
  $("#taskModalTitle").textContent = "Weave a task";
  $("#submitTask").textContent = "Weave into schedule";
}

function openTaskForm(task = null) {
  resetTaskForm();
  const form = $("#taskForm");
  if (task) {
    form.taskId.value = task.id;
    form.title.value = task.title || "";
    form.description.value = task.description || "";
    form.project.value = task.project || "General";
    form.category.value = task.category || "work";
    form.stitch.value = task.stitch || "maintenance";
    form.priority.value = task.priority || "medium";
    form.difficulty.value = task.difficulty || 3;
    form.energy.value = task.energy || 3;
    form.mood.value = task.mood || "neutral";
    form.scheduleMode.value = task.scheduleMode || "flexible";
    form.fixedStart.value = task.fixedStart || "14:00";
    form.fixedEnd.value = task.fixedEnd || "15:00";
    setDurationControls(task.duration || 45);
    $("#taskModalTitle").textContent = "Edit task";
    $("#submitTask").textContent = "Save changes";
  }
  updateRangeLabels();
  updateScheduleMode();
  $("#taskModal").showModal();
}

function setupIntroQuiz() {
  renderWorkRanges();
  renderWeeklyEnergyInputs();
  renderThreadPointSliders();
  renderRankList("#threadPriorityRank", quizState.threadPriority, labelFor);
  renderRankList("#choiceRank", quizState.choicePriority, choiceLabels);
  updateQuizStep();
  updateDailyEnergyPreview();
  updateStructureRead();
  updateBufferRead();

  document.querySelectorAll("#introQuiz input[type='range']").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.name.startsWith("threadPoints.")) {
        rebalanceThreadPoints(input.name.split(".")[1]);
      }
      updateDailyEnergyPreview();
      updateStructureRead();
      updateBufferRead();
      if (!input.name.startsWith("threadPoints.")) updateThreadPoints();
    });
  });

  document.querySelectorAll("[name='workDays']").forEach((input) => {
    input.addEventListener("change", () => renderWorkRanges({ useDefaultsForNewDays: false }));
  });

  $("#workRanges").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-range]");
    if (!removeButton) return;
    const row = removeButton.closest(".work-range-row");
    if (row) row.remove();
  });

  $("#applyRangeToDays").addEventListener("click", () => {
    const days = [...document.querySelectorAll("[name='bulkRangeDays']:checked")].map((input) => input.value);
    const start = $("#bulkRangeStart").value;
    const end = $("#bulkRangeEnd").value;
    if (!days.length || !start || !end) return;

    days.forEach((day) => {
      const workDayInput = document.querySelector(`[name='workDays'][value='${day}']`);
      if (workDayInput) workDayInput.checked = true;
    });

    renderWorkRanges({ useDefaultsForNewDays: false });
    days.forEach((day) => {
      document.querySelector(`[data-ranges-for='${day}']`)?.insertAdjacentHTML("beforeend", rangeRow(day, start, end));
    });
  });

  document.querySelectorAll("[name='goodDay']").forEach((input) => {
    input.addEventListener("change", () => {
      const selected = [...document.querySelectorAll("[name='goodDay']:checked")];
      if (selected.length > 3) input.checked = false;
    });
  });

  $("#nextQuiz").addEventListener("click", async () => {
    if (quizState.step < 9) {
      quizState.step += 1;
      updateQuizStep();
      return;
    }
    await saveIntroQuiz();
  });

  $("#prevQuiz").addEventListener("click", () => {
    quizState.step = Math.max(0, quizState.step - 1);
    updateQuizStep();
  });

  $("#skipQuiz").addEventListener("click", () => $("#introQuiz").close());
}

function renderWorkRanges({ useDefaultsForNewDays = false } = {}) {
  const existingRanges = collectWorkRanges();
  const selected = [...document.querySelectorAll("[name='workDays']:checked")].map((input) => input.value);
  $("#workRanges").innerHTML = selected
    .map((day) => {
      const ranges = existingRanges[day] || (useDefaultsForNewDays ? defaultWorkRanges() : []);
      return `
        <article>
          <header><strong>${capitalize(day)}</strong><button type="button" data-add-range="${day}">Add range</button></header>
          <div data-ranges-for="${day}">
            ${ranges.map((range) => rangeRow(day, range.start, range.end)).join("")}
          </div>
        </article>
      `;
    })
    .join("");
  document.querySelectorAll("[data-add-range]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`[data-ranges-for='${button.dataset.addRange}']`).insertAdjacentHTML("beforeend", rangeRow(button.dataset.addRange, "10:00", "18:00"));
    });
  });
}

function collectWorkRanges() {
  return Object.fromEntries([...document.querySelectorAll("[data-ranges-for]")].map((group) => {
    const day = group.dataset.rangesFor;
    const starts = [...group.querySelectorAll(`[name='workStart.${day}']`)].map((input) => input.value);
    const ends = [...group.querySelectorAll(`[name='workEnd.${day}']`)].map((input) => input.value);
    return [day, starts.map((start, index) => ({ start, end: ends[index] })).filter((range) => range.start && range.end)];
  }));
}

function defaultWorkRanges() {
  return [
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "17:30" }
  ];
}

function rangeRow(day, start, end) {
  return `<label class="work-range-row"><input type="time" name="workStart.${day}" value="${start}" /><span>-</span><input type="time" name="workEnd.${day}" value="${end}" /><button type="button" data-remove-range="${day}" aria-label="Remove range">Remove</button></label>`;
}

function renderWeeklyEnergyInputs() {
  $("#weeklyEnergyInputs").innerHTML = weekDayLabels
    .map((day, index) => `<label>${capitalize(day)} <input type="range" name="weeklyEnergy.${day}" min="1" max="10" value="${index > 4 ? 5 : 7}" /></label>`)
    .join("");
}

function renderThreadPointSliders() {
  const defaults = { work: 50, mind: 15, body: 15, social: 20 };
  $("#threadPointSliders").innerHTML = ["work", "mind", "body", "social"]
    .map((thread) => `<label>${labelFor[thread]} <input type="range" name="threadPoints.${thread}" min="0" max="100" value="${defaults[thread]}" /><strong data-thread-points="${thread}">${defaults[thread]}</strong></label>`)
    .join("");
  updateThreadPoints();
}

function updateThreadPoints() {
  const inputs = [...document.querySelectorAll("[name^='threadPoints.']")];
  const total = inputs.reduce((sum, input) => sum + Number(input.value), 0);
  inputs.forEach((input) => {
    const thread = input.name.split(".")[1];
    $(`[data-thread-points='${thread}']`).textContent = input.value;
  });
  $("#threadPointsTotal").textContent = `${total} points assigned`;
  $("#threadPointsTotal").classList.toggle("over", total !== 100);
}

function rebalanceThreadPoints(changedThread) {
  const inputs = Object.fromEntries([...document.querySelectorAll("[name^='threadPoints.']")].map((input) => [input.name.split(".")[1], input]));
  const changedInput = inputs[changedThread];
  if (!changedInput) return;

  const changedValue = Math.min(100, Math.max(0, Number(changedInput.value)));
  changedInput.value = changedValue;

  const otherInputs = Object.entries(inputs).filter(([thread]) => thread !== changedThread).map(([, input]) => input);
  const remaining = 100 - changedValue;
  const currentOtherTotal = otherInputs.reduce((sum, input) => sum + Number(input.value), 0);
  let allocated = 0;

  otherInputs.forEach((input, index) => {
    const nextValue = currentOtherTotal > 0
      ? Math.round((Number(input.value) / currentOtherTotal) * remaining)
      : Math.floor(remaining / otherInputs.length);
    input.value = index === otherInputs.length - 1 ? remaining - allocated : Math.min(remaining - allocated, Math.max(0, nextValue));
    allocated += Number(input.value);
  });

  updateThreadPoints();
}

function renderRankList(selector, items, labels) {
  $(selector).innerHTML = items
    .map(
      (item, index) => `
        <article>
          <strong>${index + 1}</strong>
          <span>${labels[item]}</span>
          <div>
            <button type="button" data-rank-up="${item}" data-rank-list="${selector}">Up</button>
            <button type="button" data-rank-down="${item}" data-rank-list="${selector}">Down</button>
          </div>
        </article>
      `
    )
    .join("");
  document.querySelectorAll(`[data-rank-list='${selector}']`).forEach((button) => {
    button.addEventListener("click", () => moveRankItem(selector, button.dataset.rankUp || button.dataset.rankDown, Boolean(button.dataset.rankUp)));
  });
}

function moveRankItem(selector, item, up) {
  const list = selector === "#threadPriorityRank" ? quizState.threadPriority : quizState.choicePriority;
  const index = list.indexOf(item);
  const target = up ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  renderRankList(selector, list, selector === "#threadPriorityRank" ? labelFor : choiceLabels);
}

function updateQuizStep() {
  document.querySelectorAll(".quiz-step").forEach((step, index) => step.classList.toggle("active", index === quizState.step));
  $("#quizStepLabel").textContent = `Step ${quizState.step + 1} of 10`;
  $("#quizProgressFill").style.width = `${((quizState.step + 1) / 10) * 100}%`;
  $("#prevQuiz").disabled = quizState.step === 0;
  $("#nextQuiz").textContent = quizState.step === 9 ? "Save rhythm" : "Next";
}

function updateDailyEnergyPreview() {
  $("#dailyEnergyPreview").innerHTML = ["morning", "afternoon", "evening"]
    .map((period) => {
      const value = Number($(`[name='dailyEnergy.${period}']`)?.value || 5);
      return `<div><span>${capitalize(period)}</span><i style="width:${value * 10}%"></i><strong>${value}/10</strong></div>`;
    })
    .join("");
}

function updateStructureRead() {
  const value = Number($("[name='structure']")?.value || 1);
  const item = structureLabels[value];
  $("#structureRead").innerHTML = `<h3>${item.title}</h3><p>${item.copy}</p>`;
}

function updateBufferRead() {
  $("#bufferRead").textContent = `${$("[name='bufferTarget']").value}%`;
}

function quizFormValues() {
  const form = $("#introQuizForm");
  const workDays = [...form.querySelectorAll("[name='workDays']:checked")].map((input) => input.value);
  const workSchedule = Object.fromEntries(
    workDays.map((day) => {
      const starts = [...form.querySelectorAll(`[name='workStart.${day}']`)].map((input) => input.value);
      const ends = [...form.querySelectorAll(`[name='workEnd.${day}']`)].map((input) => input.value);
      return [day, starts.map((start, index) => ({ start, end: ends[index] })).filter((range) => range.start && range.end)];
    })
  );
  return {
    workDays,
    workSchedule,
    dailyEnergy: valuesByPrefix("dailyEnergy."),
    weeklyEnergy: valuesByPrefix("weeklyEnergy."),
    threadPoints: normalizeThreadPoints(valuesByPrefix("threadPoints.")),
    threadPriority: quizState.threadPriority,
    structure: Number(form.structure.value),
    choicePriority: quizState.choicePriority,
    breakCadence: form.breakCadence.value,
    bufferTarget: Number(form.bufferTarget.value),
    goodDay: [...form.querySelectorAll("[name='goodDay']:checked")].map((input) => input.value),
    callName: form.callName.value || "Ana"
  };
}

function valuesByPrefix(prefix) {
  return Object.fromEntries([...document.querySelectorAll(`[name^='${prefix}']`)].map((input) => [input.name.replace(prefix, ""), Number(input.value)]));
}

function normalizeThreadPoints(values) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0) || 1;
  const entries = Object.entries(values);
  let assigned = 0;
  return Object.fromEntries(entries.map(([key, value], index) => {
    const normalized = index === entries.length - 1 ? 100 - assigned : Math.round((value / total) * 100);
    assigned += normalized;
    return [key, normalized];
  }));
}

async function saveIntroQuiz() {
  const preferences = quizFormValues();
  await api("/api/preferences", {
    method: "POST",
    body: JSON.stringify({ profileId: state.profileId, preferences })
  });
  $("#introQuiz").close();
  await refresh();
}

function openIntroQuiz() {
  quizState.step = 0;
  updateQuizStep();
  $("#introQuiz").showModal();
}

function openSettingsModal() {
  const saved = state.source?.notificationPreferences?.[state.profileId] || state.source?.planningProfiles?.[state.profileId]?.notificationSettings || {};
  const form = $("#settingsForm");
  form.notificationsEnabled.checked = Boolean(saved.enabled);
  form.morning.checked = saved.morning !== false;
  form.daytime.checked = saved.daytime !== false;
  form.evening.checked = saved.evening !== false;
  form.fixedTask.checked = saved.fixedTask !== false;
  $("#settingsModal").showModal();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function refresh() {
  state.source = await api("/api/state");
  state.schedule = await api(`/api/schedule?profileId=${state.profileId}&date=${today}`);
  renderSchedule(state.schedule);
  renderProductivity();
  renderAppView();
}

async function boot() {
  const auth = await api("/api/auth/me");
  if (!auth.user) {
    showAuthModal("signup");
    return;
  }
  state.user = auth.user;
  const initial = await api("/api/state");
  state.profileId = initial.currentProfileId;
  state.source = initial;
  renderProfiles(initial.profiles, state.profileId);
  updateRangeLabels();
  updateScheduleMode();
  setupIntroQuiz();
  state.activeView = pageMeta[window.location.hash.replace("#", "")] ? window.location.hash.replace("#", "") : "today";
  await refresh();
  if (!state.source.preferences?.[state.profileId]?.completedAt) openIntroQuiz();
}

$("#profileButton").addEventListener("click", async () => {
  openIntroQuiz();
});

$("#refreshPlan").addEventListener("click", refresh);

window.addEventListener("hashchange", () => {
  navigateTo(window.location.hash.replace("#", "") || "today");
});

document.querySelectorAll("nav a").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.hash = link.getAttribute("href");
    navigateTo(window.location.hash.replace("#", "") || "today");
  });
});

document.querySelectorAll("[data-calendar-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.calendarView = button.dataset.calendarView;
    document.querySelectorAll("[data-calendar-view]").forEach((item) => item.classList.toggle("active", item === button));
    renderCalendarPage();
  });
});

document.querySelectorAll("[data-energy-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.energyView = button.dataset.energyView;
    document.querySelectorAll("[data-energy-view]").forEach((item) => item.classList.toggle("active", item === button));
    renderEnergyMapPage();
  });
});

document.querySelectorAll("[data-open-task]").forEach((button) => {
  button.addEventListener("click", () => openTaskForm());
});

$("#openTaskModal").addEventListener("click", () => {
  openTaskForm();
});

$("#closeTaskModal").addEventListener("click", () => {
  $("#taskModal").close();
  resetTaskForm();
});

$("#toggleAuthMode").addEventListener("click", () => {
  setAuthMode(state.authMode === "signup" ? "login" : "signup");
});

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  $("#authError").textContent = "";
  try {
    const result = await api(state.authMode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data)
    });
    await continueAfterAuth(result.user);
  } catch (error) {
    $("#authError").textContent = error.message.replace(/[{}"]/g, "");
  }
});

$("#closeCheckinModal").addEventListener("click", () => {
  $("#checkinModal").close();
});

$("#closeReflectionModal").addEventListener("click", () => {
  $("#reflectionModal").close();
});

$("#closeSettingsModal").addEventListener("click", () => {
  $("#settingsModal").close();
});

document.querySelectorAll("#checkinForm input[type='range']").forEach((input) => {
  input.addEventListener("input", updateCheckinLabels);
});

document.querySelectorAll("#reflectionForm input[type='range']").forEach((input) => {
  input.addEventListener("input", updateReflectionLabels);
});

$("#checkinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  await api("/api/checkins", {
    method: "POST",
    body: JSON.stringify({ ...data, profileId: state.profileId, date: today, energy: Number(data.energy), mood: Number(data.mood) })
  });
  $("#checkinModal").close();
  await refresh();
});

$("#reflectionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  await api("/api/reflections", {
    method: "POST",
    body: JSON.stringify({
      ...data,
      profileId: state.profileId,
      date: today,
      satisfaction: Number(data.satisfaction),
      energyAtEnd: Number(data.energyAtEnd)
    })
  });
  $("#reflectionModal").close();
  await refresh();
});

$("#settingsButton").addEventListener("click", async () => {
  openSettingsModal();
});

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  await api("/api/notifications/preferences", {
    method: "POST",
    body: JSON.stringify({
      profileId: state.profileId,
      preferences: {
        enabled: form.notificationsEnabled.checked,
        morning: form.morning.checked,
        daytime: form.daytime.checked,
        evening: form.evening.checked,
        fixedTask: form.fixedTask.checked
      }
    })
  });
  $("#settingsModal").close();
  await refresh();
});

$("#resetPasswordButton").addEventListener("click", () => {
  api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({}) }).then((result) => alert(result.message));
});

$("#logoutButton").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  $("#settingsModal").close();
  showAuthModal("login");
});

$("#deleteProfileButton").addEventListener("click", async () => {
  if (!confirm("Delete this Woven profile and all saved data?")) return;
  await api("/api/auth/account", { method: "DELETE" });
  $("#settingsModal").close();
  showAuthModal("signup");
});

$("#notificationsButton").addEventListener("click", async () => {
  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js");
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  await api("/api/notifications/preferences", {
    method: "POST",
    body: JSON.stringify({
      profileId: state.profileId,
      preferences: { enabled: Notification.permission === "granted", fixedTask: true }
    })
  });
  const plan = await api("/api/notifications/plan", {
    method: "POST",
    body: JSON.stringify({ profileId: state.profileId, date: today })
  });
  scheduleLocalNotifications(plan);
  alert(`Reminders are ready: ${plan.notifications.filter((item) => item.category === "fixedTask").length} task reminders set for 5 minutes before start time.`);
});

document.querySelectorAll("#taskForm input[type='range']").forEach((input) => {
  input.addEventListener("input", updateRangeLabels);
});

document.querySelectorAll("#taskForm [name='scheduleMode']").forEach((input) => {
  input.addEventListener("change", updateScheduleMode);
});

async function submitTaskForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const taskId = data.taskId;
  delete data.taskId;
  if (data.scheduleMode === "fixed") {
    if (!validTimeRange(data.fixedStart, data.fixedEnd)) {
      form.fixedEnd.setCustomValidity("End time needs to be after start time.");
      form.reportValidity();
      form.fixedEnd.setCustomValidity("");
      return;
    }
    data.duration = durationBetween(data.fixedStart, data.fixedEnd);
    delete data.durationHours;
    delete data.durationMinutes;
  } else {
    data.scheduleMode = "flexible";
    data.duration = Number(data.durationHours) * 60 + minuteSteps[Number(data.durationMinutes)];
    delete data.durationHours;
    delete data.durationMinutes;
    data.fixedStart = null;
    data.fixedEnd = null;
  }
  try {
    await api(taskId ? `/api/tasks/${taskId}` : "/api/tasks", {
      method: taskId ? "PATCH" : "POST",
      body: JSON.stringify(data)
    });
    resetTaskForm();
    $("#taskModal").close();
    await refresh();
  } catch (error) {
    console.error(`Task was not saved: ${error.message}`);
    alert(error.message.includes("critical tasks") ? "You already have two critical tasks for this day. Move, complete, or lower the priority of one before adding another." : "Task was not saved.");
  }
}

$("#taskForm").addEventListener("submit", submitTaskForm);

boot().catch((error) => {
  document.body.innerHTML = `<main class="panel"><h1>Woven could not start</h1><p>${error.message}</p></main>`;
});
