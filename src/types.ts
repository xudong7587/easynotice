export type ChannelType = 'wecom_app' | 'wecom_robot' | 'telegram' | 'bark';
export type RouteMode = 'failover' | 'broadcast';
export type NoticeStatus = 'pending' | 'processing' | 'success' | 'partial' | 'failed';

export interface Recipe {
  id: string;
  name: string;
  category: string;
  summary: string;
  confidence: 'verified' | 'community' | 'generic';
  method: 'POST' | 'GET';
  contentType: string;
  pathStyle: 'hook' | 'legacy';
  bodyTemplate: string;
  steps: string[];
  tips: string[];
  searchTerms: string[];
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  lastStatus: string;
  lastError?: string;
  lastSuccessAt?: number;
  createdAt: number;
  updatedAt: number;
  config: Record<string, unknown>;
}

export interface SourceEndpoint {
  url: string;
  hookUrl: string;
  legacyUrl: string;
  method: string;
  contentType: string;
  bodyTemplate: string;
}

export interface Source {
  id: string;
  name: string;
  slug: string;
  recipeId: string;
  enabled: boolean;
  routeMode: RouteMode;
  lastReceivedAt?: number;
  createdAt: number;
  updatedAt: number;
  channelIds: string[];
  endpoint: SourceEndpoint;
}

export interface NoticeRule {
  id: string;
  sourceId: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchField: 'always' | 'any' | 'title' | 'body' | 'eventType' | 'severity';
  matchOperator: 'always' | 'contains' | 'equals' | 'regex';
  matchValue: string;
  titleTemplate: string;
  bodyTemplate: string;
  imageUrl: string;
  imageAssetId: string;
  assetUrl: string;
  linkTemplate: string;
  createdAt: number;
  updatedAt: number;
}

export interface Asset {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  url: string;
}

export interface NoticeEvent {
  id: string;
  sourceId: string;
  sourceName: string;
  status: NoticeStatus;
  title: string;
  body: string;
  eventType: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  imageUrl?: string;
  linkUrl?: string;
  matchedRuleName?: string;
  error?: string;
  receivedAt: number;
  processedAt?: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface Delivery {
  id: string;
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  attempt: number;
  status: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  httpStatus?: number;
  detail?: string;
  error?: string;
}

export interface EventDetail extends NoticeEvent {
  raw: Record<string, unknown>;
  requestId: string;
  deliveries: Delivery[];
}
