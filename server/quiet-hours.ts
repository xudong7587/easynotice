import { z } from 'zod';
import type { QuietHours } from './types.js';

export const defaultQuietHours: QuietHours = {
  enabled: false,
  start: '22:00',
  end: '08:00',
  timeZone: 'Asia/Shanghai',
};

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间请使用 HH:mm 格式');

export const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: timeSchema,
  end: timeSchema,
  timeZone: z.string().trim().min(1).max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, '请填写有效时区，例如 Asia/Shanghai'),
}).refine((value) => value.start !== value.end, {
  message: '免打扰开始和结束时间不能相同',
  path: ['end'],
});

// Include the start minute and exclude the end minute, also across midnight.
export function quietHoursReason(settings: QuietHours, now = new Date()): string | undefined {
  if (!settings.enabled) return undefined;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const time = `${parts.find((part) => part.type === 'hour')!.value}:${parts.find((part) => part.type === 'minute')!.value}`;
  const quiet = settings.start < settings.end
    ? time >= settings.start && time < settings.end
    : time >= settings.start || time < settings.end;
  if (!quiet) return undefined;
  return `免打扰时段（${settings.start}–${settings.end}，${settings.timeZone}），已跳过发送，结束后不自动补发`;
}
