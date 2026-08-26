import type { NormalizedNotice } from './types.js';

function previewTime(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function buildPreviewSample(sourceName: string, recipeId: string): NormalizedNotice {
  const time = previewTime();

  if (recipeId === 'lucky') {
    return {
      title: '公网 IP 已更新',
      body: `时间：${time}\nIPv4：198.51.100.24 → 203.0.113.86\nDDNS：home.example.com\n状态：解析记录已更新`,
      eventType: 'ddns_changed',
      severity: 'success',
      raw: {
        title: '公网 IP 已更新',
        content: '公网 IPv4 和 DDNS 解析记录已更新',
        event: 'ddns_changed',
        oldIp: '198.51.100.24',
        ipAddress: '203.0.113.86',
        domain: 'home.example.com',
        source: sourceName,
      },
    };
  }

  if (recipeId === 'openwrt-istoreos') {
    return {
      title: '新设备接入网络',
      body: `时间：${time}\n设备：客厅电视\nIP：192.168.11.86\n连接：5 GHz Wi-Fi\n当前在线：18 台`,
      eventType: 'device_online',
      severity: 'info',
      raw: {
        title: '新设备接入网络',
        content: '客厅电视已连接到 5 GHz Wi-Fi',
        event: 'device_online',
        hostname: 'living-room-tv',
        ipAddress: '192.168.11.86',
        onlineClients: 18,
        source: sourceName,
      },
    };
  }

  if (recipeId === 'mdc-ng' || recipeId === 'media-hub') {
    return {
      title: '影片整理完成',
      body: `时间：${time}\n影片：示例电影 (2026)\n分类：欧美\n海报与元数据：已保存\n耗时：42 秒`,
      eventType: 'finished',
      severity: 'success',
      raw: {
        title: '示例电影',
        content: '海报与元数据已保存',
        event: 'finished',
        category: '欧美',
        duration: 42,
        source: sourceName,
      },
    };
  }

  if (recipeId === 'uptime-kuma') {
    return {
      title: '家庭服务已恢复',
      body: `时间：${time}\n服务：NAS 外网访问\n状态：已恢复正常\n中断时间：2 分 18 秒\n响应：36 ms`,
      eventType: 'monitor_up',
      severity: 'success',
      raw: { monitor: 'NAS 外网访问', status: 'UP', ping: 36, source: sourceName },
    };
  }

  if (recipeId === 'watchtower') {
    return {
      title: 'Docker 容器更新完成',
      body: `时间：${time}\n容器：lucky\n镜像：latest\n结果：已拉取新镜像并重新启动\n耗时：28 秒`,
      eventType: 'container_updated',
      severity: 'success',
      raw: { container: 'lucky', image: 'latest', event: 'container_updated', source: sourceName },
    };
  }

  return {
    title: 'NAS 任务执行完成',
    body: `时间：${time}\n任务：配置备份\n结果：执行成功\n文件：3 个\n耗时：12 秒`,
    eventType: 'task_finished',
    severity: 'success',
    raw: { title: 'NAS 任务执行完成', content: '配置备份执行成功', event: 'task_finished', source: sourceName },
  };
}
