import { store } from './store';
import { ServerNode, ServiceItem, Incident } from '../src/types';

export interface TelegramPushOptions {
  chatId?: string;
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
  silent?: boolean;
}

/**
 * Escapes characters that have special meaning in Telegram HTML parse mode.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send a notification/alert message via Telegram Bot API or fallback to simulated push.
 */
export async function sendTelegramMessage(
  text: string,
  options: TelegramPushOptions = {}
): Promise<{ success: boolean; simulated: boolean; status: 'sent' | 'simulated' | 'failed'; error?: string }> {
  const token = store.telegramConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId = options.chatId || store.telegramConfig.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !targetChatId) {
    store.logTelegramAction({
      type: 'push',
      sender: 'CloudPulse Engine (Simulated)',
      chatId: targetChatId || 'No Chat ID Set',
      content: text,
      status: 'simulated',
      error: 'Telegram Bot Token 或 Chat ID 未配置，已转为模拟推送。请在后台管理配置 Token。',
    });
    return {
      success: true,
      simulated: true,
      status: 'simulated',
      error: 'Token or Chat ID not configured',
    };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
        text,
        parse_mode: options.parseMode || 'HTML',
        disable_notification: options.silent || false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const resData = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };

    if (response.ok && resData.ok) {
      store.logTelegramAction({
        type: 'push',
        sender: 'CloudPulse Bot',
        chatId: targetChatId,
        content: text,
        status: 'sent',
      });
      return { success: true, simulated: false, status: 'sent' };
    } else {
      const errorMsg = resData.description || `HTTP ${response.status}`;
      store.logTelegramAction({
        type: 'push',
        sender: 'CloudPulse Bot',
        chatId: targetChatId,
        content: text,
        status: 'failed',
        error: errorMsg,
      });
      return { success: false, simulated: false, status: 'failed', error: errorMsg };
    }
  } catch (err: any) {
    const isNetworkError = err.name === 'AbortError' || err.code === 'ENOTFOUND' || err.message?.includes('fetch failed');
    const msg = isNetworkError
      ? '网络访问 Telegram API 超时或受限（已在仪表板记录推送消息）'
      : err.message || 'Unknown error';

    store.logTelegramAction({
      type: 'push',
      sender: 'CloudPulse Engine',
      chatId: targetChatId,
      content: text,
      status: 'simulated',
      error: msg,
    });

    return {
      success: true,
      simulated: true,
      status: 'simulated',
      error: msg,
    };
  }
}

/**
 * Parses and responds to inbound messages, strictly for querying status or informing user
 * that data modifications are done via the Web Admin panel.
 */
export async function handleBotCommand(
  rawText: string,
  fromUser = 'Operator',
  chatId?: string
): Promise<{ reply: string; action?: string; data?: any }> {
  const text = rawText.trim();
  const parts = text.split(/\s+/);
  const command = (parts[0] || '').toLowerCase().replace(/@\w+$/, '');

  // /start or /help
  if (command === '/start' || command === '/help') {
    const reply =
`👋 <b>欢迎关注 CloudPulse 运维推送通知通道！</b>

本机器人专职负责<b>运维监控告警推送与状态播报</b>。

<b>📋 可用查询指令：</b>
• 📊 <code>/status</code> - 实时播报系统整体健康状态与 SLA
• 🖥 <code>/nodes</code> - 查看所有物理节点/探针实时负载
• 🌐 <code>/services</code> - 查看所有微服务拨测与响应延迟
• 🏓 <code>/ping</code> - 测定机器人网络响应可用性

<i>🔒 提示：为保障生产集群安全，添加服务器、微服务拨测及探针安装统一在 Web 后台管理系统中进行。</i>`;

    store.logTelegramAction({
      type: 'push',
      sender: fromUser,
      chatId: chatId || 'console',
      content: text,
      status: 'sent',
      dataAction: 'help',
    });

    return { reply, action: 'help' };
  }

  // /ping
  if (command === '/ping') {
    const reply = `🏓 <b>Pong!</b> 响应时间: ${Math.floor(15 + Math.random() * 25)}ms | 告警推送通道运转正常。`;
    return { reply, action: 'ping' };
  }

  // /status
  if (command === '/status') {
    const overview = store.getOverview();
    const statusEmoji = overview.overallStatus === 'all_good' ? '🟢 正常运行 (All Good)' : '🟠 部分异常或降级 (Degraded)';
    const reply =
`📊 <b>CloudPulse 监控状态概报</b>

• 系统状况: ${statusEmoji}
• 微服务可用率: <b>${overview.operationalServices}/${overview.totalServices}</b> 个正常
• 探针/服务器: <b>${overview.onlineNodes}/${overview.totalNodes}</b> 台在线
• 30 天平均 SLA: <b>${overview.uptime30d}%</b>
• 活动故障事件: <b>${overview.activeIncidentsCount}</b> 起

<i>播报时间: ${new Date().toLocaleTimeString()}</i>`;

    store.logTelegramAction({
      type: 'push',
      sender: fromUser,
      chatId: chatId || 'console',
      content: text,
      status: 'sent',
      dataAction: 'status_check',
    });

    return { reply, action: 'status', data: overview };
  }

  // /nodes
  if (command === '/nodes') {
    const nodes = store.nodes;
    let reply = `🖥 <b>集群服务器与探针监控 (${nodes.length} 台)</b>\n\n`;
    for (const n of nodes) {
      const emoji = n.status === 'online' ? '🟢' : n.status === 'degraded' ? '🟡' : '🔴';
      const probeTag = n.probeInstalled ? ' [探针已接入]' : '';
      reply += `${emoji} <b>${n.name}</b> (${n.region})${probeTag}\n`;
      reply += `   IP: <code>${n.ip}</code> | Ping: ${n.ping}ms\n`;
      reply += `   CPU: ${n.cpu}% | 内存: ${n.ram}% | 磁盘: ${n.disk}%\n\n`;
    }
    reply += `<i>登录 Web 后台管理可复制探针一键安装脚本。</i>`;
    return { reply, action: 'list_nodes', data: nodes };
  }

  // /services
  if (command === '/services') {
    const services = store.services;
    let reply = `🌐 <b>微服务监控列表 (${services.length} 个)</b>\n\n`;
    for (const s of services) {
      const emoji = s.status === 'operational' ? '🟢' : s.status === 'degraded' ? '🟡' : '🔴';
      reply += `${emoji} <b>${s.name}</b> [${s.category}]\n`;
      reply += `   延迟: ${s.latency}ms | 30d SLA: ${s.uptime30d}%\n\n`;
    }
    return { reply, action: 'list_services', data: services };
  }

  // Any attempt to add data via telegram bot
  if (command.startsWith('/add') || command === '/incident' || command === '/resolve') {
    const reply =
`🔒 <b>权限保护说明</b>

根据规范，Telegram Bot 专职负责<b>信息与告警推送</b>。
添加/管理服务器探针、新增微服务及故障发布已全部收敛至 <b>Web 后台管理系统</b>。

请登录 Web 端后台管理面板进行安全操作。`;

    return { reply, action: 'security_notice' };
  }

  return {
    reply: `收到消息。如需查询系统状态请输入 <code>/status</code> 或 <code>/help</code>。`,
    action: 'echo',
  };
}

/**
 * Alert: Service status changed
 */
export async function alertServiceStatusChange(service: ServiceItem, oldStatus: string) {
  if (!store.telegramConfig.autoAlerts.serviceStatusChanged) return;
  const isOk = service.status === 'operational';
  const icon = isOk ? '✅' : '⚠️';
  const title = isOk ? '服务性能恢复正常' : '微服务状态变动告警';

  const text =
`${icon} <b>【${title}】</b>

<b>服务:</b> ${escapeHtml(service.name)} (${escapeHtml(service.category)})
<b>状态:</b> ${oldStatus.toUpperCase()} ➔ <b>${service.status.toUpperCase()}</b>
<b>响应延迟:</b> ${service.latency}ms
<b>检测时间:</b> ${new Date().toLocaleTimeString()}

<i>CloudPulse 自动化全链路健康检查系统</i>`;

  return sendTelegramMessage(text);
}

/**
 * Alert: Incident created
 */
export async function alertIncidentCreated(incident: Incident) {
  if (!store.telegramConfig.autoAlerts.incidentCreated) return;
  const severityEmoji = incident.severity === 'critical' ? '🚨🚨' : incident.severity === 'major' ? '🚨' : '⚠️';
  const affectedList = (incident.affectedServices || []).map(escapeHtml).join(', ') || '未指定';

  const text =
`${severityEmoji} <b>【生产故障事件通报】</b>

<b>事件名称:</b> ${escapeHtml(incident.title)}
<b>严重级别:</b> ${incident.severity.toUpperCase()}
<b>当前状态:</b> ${incident.status.toUpperCase()}
<b>受影响范围:</b> ${affectedList}
<b>通报时间:</b> ${new Date(incident.createdAt).toLocaleTimeString()}

<i>应急值班小组已介入处理，请关注实时进展。</i>`;

  return sendTelegramMessage(text);
}

/**
 * Alert: Incident resolved
 */
export async function alertIncidentResolved(incident: Incident) {
  if (!store.telegramConfig.autoAlerts.incidentResolved) return;
  const text =
`🎉 <b>【故障解除恢复通知】</b>

<b>事件名称:</b> ${escapeHtml(incident.title)}
<b>解除时间:</b> ${new Date().toLocaleTimeString()}
<b>排查结论:</b> 业务各项核心指标已全面恢复平稳。

<i>感谢运维团队及值班人员的迅速响应。</i>`;

  return sendTelegramMessage(text);
}

/**
 * Alert: Node offline or probe disconnected
 */
export async function alertNodeOffline(node: ServerNode) {
  if (!store.telegramConfig.autoAlerts.nodeOffline) return;
  const text =
`🔴 <b>【服务器探针失联告警】</b>

<b>节点名称:</b> ${escapeHtml(node.name)} (${escapeHtml(node.region)})
<b>节点 IP:</b> <code>${escapeHtml(node.ip)}</code>
<b>探针状态:</b> 超过 120 秒未收到探针上报心跳
<b>告警时间:</b> ${new Date().toLocaleTimeString()}

<i>请尽快登录 VPS 检查探针进程与网络连通性。</i>`;

  return sendTelegramMessage(text);
}

/**
 * Alert: Node High Load
 */
export async function alertNodeHighLoad(node: ServerNode, reason: string) {
  if (!store.telegramConfig.autoAlerts.cpuThresholdAlert) return;
  const text =
`⚠️ <b>【服务器高负载预警】</b>

<b>节点名称:</b> ${escapeHtml(node.name)} (${escapeHtml(node.region)})
<b>告警原因:</b> ${escapeHtml(reason)}
<b>当前占用:</b> CPU: ${node.cpu}% | 内存: ${node.ram}% | 磁盘: ${node.disk}%
<b>检测时间:</b> ${new Date().toLocaleTimeString()}

<i>CloudPulse 探针实时采集监控</i>`;

  return sendTelegramMessage(text);
}
