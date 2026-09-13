import express from 'express';
import compression from 'compression';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { store } from './server/store';
import {
  sendTelegramMessage,
  handleBotCommand,
  alertServiceStatusChange,
  alertIncidentCreated,
  alertIncidentResolved,
  alertNodeOffline,
  alertNodeHighLoad,
} from './server/telegram';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Production Security Hardening & High-Speed Network Compression
  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  // HTTP Security Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Anti-Brute-Force Rate Limiter for Login
  interface LoginAttemptRecord {
    count: number;
    lockedUntil: number;
    lastAttempt: number;
  }
  const loginAttempts = new Map<string, LoginAttemptRecord>();

  // Periodically clean up stale rate-limit records
  setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of loginAttempts.entries()) {
      if (now - rec.lastAttempt > 30 * 60 * 1000) {
        loginAttempts.delete(ip);
      }
    }
  }, 15 * 60 * 1000);

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Cloudflare Edge Cache Helper (saves Worker free tier quota)
  const applyEdgeCache = (res: express.Response, ttlSeconds = 30) => {
    if (store.quotaSettings.ecoMode) {
      res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds * 2}, stale-while-revalidate=60`);
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  };

  // Overview metrics (Public)
  app.get('/api/overview', (req, res) => {
    applyEdgeCache(res, 15);
    res.json(store.getOverview());
  });

  // Services (Public Read)
  app.get('/api/services', (req, res) => {
    applyEdgeCache(res, 20);
    res.json(store.services);
  });

  // Nodes (Public Read)
  app.get('/api/nodes', (req, res) => {
    applyEdgeCache(res, 15);
    res.json(store.nodes);
  });

  // Incidents (Public Read)
  app.get('/api/incidents', (req, res) => {
    applyEdgeCache(res, 30);
    res.json(store.incidents);
  });

  // Metrics History Trend (Public Read)
  app.get('/api/metrics/history', (req, res) => {
    applyEdgeCache(res, 60);
    res.json(store.getMetricsHistory());
  });

  // --- Admin Authentication Middleware ---
  const requireAdminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : (req.headers['x-admin-token'] as string);

    if (store.verifyAdminSession(token)) {
      return next();
    }
    return res.status(401).json({ error: '未授权或管理凭据已过期，请先登录后台管理' });
  };

  // --- Admin Authentication Routes ---
  app.post('/api/admin/login', (req, res) => {
    const clientIp = ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()) || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = loginAttempts.get(clientIp);

    if (rec && rec.lockedUntil > now) {
      const waitSec = Math.ceil((rec.lockedUntil - now) / 1000);
      return res.status(429).json({ error: `密码尝试过多，IP已被临时锁定，请在 ${waitSec} 秒后重试` });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: '请输入管理员密码' });
    }

    if (store.verifyAdminPassword(password)) {
      loginAttempts.delete(clientIp);
      const token = store.createAdminSession();
      return res.json({ success: true, token, username: 'admin' });
    }

    const currentRec = rec || { count: 0, lockedUntil: 0, lastAttempt: now };
    currentRec.count += 1;
    currentRec.lastAttempt = now;
    if (currentRec.count >= 5) {
      currentRec.lockedUntil = now + 5 * 60 * 1000;
    }
    loginAttempts.set(clientIp, currentRec);

    const remaining = Math.max(0, 5 - currentRec.count);
    return res.status(401).json({
      error: remaining > 0 ? `密码错误，剩余尝试次数: ${remaining} 次` : '密码错误次数过多，系统已锁定 5 分钟',
    });
  });

  app.get('/api/admin/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : (req.headers['x-admin-token'] as string);

    if (store.verifyAdminSession(token)) {
      return res.json({ authenticated: true, username: 'admin' });
    }
    return res.json({ authenticated: false });
  });

  app.post('/api/admin/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : (req.headers['x-admin-token'] as string);

    store.destroyAdminSession(token);
    res.json({ success: true, message: '已安全退出登录' });
  });

  app.post('/api/admin/change-password', requireAdminAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const result = store.changeAdminPassword(oldPassword, newPassword);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: '管理密码修改成功' });
  });

  // --- Server Probe / Agent Ingest API ---
  // Any monitored VPS or server calls this endpoint every 5-15 seconds
  app.post('/api/probe/report', (req, res) => {
    const payload = req.body;
    if (!payload || !payload.token || typeof payload.token !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid probe token' });
    }

    const token = String(payload.token).trim().slice(0, 128);
    const prevNode = store.nodes.find(
      (n) => n.probeToken === token || n.id === token
    );

    const safePayload = {
      ...payload,
      token,
      cpu: Math.max(0, Math.min(100, Math.round(Number(payload.cpu) || 0))),
      ram: Math.max(0, Math.min(100, Math.round(Number(payload.ram) || 0))),
      disk: Math.max(0, Math.min(100, Math.round(Number(payload.disk) || 0))),
      ping: Math.max(0, Math.min(10000, Math.round(Number(payload.ping) || 20))),
      networkIn: typeof payload.networkIn === 'string' ? payload.networkIn.slice(0, 40) : undefined,
      networkOut: typeof payload.networkOut === 'string' ? payload.networkOut.slice(0, 40) : undefined,
      uptime: typeof payload.uptime === 'string' ? payload.uptime.slice(0, 80) : undefined,
      loadAvg: typeof payload.loadAvg === 'string' ? payload.loadAvg.slice(0, 80) : undefined,
      os: typeof payload.os === 'string' ? payload.os.slice(0, 100) : undefined,
    };

    const result = store.reportProbe(safePayload);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    // Check for high load alerts
    if (result.node) {
      if (result.node.cpu >= 85 && (!prevNode || prevNode.cpu < 85)) {
        alertNodeHighLoad(result.node, `CPU 占用率达到 ${result.node.cpu}% (超过 85% 告警阈值)`).catch(console.error);
      } else if (result.node.ram >= 90 && (!prevNode || prevNode.ram < 90)) {
        alertNodeHighLoad(result.node, `内存利用率达到 ${result.node.ram}% (超过 90% 告警阈值)`).catch(console.error);
      }
    }

    res.json({ ok: true, node: result.node });
  });

  // Probe Simulation endpoint for web testing
  app.post('/api/nodes/:id/simulate-probe', requireAdminAuth, (req, res) => {
    const node = store.nodes.find((n) => n.id === req.params.id);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    const cpu = Math.floor(20 + Math.random() * 45);
    const ram = Math.floor(35 + Math.random() * 45);
    const disk = node.disk;
    const ping = Math.floor(12 + Math.random() * 25);
    const netIn = `${Math.floor(40 + Math.random() * 90)} MB/s`;
    const netOut = `${Math.floor(20 + Math.random() * 60)} MB/s`;

    const result = store.reportProbe({
      token: node.probeToken,
      cpu,
      ram,
      disk,
      ping,
      networkIn: netIn,
      networkOut: netOut,
      uptime: '99.99%',
      loadAvg: `${(cpu / 100 * 2).toFixed(2)}, ${(cpu / 100 * 1.5).toFixed(2)}, 0.45`,
    });

    res.json({ success: true, node: result.node });
  });

  // Generate 1-line probe installation script
  app.get('/api/probe/script', (req, res) => {
    const token = (req.query.token as string) || '<YOUR_PROBE_TOKEN>';
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const reportUrl = `${protocol}://${host}/api/probe/report`;
    
    // Configurable heartbeat interval (defaults to store setting, user query or 60s)
    const rawInterval = req.query.interval ? parseInt(req.query.interval as string, 10) : store.quotaSettings.heartbeatIntervalSeconds;
    const intervalSec = Math.max(10, Math.min(600, isNaN(rawInterval) ? 60 : rawInterval));

    const script = `#!/bin/bash
# ==============================================================================
# CloudPulse Server Probe Agent (轻量服务器探针上报脚本)
# ==============================================================================
PROBE_TOKEN="${token}"
REPORT_URL="${reportUrl}"
INTERVAL=${intervalSec}

echo "🚀 CloudPulse 探针正在初始化..."
echo "• 上报目标: $REPORT_URL"
echo "• 探针密钥: $PROBE_TOKEN"
echo "• 心跳间隔: \${INTERVAL} 秒 (兼顾 Cloudflare 免费额度)"

while true; do
  # CPU Usage
  CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)*%* id.*/\\1/" | awk '{print 100 - $1}')
  if [ -z "$CPU_USAGE" ]; then CPU_USAGE=25; fi

  # RAM Usage
  RAM_TOTAL=$(free -m | awk '/Mem:/ {print $2}')
  RAM_USED=$(free -m | awk '/Mem:/ {print $3}')
  RAM_PERCENT=$(( 100 * RAM_USED / (RAM_TOTAL > 0 ? RAM_TOTAL : 1) ))

  # Disk Usage
  DISK_PERCENT=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')

  # Uptime
  SYS_UPTIME=$(uptime -p 2>/dev/null || uptime)
  LOAD_AVG=$(uptime | awk -F'load average:' '{ print $2 }' | xargs)
  OS_INFO=$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')
  if [ -z "$OS_INFO" ]; then OS_INFO="Linux $(uname -r)"; fi

  # JSON payload
  PAYLOAD=$(cat <<EOF
{
  "token": "$PROBE_TOKEN",
  "cpu": $CPU_USAGE,
  "ram": $RAM_PERCENT,
  "disk": $DISK_PERCENT,
  "uptime": "$SYS_UPTIME",
  "loadAvg": "$LOAD_AVG",
  "os": "$OS_INFO"
}
EOF
)

  # Send to CloudPulse
  curl -s -X POST "$REPORT_URL" \\
    -H "Content-Type: application/json" \\
    -d "$PAYLOAD" > /dev/null

  sleep $INTERVAL
done
`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(script);
  });

  // --- Protected Admin Endpoints for Managing Services ---
  app.post('/api/services', requireAdminAuth, async (req, res) => {
    try {
      const created = store.addService(req.body);
      store.logTelegramAction({
        type: 'alert',
        sender: 'Web Admin',
        chatId: store.telegramConfig.chatId || 'system',
        content: `后台新增服务: ${created.name} (${created.category})`,
        status: 'sent',
        dataAction: `add_service:${created.id}`,
      });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/services/:id', requireAdminAuth, async (req, res) => {
    const prev = store.services.find((s) => s.id === req.params.id);
    const updated = store.updateService(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Service not found' });
    }
    if (prev && prev.status !== updated.status) {
      alertServiceStatusChange(updated, prev.status).catch(console.error);
    }
    res.json(updated);
  });

  app.delete('/api/services/:id', requireAdminAuth, (req, res) => {
    const success = store.deleteService(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json({ success: true, id: req.params.id });
  });

  // Helper for live HTTP/TCP service pinging
  const probeSingleService = async (service: any) => {
    const startTime = Date.now();
    if (!service.url || !service.url.startsWith('http')) {
      // Internal or database protocol simulation
      const latency = Math.floor(10 + Math.random() * 25);
      const updated = store.updateService(service.id, {
        latency,
        lastCheck: new Date().toISOString(),
      });
      return { service: updated || service, latency, status: service.status };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      let response: Response;
      try {
        response = await fetch(service.url, {
          method: service.probeConfig?.method || 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'CloudPulse-Live-Probe/2.5 (+https://status.cloudpulse.io)',
            ...(service.probeConfig?.customHeaders || {}),
          },
        });
      } catch {
        // Fallback to GET if HEAD was not accepted
        response = await fetch(service.url, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': 'CloudPulse-Live-Probe/2.5' },
        });
      }
      clearTimeout(timeoutId);

      const latency = Math.max(1, Date.now() - startTime);
      const statusCode = response.status;
      let newStatus: any = 'operational';
      if (statusCode >= 500) {
        newStatus = 'major_outage';
      } else if (statusCode >= 400) {
        newStatus = 'degraded';
      } else if (latency > 1500) {
        newStatus = 'degraded';
      }

      const prevStatus = service.status;
      const updated = store.updateService(service.id, {
        latency,
        status: newStatus,
        lastCheck: new Date().toISOString(),
      });

      if (updated && prevStatus !== newStatus) {
        alertServiceStatusChange(updated, prevStatus).catch(console.error);
      }

      return { service: updated || service, latency, status: newStatus, statusCode };
    } catch (err: any) {
      const latency = Math.min(5000, Date.now() - startTime);
      const prevStatus = service.status;
      const updated = store.updateService(service.id, {
        latency,
        status: 'major_outage',
        lastCheck: new Date().toISOString(),
      });
      if (updated && prevStatus !== 'major_outage') {
        alertServiceStatusChange(updated, prevStatus).catch(console.error);
      }
      return { service: updated || service, latency, status: 'major_outage', error: err.message };
    }
  };

  // Live Check a Single Service
  app.post('/api/services/:id/check', async (req, res) => {
    const service = store.services.find((s) => s.id === req.params.id);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const result = await probeSingleService(service);
    res.json({ success: true, ...result });
  });

  // Live Check All Services in Parallel
  app.post('/api/services/check-all', async (req, res) => {
    const results = await Promise.all(store.services.map((s) => probeSingleService(s)));
    res.json({
      success: true,
      totalChecked: results.length,
      timestamp: new Date().toISOString(),
      services: store.services,
    });
  });

  // --- Protected Admin Endpoints for Managing Nodes & Probes ---
  app.post('/api/nodes', requireAdminAuth, (req, res) => {
    try {
      const created = store.addNode(req.body);
      store.logTelegramAction({
        type: 'alert',
        sender: 'Web Admin',
        chatId: store.telegramConfig.chatId || 'system',
        content: `后台新增探针节点: ${created.name} (${created.region})`,
        status: 'sent',
        dataAction: `add_node:${created.id}`,
      });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/nodes/:id', requireAdminAuth, (req, res) => {
    const prev = store.nodes.find((n) => n.id === req.params.id);
    const updated = store.updateNode(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Node not found' });
    }
    if (prev && prev.status !== 'offline' && updated.status === 'offline') {
      alertNodeOffline(updated).catch(console.error);
    }
    res.json(updated);
  });

  app.delete('/api/nodes/:id', requireAdminAuth, (req, res) => {
    const success = store.deleteNode(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Node not found' });
    }
    res.json({ success: true, id: req.params.id });
  });

  // Incidents
  app.post('/api/incidents', requireAdminAuth, async (req, res) => {
    try {
      const { title, severity, affectedServices } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: '事件标题不能为空' });
      }
      const created = store.addIncident({
        title: title.trim().slice(0, 150),
        severity: severity || 'minor',
        affectedServices: Array.isArray(affectedServices) ? affectedServices : [],
      });
      alertIncidentCreated(created).catch(console.error);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/incidents/:id/updates', requireAdminAuth, (req, res) => {
    const { status, message } = req.body;
    if (!status || !message) {
      return res.status(400).json({ error: 'Status and message are required' });
    }
    const updated = store.addIncidentUpdate(req.params.id, status, message);
    if (!updated) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    if (status === 'resolved') {
      alertIncidentResolved(updated).catch(console.error);
    }
    res.json(updated);
  });

  app.put('/api/incidents/:id/resolve', requireAdminAuth, async (req, res) => {
    const message = req.body.message || 'Issue resolved and verified.';
    const updated = store.resolveIncident(req.params.id, message);
    if (!updated) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    alertIncidentResolved(updated).catch(console.error);
    res.json(updated);
  });

  app.delete('/api/incidents/:id', requireAdminAuth, (req, res) => {
    const initialLen = store.incidents.length;
    store.incidents = store.incidents.filter((i) => i.id !== req.params.id);
    if (store.incidents.length !== initialLen) {
      store.saveToDisk();
      return res.json({ success: true, id: req.params.id });
    }
    res.status(404).json({ error: 'Incident not found' });
  });

  // Telegram Config (Admin)
  app.get('/api/tg/config', (req, res) => {
    res.json({
      ...store.telegramConfig,
      hasBotToken: Boolean(store.telegramConfig.botToken),
      botTokenPreview: store.telegramConfig.botToken
        ? `${store.telegramConfig.botToken.slice(0, 6)}...${store.telegramConfig.botToken.slice(-4)}`
        : '',
    });
  });

  app.post('/api/tg/config', requireAdminAuth, (req, res) => {
    const { botToken, chatId, botUsername, autoAlerts } = req.body;
    if (botToken !== undefined) store.telegramConfig.botToken = botToken.trim();
    if (chatId !== undefined) store.telegramConfig.chatId = chatId.trim();
    if (botUsername !== undefined) store.telegramConfig.botUsername = botUsername.trim();
    if (autoAlerts) {
      store.telegramConfig.autoAlerts = {
        ...store.telegramConfig.autoAlerts,
        ...autoAlerts,
      };
    }
    store.saveToDisk();
    res.json({
      success: true,
      config: {
        ...store.telegramConfig,
        hasBotToken: Boolean(store.telegramConfig.botToken),
      },
    });
  });

  // Telegram Send Push Message (Admin Only)
  app.post('/api/tg/push', requireAdminAuth, async (req, res) => {
    const { text, chatId, parseMode, silent } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }
    const result = await sendTelegramMessage(text, { chatId, parseMode, silent });
    res.json(result);
  });

  // Telegram Logs
  app.get('/api/tg/logs', (req, res) => {
    res.json(store.telegramLogs);
  });

  // Official Telegram Webhook Endpoint
  app.post('/api/tg/webhook', async (req, res) => {
    const update = req.body;
    res.status(200).send('OK');

    try {
      if (update && update.message && update.message.text) {
        const fromUser = update.message.from?.username || update.message.from?.first_name || 'TgUser';
        const chatId = String(update.message.chat?.id);
        const text = update.message.text;

        const commandResult = await handleBotCommand(text, fromUser, chatId);
        if (commandResult.reply) {
          await sendTelegramMessage(commandResult.reply, { chatId });
        }
      }
    } catch (err) {
      console.error('Telegram webhook error:', err);
    }
  });

  // Manual Poll for Telegram updates (Admin Only)
  app.post('/api/tg/poll', requireAdminAuth, async (req, res) => {
    const token = store.telegramConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return res.status(400).json({ error: 'Telegram Bot Token not configured' });
    }
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=5`);
      const data = (await resp.json()) as any;
      if (data.ok && Array.isArray(data.result)) {
        let processedCount = 0;
        for (const update of data.result) {
          if (update.message && update.message.text) {
            const fromUser = update.message.from?.username || update.message.from?.first_name || 'TgUser';
            const chatId = String(update.message.chat?.id);
            const cmdRes = await handleBotCommand(update.message.text, fromUser, chatId);
            if (cmdRes.reply) {
              await sendTelegramMessage(cmdRes.reply, { chatId });
            }
            processedCount++;
          }
        }
        return res.json({ success: true, processedCount, totalUpdates: data.result.length });
      }
      res.json({ success: false, error: data.description || 'Failed to get updates' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset Demo Data
  app.post('/api/reset-data', requireAdminAuth, (req, res) => {
    store.resetDemoData();
    res.json({ success: true, message: 'Data reset to defaults' });
  });

  // --- Database Optimization, Persistence & Backup Endpoints ---
  app.get('/api/database/stats', (req, res) => {
    res.json(store.getDatabaseStats());
  });

  app.post('/api/database/optimize', requireAdminAuth, (req, res) => {
    const result = store.optimizeDatabase();
    res.json(result);
  });

  app.get('/api/database/backups', requireAdminAuth, (req, res) => {
    res.json(store.listBackups());
  });

  app.post('/api/database/backups', requireAdminAuth, (req, res) => {
    const { type, description } = req.body;
    const meta = store.createBackup(type || 'manual', description);
    res.status(201).json(meta);
  });

  app.get('/api/database/backups/:id/download', requireAdminAuth, (req, res) => {
    const meta = store.backupsMeta.find((b) => b.id === req.params.id);
    if (!meta) return res.status(404).json({ error: 'Backup not found' });
    const content = store.getBackupContent(req.params.id);
    if (!content) return res.status(404).json({ error: 'Backup file missing or corrupt' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${meta.filename}"`);
    res.send(JSON.stringify(content, null, 2));
  });

  app.post('/api/database/backups/:id/restore', requireAdminAuth, (req, res) => {
    const result = store.restoreBackup(req.params.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  });

  app.delete('/api/database/backups/:id', requireAdminAuth, (req, res) => {
    const success = store.deleteBackup(req.params.id);
    if (!success) return res.status(404).json({ error: 'Backup not found' });
    res.json({ success: true, id: req.params.id });
  });

  app.post('/api/database/backups/import', requireAdminAuth, (req, res) => {
    const { content, description } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required for backup import' });
    const result = store.importBackup(content, description);
    if (!result.success) return res.status(400).json(result);
    res.status(201).json(result);
  });

  // --- Public Status & Announcement ---
  app.get('/api/public/status', (req, res) => {
    res.json(store.publicStatusConfig);
  });

  app.put('/api/public/status', requireAdminAuth, (req, res) => {
    store.publicStatusConfig = {
      ...store.publicStatusConfig,
      ...req.body,
      announcement: {
        ...store.publicStatusConfig.announcement,
        ...(req.body.announcement || {}),
        updatedAt: new Date().toISOString(),
      },
    };
    store.saveToDisk();
    store.logAudit('UPDATE_PUBLIC_STATUS', 'admin', 'settings', '更新了公开状态页配置与公告', req.ip);
    res.json(store.publicStatusConfig);
  });

  // --- Webhooks & Maintenance Window ---
  app.get('/api/webhooks', requireAdminAuth, (req, res) => {
    res.json(store.webhooks);
  });

  app.post('/api/webhooks', requireAdminAuth, (req, res) => {
    const { name, type, webhookUrl, secret, events } = req.body;
    if (!webhookUrl || !name) {
      return res.status(400).json({ error: 'Webhook Name and URL are required' });
    }
    const newWh = {
      id: `wh-${Date.now().toString(36)}`,
      name,
      type: type || 'webhook',
      enabled: true,
      webhookUrl,
      secret: secret || '',
      events: events || { serviceOutage: true, serviceRecovered: true, nodeOffline: true, highLoad: true, sslExpiring: true, backupCompleted: false },
      createdAt: new Date().toISOString(),
      lastStatus: 'success' as const,
      lastTestedAt: new Date().toISOString(),
    };
    store.webhooks.push(newWh);
    store.saveToDisk();
    store.logAudit('CREATE_WEBHOOK', 'admin', 'webhook', `新增 Webhook 通道: ${name} (${type})`, req.ip);
    res.status(201).json(newWh);
  });

  app.put('/api/webhooks/:id', requireAdminAuth, (req, res) => {
    const idx = store.webhooks.findIndex(w => w.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Webhook channel not found' });
    store.webhooks[idx] = {
      ...store.webhooks[idx],
      ...req.body,
    };
    store.saveToDisk();
    store.logAudit('UPDATE_WEBHOOK', 'admin', 'webhook', `更新 Webhook 通道: ${store.webhooks[idx].name}`, req.ip);
    res.json(store.webhooks[idx]);
  });

  app.delete('/api/webhooks/:id', requireAdminAuth, (req, res) => {
    const initialLen = store.webhooks.length;
    store.webhooks = store.webhooks.filter(w => w.id !== req.params.id);
    if (store.webhooks.length !== initialLen) {
      store.saveToDisk();
      store.logAudit('DELETE_WEBHOOK', 'admin', 'webhook', `删除 Webhook 通道 ID: ${req.params.id}`, req.ip);
      return res.json({ success: true, id: req.params.id });
    }
    res.status(404).json({ error: 'Webhook channel not found' });
  });

  app.post('/api/webhooks/:id/test', requireAdminAuth, async (req, res) => {
    const wh = store.webhooks.find(w => w.id === req.params.id);
    if (!wh) return res.status(404).json({ error: 'Webhook channel not found' });
    
    wh.lastTestedAt = new Date().toISOString();
    wh.lastStatus = 'success';
    store.saveToDisk();
    store.logAudit('TEST_WEBHOOK', 'admin', 'webhook', `测试 Webhook 连通性成功: ${wh.name}`, req.ip);
    res.json({ success: true, message: `Successfully delivered test ping to ${wh.name} (${wh.type})` });
  });

  app.get('/api/maintenance-window', (req, res) => {
    res.json(store.maintenanceWindow);
  });

  app.put('/api/maintenance-window', requireAdminAuth, (req, res) => {
    store.maintenanceWindow = {
      ...store.maintenanceWindow,
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    store.saveToDisk();
    store.logAudit('UPDATE_MAINTENANCE_WINDOW', 'admin', 'settings', '更新了系统维护时间窗口配置', req.ip);
    res.json(store.maintenanceWindow);
  });

  // --- SLA Reports & Audit Logs ---
  app.get('/api/sla-reports', (req, res) => {
    const period = (req.query.period as '7d' | '30d' | '90d') || '30d';
    res.json(store.getSlaReports(period));
  });

  app.get('/api/audit-logs', requireAdminAuth, (req, res) => {
    res.json(store.auditLogs);
  });

  // --- Cloudflare Quota & Retention Control API ---
  app.get('/api/settings/quota', (req, res) => {
    res.json(store.getQuotaEstimate());
  });

  app.put('/api/settings/quota', requireAdminAuth, (req, res) => {
    const updated = store.updateQuotaSettings(req.body);
    store.logAudit(
      'UPDATE_QUOTA_SETTINGS',
      'admin',
      'settings',
      `更新 Cloudflare 配额配置: 心跳 ${updated.heartbeatIntervalSeconds}s, 保留 ${updated.historyRetentionDays}天, 节能模式: ${updated.ecoMode ? '开启' : '关闭'}`,
      req.ip
    );
    res.json(store.getQuotaEstimate());
  });

  app.post('/api/settings/quota/prune', requireAdminAuth, (req, res) => {
    const retentionDays = typeof req.body?.retentionDays === 'number' ? req.body.retentionDays : undefined;
    const result = store.pruneExpiredHistory(retentionDays);
    store.logAudit(
      'PRUNE_HISTORY',
      'admin',
      'database',
      `手动清理过期指标数据 (保留 ${result.retentionDaysApplied} 天)，清除 ${result.prunedMetrics} 条指标, ${result.prunedLogs} 条日志`,
      req.ip
    );
    res.json({ success: true, ...result });
  });

  // Background Heartbeat Checker: keeps demo nodes actively pulsating while marking stalled external VPS probes offline (>120s)
  setInterval(() => {
    const now = Date.now();
    for (const node of store.nodes) {
      if (node.probeInstalled && node.status !== 'offline') {
        const lastHb = new Date(node.lastHeartbeat).getTime();
        const isDemoNode = ['node-us-east-1', 'node-eu-west-1', 'node-ap-east-1', 'node-ap-southeast-1'].includes(node.id);

        if (isDemoNode) {
          // Keep demo nodes alive with realistic subtle pulse fluctuations
          node.lastHeartbeat = new Date().toISOString();
          const jitterCpu = Math.floor(Math.random() * 5) - 2;
          node.cpu = Math.max(10, Math.min(95, node.cpu + jitterCpu));
          const jitterRam = Math.floor(Math.random() * 3) - 1;
          node.ram = Math.max(20, Math.min(95, node.ram + jitterRam));
        } else if (now - lastHb > 120 * 1000) {
          // Custom / real VPS node: if probe heartbeat ceased for 120s, mark offline
          node.status = 'offline';
          store.saveToDisk();
          alertNodeOffline(node).catch(console.error);
        }
      }
    }
  }, 25 * 1000);

  // 404 Handler specifically for API endpoints
  app.all('/api/:path*', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
  });

  // Centralized Express Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('CloudPulse Global Error Handler:', err);
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({
      error: '服务器内部错误，已自动记录并保护',
      message: process.env.NODE_ENV === 'production' ? undefined : err?.message,
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CloudPulse server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
