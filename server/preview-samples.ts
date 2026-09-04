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
      title: '【测试】公网 IP 已更新',
      body: `时间：${time}\nIPv4：198.51.100.24 → 203.0.113.86\nDDNS：home.example.com\n状态：解析记录已更新\n说明：这是 EasyNotice 预览消息，不代表真实状态。`,
      eventType: 'ddns_changed',
      severity: 'success',
      raw: {
        title: '【测试】公网 IP 已更新',
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
      title: '【测试】新设备接入网络',
      body: `时间：${time}\n设备：客厅电视\nIP：192.168.11.86\n连接：5 GHz Wi-Fi\n当前在线：18 台\n说明：这是 EasyNotice 预览消息，不代表真实状态。`,
      eventType: 'device_online',
      severity: 'info',
      raw: {
        title: '【测试】新设备接入网络',
        content: '客厅电视已连接到 5 GHz Wi-Fi',
        event: 'device_online',
        hostname: 'living-room-tv',
        ipAddress: '192.168.11.86',
        onlineClients: 18,
        source: sourceName,
      },
    };
  }

  if (recipeId === 'ugreen-dxp') {
    return {
      title: '【测试】绿联 NAS 系统通知',
      body: `时间：${time}\n设备：书房 NAS\n消息：系统检查已完成，存储空间与磁盘状态正常\n来源：UGOS Pro 消息中心\n说明：这是 EasyNotice 预览消息，不代表真实设备状态。`,
      eventType: 'ugreen_info',
      severity: 'info',
      raw: { provider: 'ugreen-dxp', level: 'info', body: '系统检查已完成，存储空间与磁盘状态正常', source: sourceName },
    };
  }

  if (recipeId === 'mdc-ng' || recipeId === 'media-hub') {
    return {
      title: '【测试】影片整理完成',
      body: `时间：${time}\n影片：示例电影 (2026)\n分类：欧美\n海报与元数据：已保存\n耗时：42 秒\n说明：这是 EasyNotice 预览消息，不代表真实任务。`,
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
      title: '【测试】家庭服务已恢复',
      body: `时间：${time}\n服务：NAS 外网访问\n状态：已恢复正常\n中断时间：2 分 18 秒\n响应：36 ms\n说明：这是 EasyNotice 预览消息，不代表真实状态。`,
      eventType: 'monitor_up',
      severity: 'success',
      raw: { monitor: 'NAS 外网访问', status: 'UP', ping: 36, source: sourceName },
    };
  }

  if (recipeId === 'watchtower') {
    return {
      title: '【测试】Docker 容器更新完成',
      body: `时间：${time}\n容器：lucky\n镜像：latest\n结果：已拉取新镜像并重新启动\n耗时：28 秒\n说明：这是 EasyNotice 预览消息，不代表真实任务。`,
      eventType: 'container_updated',
      severity: 'success',
      raw: { container: 'lucky', image: 'latest', event: 'container_updated', source: sourceName },
    };
  }

  return {
    title: 'EasyNotice 测试消息',
    body: `时间：${time}\n用途：检查标题、正文、来源和图片显示效果\n状态：预览发送成功\n说明：这是一条测试消息，不代表 NAS 正在执行任务。`,
    eventType: 'preview_test',
    severity: 'info',
    raw: { title: 'EasyNotice 测试消息', content: '这是一条通知出口预览测试', event: 'preview_test', source: sourceName },
  };
}
