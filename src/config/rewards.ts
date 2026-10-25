export const REWARD_VERSION = 1
export const DAILY_XP_CAP = 200
export const DAILY_SCORE_THRESHOLD = 75
export const REDUCTION_DAYS = 7
export const MILESTONES = [
  { id: 'target', name: 'Target Reached', ratio: 1, xp: 10 },
  { id: 'extra', name: 'Extra Effort', ratio: 1.25, xp: 15 },
  { id: 'strong', name: 'Strong Discipline', ratio: 1.5, xp: 25 },
  { id: 'double', name: 'Double Time', ratio: 2, xp: 50 },
  { id: 'triple', name: 'Triple Time', ratio: 3, xp: 100 },
] as const
export const ACHIEVEMENTS = [
  { id: 'first-step', name: 'First Step', category: 'Spacing', icon: 'Footprints', description: 'Verify one interval reaching its spacing goal.' },
  { id: 'extra-mile', name: 'Extra Mile', category: 'Spacing', icon: 'Route', description: 'Verify 125% of a spacing target.' },
  { id: 'overachiever', name: 'Overachiever', category: 'Spacing', icon: 'TrendingUp', description: 'Verify 150% of a spacing target.' },
  { id: 'double-time', name: 'Double Time', category: 'Spacing', icon: 'Timer', description: 'Verify twice the spacing target.' },
  { id: 'triple-time', name: 'Triple Time', category: 'Spacing', icon: 'Sparkles', description: 'Verify three times the spacing target.' },
  { id: 'getting-consistent', name: 'Getting Consistent', category: 'Consistency', icon: 'Repeat', description: 'Meet the goal in five consecutive verified eligible daytime intervals. Unconfirmed or short daytime intervals break the run.' },
  { id: 'solid-week', name: 'Solid Week', category: 'Consistency', icon: 'CalendarCheck', description: 'Seven consecutive confirmed days scoring at least 75, or confirmed nicotine-free days.' },
  { id: 'steady-progress', name: 'Steady Progress', category: 'Consistency', icon: 'ChartNoAxesCombined', description: 'Improve actual eligible spacing across three consecutive fully confirmed Monday–Sunday weeks, each with at least two eligible intervals.' },
  { id: 'less-is-more', name: 'Less Is More', category: 'Reduction', icon: 'TrendingDown', description: 'Reduce average pouches over seven consecutive confirmed days versus one positive baseline effective throughout.' },
  { id: 'halfway-there', name: 'Halfway There', category: 'Reduction', icon: 'CircleCheck', description: 'Reduce average pouches by at least 50% over seven consecutive confirmed days versus one positive baseline.' },
  { id: 'personal-best', name: 'Personal Best', category: 'Reduction', icon: 'Trophy', description: 'Beat an earlier verified daytime interval record; at least two verified intervals provide evidence.' },
  { id: 'smoke-free-day', name: 'Smoke-Free Day', category: 'Smoking-free progress', icon: 'Leaf', description: 'One confirmed completed day without cigarettes or cigars.' },
  { id: 'smoke-free-week', name: 'Smoke-Free Week', category: 'Smoking-free progress', icon: 'ShieldCheck', description: 'Seven consecutive confirmed days without cigarettes or cigars.' },
] as const
