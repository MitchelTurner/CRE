export const DEFAULT_USER_KEY = 'default';

export const XP_REWARDS: Record<string, number> = {
  connected: 50,
  voicemail: 15,
  callback: 20,
  wrong_number: 10,
  not_seller: 10,
  deal: 100,
  sent: 15,
  attended_event: 40,
  event_attended: 75,
  person_met: 40,
  note_created: 8,
  hitl_resolved: 25,
};

export type BadgeDef = {
  id: string;
  name: string;
  description: string;
  /** Clear criterion shown in UI */
  how: string;
};

export const BADGES: BadgeDef[] = [
  {
    id: 'first_connection',
    name: 'First Connection',
    description: 'You talked to a real person.',
    how: 'Log 1 Connected outcome',
  },
  {
    id: 'connector_5',
    name: 'Connector',
    description: 'Five real conversations.',
    how: 'Log 5 Connected outcomes',
  },
  {
    id: 'connector_25',
    name: 'Network Builder',
    description: 'Twenty-five connections.',
    how: 'Log 25 Connected outcomes',
  },
  {
    id: 'first_event',
    name: 'Showed Up',
    description: 'You attended a CRE event.',
    how: 'Mark 1 event as Attended',
  },
  {
    id: 'event_3',
    name: 'Regular',
    description: 'Three events on the calendar.',
    how: 'Attend 3 events',
  },
  {
    id: 'handshake',
    name: 'Handshake',
    description: 'You met someone at an event.',
    how: 'Mark 1 person as Met',
  },
  {
    id: 'handshake_10',
    name: 'Room Reader',
    description: 'Ten event intros logged.',
    how: 'Mark 10 people as Met',
  },
  {
    id: 'note_taker',
    name: 'Note Taker',
    description: 'You wrote things down.',
    how: 'Create 5 notes',
  },
  {
    id: 'closer',
    name: 'Closer',
    description: 'A deal hit the board.',
    how: 'Move 1 lead to Deal',
  },
  {
    id: 'streak_3',
    name: 'Three-Day Streak',
    description: 'Active three days in a row.',
    how: 'Earn XP 3 days in a row',
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Seven-day activity streak.',
    how: 'Earn XP 7 days in a row',
  },
  {
    id: 'level_5',
    name: 'Level 5',
    description: 'Climbing the ladder.',
    how: 'Reach level 5',
  },
];

/** Level 1 at 0 XP; each next level needs +100 * level XP from previous. */
export function levelFromXp(xp: number): number {
  let level = 1;
  let need = 100;
  let remaining = Math.max(0, xp);
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = 100 * level;
  }
  return level;
}

export function xpProgressInLevel(xp: number): {
  level: number;
  intoLevel: number;
  needForNext: number;
  pct: number;
} {
  let level = 1;
  let need = 100;
  let remaining = Math.max(0, xp);
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = 100 * level;
  }
  return {
    level,
    intoLevel: remaining,
    needForNext: need,
    pct: need > 0 ? Math.min(100, Math.round((remaining / need) * 100)) : 100,
  };
}

export function questsForToday(counts: {
  connectionsToday: number;
  eventsAttended: number;
  peopleMetToday: number;
  notesToday: number;
  callsLoggedToday: number;
}) {
  return [
    {
      id: 'quest_call',
      title: 'Log 3 call outcomes',
      target: 3,
      current: counts.callsLoggedToday,
      xpHint: '+15–50 XP each',
    },
    {
      id: 'quest_connect',
      title: 'Make 1 real connection',
      target: 1,
      current: counts.connectionsToday,
      xpHint: '+50 XP',
    },
    {
      id: 'quest_meet',
      title: 'Meet 1 person (or mark met)',
      target: 1,
      current: counts.peopleMetToday,
      xpHint: '+40 XP',
    },
    {
      id: 'quest_note',
      title: 'Write 2 notes',
      target: 2,
      current: counts.notesToday,
      xpHint: '+8 XP each',
    },
    {
      id: 'quest_event',
      title: 'Attend an event (when you go)',
      target: 1,
      current: Math.min(1, counts.eventsAttended),
      xpHint: '+75 XP',
    },
  ].map((q) => ({
    ...q,
    done: q.current >= q.target,
    pct: Math.min(100, Math.round((q.current / q.target) * 100)),
  }));
}
