import { describe, expect, it } from 'vitest';
import { defaultQuietHours, quietHoursReason, quietHoursSchema } from './quiet-hours.js';

const night = { ...defaultQuietHours, enabled: true };

describe('免打扰时间判断', () => {
  it.each([
    ['2026-10-26T13:59:59Z', false], // 北京时间 21:59:59
    ['2026-10-26T14:00:00Z', true],
    ['2026-10-26T16:00:00Z', true], // 午夜
    ['2026-10-26T23:59:59Z', true],
    ['2026-10-27T00:00:00Z', false],
  ])('跨天时段 %s → %s', (time, quiet) => {
    expect(Boolean(quietHoursReason(night, new Date(time)))).toBe(quiet);
  });

  it.each([
    ['2026-10-26T00:59:59Z', false],
    ['2026-10-26T01:00:00Z', true],
    ['2026-10-26T08:59:59Z', true],
    ['2026-10-26T09:00:00Z', false],
  ])('当天时段 %s → %s', (time, quiet) => {
    expect(Boolean(quietHoursReason({ ...night, start: '09:00', end: '17:00' }, new Date(time)))).toBe(quiet);
  });

  it('关闭时不拦截，并按照指定时区而非运行机器时区判断', () => {
    const now = new Date('2026-10-26T15:00:00Z');
    expect(quietHoursReason(defaultQuietHours, now)).toBeUndefined();
    expect(quietHoursReason(night, now)).toContain('免打扰');
    expect(quietHoursReason({ ...night, timeZone: 'UTC' }, now)).toBeUndefined();
  });

  it('自动遵循所选时区的夏令时', () => {
    const settings = { ...night, start: '22:00', end: '23:00', timeZone: 'America/New_York' };
    expect(quietHoursReason(settings, new Date('2026-07-01T02:30:00Z'))).toBeDefined();
    expect(quietHoursReason(settings, new Date('2026-12-01T02:30:00Z'))).toBeUndefined();
    expect(quietHoursReason(settings, new Date('2026-12-01T03:30:00Z'))).toBeDefined();
  });

  it.each([
    { start: '24:00' }, { end: '08:60' }, { start: '8:00' }, { timeZone: 'invalid/zone' }, { end: '22:00' },
  ])('拒绝不明确或无效的设置 %j', (input) => {
    expect(quietHoursSchema.safeParse({ ...night, ...input }).success).toBe(false);
  });
});
