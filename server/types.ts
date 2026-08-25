export type ChannelType = 'wecom_app' | 'wecom_robot' | 'telegram' | 'bark';
export type RouteMode = 'failover' | 'broadcast';
export type DeliveryStatus = 'queued' | 'sending' | 'success' | 'failed' | 'skipped';
export type EventStatus = 'pending' | 'processing' | 'success' | 'partial' | 'failed';

export interface WeComAppConfig {
  corpId: string;
  corpSecret: string;
  agentId: string;
  toUser?: string;
  toParty?: string;
}

export interface WeComRobotConfig {
  webhookUrl: string;
  mentionMobiles?: string[];
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  apiBase?: string;
  disableNotification?: boolean;
}

export interface BarkConfig {
  serverUrl?: string;
  deviceKey: string;
  group?: string;
  sound?: string;
  level?: 'active' | 'timeSensitive' | 'passive';
}

export type ChannelConfig = WeComAppConfig | WeComRobotConfig | TelegramConfig | BarkConfig;

export interface NormalizedNotice {
  title: string;
  body: string;
  eventType: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  imageUrl?: string;
  linkUrl?: string;
  raw: Record<string, unknown>;
}

export interface NoticeForDelivery extends NormalizedNotice {
  eventId: string;
  sourceName: string;
  imageAssetPath?: string;
  imageMimeType?: string;
}

export interface RuleRow {
  id: string;
  source_id: string;
  name: string;
  enabled: number;
  priority: number;
  match_field: 'always' | 'any' | 'title' | 'body' | 'eventType' | 'severity';
  match_operator: 'always' | 'contains' | 'equals' | 'regex';
  match_value: string;
  title_template: string | null;
  body_template: string | null;
  image_url: string | null;
  image_asset_id: string | null;
  link_template: string | null;
}
