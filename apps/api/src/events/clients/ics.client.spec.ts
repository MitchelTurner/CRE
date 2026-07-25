import { parseIcs } from './ics.client';

describe('parseIcs', () => {
  it('parses VEVENT blocks in window', () => {
    const ics = `
BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260801T180000Z
DTEND:20260801T200000Z
SUMMARY:CCIM SC Investor Breakfast
LOCATION:Greenville Chamber
URL:https://example.com/event
END:VEVENT
BEGIN:VEVENT
DTSTART:20250101T180000Z
SUMMARY:Old event
END:VEVENT
END:VCALENDAR`;
    const from = new Date('2026-07-01T00:00:00Z');
    const to = new Date('2026-09-01T00:00:00Z');
    const events = parseIcs(ics, 'ccim_sc', from, to);
    expect(events).toHaveLength(1);
    expect(events[0]!.name).toContain('CCIM');
    expect(events[0]!.ownerDensity).toBe('high');
  });
});
