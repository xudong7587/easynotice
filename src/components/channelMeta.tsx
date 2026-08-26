import { BellSimpleRinging, Buildings, TelegramLogo, WechatLogo } from '@phosphor-icons/react';
import type { ChannelType } from '../types';

export const channelMeta: Record<ChannelType, {
  name: string;
  short: string;
  description: string;
  icon: typeof WechatLogo;
}> = {
  wecom_app: {
    name: '企业微信应用',
    short: '企微应用',
    description: '支持应用消息和图文，但企业可信 IP 变化时可能发送失败。',
    icon: Buildings,
  },
  wecom_robot: {
    name: '企业微信群机器人',
    short: '企微机器人',
    description: '只需机器人 Key，EasyNotice 自动发送文字、图片或图文。',
    icon: WechatLogo,
  },
  telegram: {
    name: 'Telegram Bot',
    short: 'Telegram',
    description: '支持文字、图片和链接，适合远程查看 NAS 状态。',
    icon: TelegramLogo,
  },
  bark: {
    name: 'Bark',
    short: 'Bark',
    description: '把通知直接推到 iPhone，可设置声音、分组和时效级别。',
    icon: BellSimpleRinging,
  },
};
