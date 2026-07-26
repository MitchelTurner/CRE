import { levelFromXp, xpProgressInLevel, questsForToday } from './progress.rules';

describe('progress.rules', () => {
  it('levels from XP thresholds', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(100 + 200)).toBe(3);
  });

  it('reports progress within level', () => {
    const p = xpProgressInLevel(150);
    expect(p.level).toBe(2);
    expect(p.intoLevel).toBe(50);
    expect(p.needForNext).toBe(200);
  });

  it('marks quests done when target met', () => {
    const q = questsForToday({
      connectionsToday: 1,
      eventsAttended: 0,
      peopleMetToday: 0,
      notesToday: 2,
      callsLoggedToday: 3,
    });
    expect(q.find((x) => x.id === 'quest_call')?.done).toBe(true);
    expect(q.find((x) => x.id === 'quest_note')?.done).toBe(true);
    expect(q.find((x) => x.id === 'quest_event')?.done).toBe(false);
  });
});
