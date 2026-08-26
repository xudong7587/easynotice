import { z } from 'zod';
import type { ChannelConfig, ChannelType } from './types.js';

const httpUrl = z.string().trim().url('地址格式不正确').refine((value) => /^https?:\/\//i.test(value), '仅支持 HTTP 或 HTTPS');
const optionalHttpUrl = z.union([httpUrl, z.literal('')]).optional();
const weComRobotWebhook = z.string().trim().min(1, '请填写机器人 Webhook 或 Key').transform((value, context) => {
  if (/^https?:\/\//i.test(value)) {
    const parsed = httpUrl.safeParse(value);
    if (parsed.success) return parsed.data;
    context.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message || 'Webhook 地址格式不正确' });
    return z.NEVER;
  }
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(value)) {
    context.addIssue({ code: 'custom', message: '机器人 Key 格式不正确，请粘贴 key= 后面的完整内容' });
    return z.NEVER;
  }
  return `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(value)}`;
});

const schemas = {
  wecom_robot: z.object({
    webhookUrl: weComRobotWebhook,
    mentionMobiles: z.array(z.string().trim()).optional(),
  }),
  wecom_app: z.object({
    corpId: z.string().trim().min(1, '请填写企业 ID'),
    corpSecret: z.string().trim().min(1, '请填写应用 Secret'),
    agentId: z.string().trim().regex(/^\d+$/, '应用 AgentId 应为数字'),
    toUser: z.string().trim().optional(),
    toParty: z.string().trim().optional(),
  }),
  telegram: z.object({
    botToken: z.string().trim().min(10, 'Bot Token 不完整'),
    chatId: z.string().trim().min(1, '请填写 Chat ID'),
    apiBase: optionalHttpUrl,
    disableNotification: z.boolean().optional(),
  }),
  bark: z.object({
    serverUrl: optionalHttpUrl,
    deviceKey: z.string().trim().min(4, 'Bark Key 不完整'),
    group: z.string().trim().optional(),
    sound: z.string().trim().optional(),
    level: z.enum(['active', 'timeSensitive', 'passive']).optional(),
  }),
} satisfies Record<ChannelType, z.ZodType>;

export function parseChannelConfig(
  type: ChannelType,
  value: unknown,
  existing?: ChannelConfig,
): ChannelConfig {
  const candidate = { ...(existing as Record<string, unknown> | undefined), ...(value as Record<string, unknown>) };
  const secretFields: Record<ChannelType, string[]> = {
    wecom_robot: ['webhookUrl'],
    wecom_app: ['corpSecret'],
    telegram: ['botToken'],
    bark: ['deviceKey'],
  };
  for (const field of secretFields[type]) {
    if ((value as Record<string, unknown>)?.[field] === '') candidate[field] = (existing as Record<string, unknown> | undefined)?.[field];
  }
  return schemas[type].parse(candidate) as ChannelConfig;
}

export function maskChannelConfig(type: ChannelType, config: ChannelConfig): Record<string, unknown> {
  const copy = { ...(config as unknown as Record<string, unknown>) };
  const secretFields: Record<ChannelType, string[]> = {
    wecom_robot: ['webhookUrl'],
    wecom_app: ['corpSecret'],
    telegram: ['botToken'],
    bark: ['deviceKey'],
  };
  for (const field of secretFields[type]) {
    const value = String(copy[field] || '');
    copy[field] = value ? `${value.slice(0, 4)}••••${value.slice(-4)}` : '';
    copy[`has${field[0].toUpperCase()}${field.slice(1)}`] = Boolean(value);
  }
  return copy;
}

export function slugify(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'source';
}
