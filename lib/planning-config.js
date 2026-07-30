export const threads = ["work", "mind", "body", "social"];
export const stitches = ["growth", "maintenance", "joy", "contribution"];
export const dailyPeriods = ["early_morning", "morning", "afternoon", "evening", "late_evening"];
export const priorities = ["low", "medium", "high", "critical"];
export const dailyGoals = ["accomplish_more", "preserve_energy", "enjoy_the_day", "feel_better", "make_progress", "stay_balanced"];

export const planningRules = {
  maxCriticalTasksPerDay: 2,
  highPriorityWarningThreshold: 5,
  preserveEnergyCapacityMultiplier: 0.65,
  enjoyDayCapacityMultiplier: 0.7,
  feelBetterCapacityMultiplier: 0.65,
  balancedCapacityMultiplier: 0.8,
  makeProgressCapacityMultiplier: 0.85,
  accomplishMoreCapacityMultiplier: 0.95,
  flexibleCapacityMultiplier: 0.78,
  balancedStructureCapacityMultiplier: 0.86,
  structuredCapacityMultiplier: 0.95,
  minimumBufferMinutes: 30,
  highEnergyConsecutiveLimit: 2,
  daytimeCheckinWindow: { start: "10:30", end: "17:30" },
  eveningReflectionWindow: { start: "19:00", end: "22:00" }
};

export const schedulingWeights = {
  urgency: 20,
  priority: 18,
  energyMatch: 16,
  threadBalance: 10,
  threadPreference: 8,
  dailyGoalFit: 12,
  durationFit: 8,
  deferralPenalty: 6,
  stitchFit: 8,
  workCompatibility: 25
};

export const priorityScore = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 5
};

export const goalConfig = {
  accomplish_more: {
    capacityMultiplier: planningRules.accomplishMoreCapacityMultiplier,
    preferredStitches: ["growth", "contribution"],
    preferredThreads: ["work", "mind"],
    maxEnergyDemand: 5
  },
  preserve_energy: {
    capacityMultiplier: planningRules.preserveEnergyCapacityMultiplier,
    preferredStitches: ["maintenance", "joy"],
    preferredThreads: ["mind", "body"],
    maxEnergyDemand: 3
  },
  enjoy_the_day: {
    capacityMultiplier: planningRules.enjoyDayCapacityMultiplier,
    preferredStitches: ["joy"],
    preferredThreads: ["social", "body", "mind"],
    maxEnergyDemand: 3
  },
  feel_better: {
    capacityMultiplier: planningRules.feelBetterCapacityMultiplier,
    preferredStitches: ["joy", "maintenance"],
    preferredThreads: ["body", "mind", "social"],
    maxEnergyDemand: 3
  },
  make_progress: {
    capacityMultiplier: planningRules.makeProgressCapacityMultiplier,
    preferredStitches: ["growth"],
    preferredThreads: ["work", "mind"],
    maxEnergyDemand: 4
  },
  stay_balanced: {
    capacityMultiplier: planningRules.balancedCapacityMultiplier,
    preferredStitches: ["growth", "maintenance", "joy", "contribution"],
    preferredThreads: ["work", "mind", "body", "social"],
    maxEnergyDemand: 4
  }
};
