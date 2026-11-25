// Audit frequencies, in minutes between runs.
export const SCHEDULES = {
  '15m': 15,
  hourly: 60,
  daily: 1440,
};

export const SCHEDULE_NAMES = Object.keys(SCHEDULES);

export const PLANS = {
  free: {
    name: 'Free',
    priceInr: 0,
    maxWebsites: 1,
    minIntervalMinutes: SCHEDULES.daily,
    aiSuggestions: false,
    priorityJobs: false,
  },
  pro: {
    name: 'Pro',
    priceInr: 499,
    maxWebsites: 10,
    minIntervalMinutes: SCHEDULES.hourly,
    aiSuggestions: true,
    priorityJobs: false,
  },
  business: {
    name: 'Business',
    priceInr: 1499,
    maxWebsites: null, // unlimited
    minIntervalMinutes: SCHEDULES['15m'],
    aiSuggestions: true,
    priorityJobs: true,
  },
};

export const PLAN_NAMES = Object.keys(PLANS);
export const PAID_PLAN_NAMES = PLAN_NAMES.filter((name) => PLANS[name].priceInr > 0);
