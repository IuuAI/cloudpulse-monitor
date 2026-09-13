import Database from 'better-sqlite3';
import { StorageAdapter } from '../../core/types';
import fs from 'fs';
import path from 'path';

export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(dbPath = './data/app.db') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.initSchema();
    this.seedDefaultData();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS system_overview (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        uptime REAL NOT NULL,
        total_nodes INTEGER NOT NULL,
        healthy_nodes INTEGER NOT NULL,
        active_incidents INTEGER NOT NULL,
        avg_latency INTEGER NOT NULL,
        last_checked TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        latency INTEGER NOT NULL,
        uptime REAL NOT NULL,
        last_check TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS server_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        region TEXT NOT NULL,
        ip TEXT NOT NULL,
        status TEXT NOT NULL,
        cpu INTEGER NOT NULL,
        ram INTEGER NOT NULL,
        disk INTEGER NOT NULL,
        ping INTEGER NOT NULL,
        network_in TEXT NOT NULL,
        network_out TEXT NOT NULL,
        uptime REAL NOT NULL,
        last_seen TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        affected_services TEXT NOT NULL,
        started_at TEXT NOT NULL,
        resolved_at TEXT,
        updates TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS metrics_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        avg_latency INTEGER NOT NULL,
        cpu_load INTEGER NOT NULL,
        ram_load INTEGER NOT NULL,
        p95_latency INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telegram_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        bot_token TEXT,
        chat_id TEXT,
        enabled INTEGER NOT NULL,
        alert_on_status_change INTEGER NOT NULL,
        alert_on_high_load INTEGER NOT NULL,
        alert_on_incident INTEGER NOT NULL,
        daily_digest INTEGER NOT NULL,
        digest_time TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telegram_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT
      );

      CREATE TABLE IF NOT EXISTS quota_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        worker_daily_request_limit INTEGER NOT NULL,
        history_retention_days INTEGER NOT NULL,
        eco_mode INTEGER NOT NULL,
        auto_prune_expired_history INTEGER NOT NULL,
        heartbeat_interval_seconds INTEGER NOT NULL,
        client_poll_interval_seconds INTEGER NOT NULL,
        max_stored_metric_points INTEGER NOT NULL
      );
    `);
  }

  private seedDefaultData() {
    const ov = this.db.prepare("SELECT COUNT(*) as cnt FROM system_overview").get() as any;
    if (ov.cnt === 0) {
      this.db.prepare(`
        INSERT INTO system_overview (id, uptime, total_nodes, healthy_nodes, active_incidents, avg_latency, last_checked)
        VALUES (1, 99.98, 6, 6, 0, 42, ?)
      `).run(new Date().toISOString());

      const defaultServices = [
        ['gateway', 'Global API Gateway', 'Core', 'operational', 28, 99.99, new Date().toISOString()],
        ['auth', 'OAuth2 / IAM Service', 'Auth', 'operational', 45, 99.95, new Date().toISOString()],
        ['db-cluster', 'Distributed SQL Primary', 'Database', 'operational', 15, 99.99, new Date().toISOString()],
        ['storage', 'Object Storage (S3)', 'Storage', 'operational', 38, 99.90, new Date().toISOString()],
        ['ai-engine', 'Gemini AI Inference Proxy', 'AI', 'operational', 120, 99.85, new Date().toISOString()],
      ];
      const insertSrv = this.db.prepare("INSERT OR IGNORE INTO services (id, name, category, status, latency, uptime, last_check) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const s of defaultServices) insertSrv.run(...s);

      const defaultNodes = [
        ['n1', 'Edge-Tokyo-01', 'Asia (Tokyo)', '104.18.32.1', 'healthy', 24, 48, 35, 18, '1.2 TB', '4.5 TB', 99.99, new Date().toISOString()],
        ['n2', 'Edge-Frankfurt-01', 'Europe (Germany)', '104.18.32.2', 'healthy', 31, 55, 42, 29, '2.8 TB', '9.1 TB', 99.95, new Date().toISOString()],
        ['n3', 'Edge-SanJose-01', 'US West (California)', '104.18.32.3', 'healthy', 45, 62, 58, 41, '4.1 TB', '12.4 TB', 99.92, new Date().toISOString()],
        ['n4', 'Edge-Singapore-01', 'Asia (Singapore)', '104.18.32.4', 'healthy', 29, 50, 39, 22, '1.9 TB', '6.0 TB', 99.98, new Date().toISOString()],
        ['n5', 'Edge-SãoPaulo-01', 'South America (Brazil)', '104.18.32.5', 'healthy', 58, 70, 65, 85, '850 GB', '2.1 TB', 99.80, new Date().toISOString()],
        ['n6', 'Edge-Sydney-01', 'Oceania (Australia)', '104.18.32.6', 'healthy', 35, 52, 44, 52, '1.1 TB', '3.8 TB', 99.94, new Date().toISOString()],
      ];
      const insertNode = this.db.prepare("INSERT OR IGNORE INTO server_nodes (id, name, region, ip, status, cpu, ram, disk, ping, network_in, network_out, uptime, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const n of defaultNodes) insertNode.run(...n);

      this.db.prepare(`
        INSERT INTO telegram_config (id, bot_token, chat_id, enabled, alert_on_status_change, alert_on_high_load, alert_on_incident, daily_digest, digest_time)
        VALUES (1, '', '', 0, 1, 1, 1, 0, '08:00')
      `).run();

      this.db.prepare(`
        INSERT INTO quota_settings (id, worker_daily_request_limit, history_retention_days, eco_mode, auto_prune_expired_history, heartbeat_interval_seconds, client_poll_interval_seconds, max_stored_metric_points)
        VALUES (1, 100000, 30, 1, 1, 60, 30, 720)
      `).run();

      // Seed initial metric points
      const now = Date.now();
      const insertMetric = this.db.prepare("INSERT INTO metrics_history (timestamp, avg_latency, cpu_load, ram_load, p95_latency) VALUES (?, ?, ?, ?, ?)");
      for (let i = 24; i >= 0; i--) {
        const timeStr = new Date(now - i * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        insertMetric.run(timeStr, Math.floor(35 + Math.random() * 25), Math.floor(25 + Math.random() * 30), Math.floor(45 + Math.random() * 25), Math.floor(70 + Math.random() * 30));
      }
    }
  }

  async getOverview() {
    const r = this.db.prepare("SELECT * FROM system_overview WHERE id = 1").get() as any;
    return {
      uptime: r.uptime,
      totalNodes: r.total_nodes,
      healthyNodes: r.healthy_nodes,
      activeIncidents: r.active_incidents,
      avgLatency: r.avg_latency,
      lastChecked: r.last_checked
    };
  }

  async saveOverview(ov: any) {
    this.db.prepare(`
      INSERT INTO system_overview (id, uptime, total_nodes, healthy_nodes, active_incidents, avg_latency, last_checked)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        uptime = excluded.uptime,
        total_nodes = excluded.total_nodes,
        healthy_nodes = excluded.healthy_nodes,
        active_incidents = excluded.active_incidents,
        avg_latency = excluded.avg_latency,
        last_checked = excluded.last_checked
    `).run(ov.uptime, ov.totalNodes, ov.healthyNodes, ov.activeIncidents, ov.avgLatency, ov.lastChecked);
  }

  async getServices() {
    const rows = this.db.prepare("SELECT * FROM services").all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      status: r.status,
      latency: r.latency,
      uptime: r.uptime,
      lastCheck: r.last_check
    }));
  }

  async saveService(s: any) {
    this.db.prepare(`
      INSERT INTO services (id, name, category, status, latency, uptime, last_check)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        latency = excluded.latency,
        uptime = excluded.uptime,
        last_check = excluded.last_check
    `).run(s.id, s.name, s.category, s.status, s.latency, s.uptime, s.lastCheck);
  }

  async getNodes() {
    const rows = this.db.prepare("SELECT * FROM server_nodes").all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      region: r.region,
      ip: r.ip,
      status: r.status,
      cpu: r.cpu,
      ram: r.ram,
      disk: r.disk,
      ping: r.ping,
      networkIn: r.network_in,
      networkOut: r.network_out,
      uptime: r.uptime,
      lastSeen: r.last_seen
    }));
  }

  async saveNode(n: any) {
    this.db.prepare(`
      INSERT INTO server_nodes (id, name, region, ip, status, cpu, ram, disk, ping, network_in, network_out, uptime, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        cpu = excluded.cpu,
        ram = excluded.ram,
        disk = excluded.disk,
        ping = excluded.ping,
        network_in = excluded.network_in,
        network_out = excluded.network_out,
        last_seen = excluded.last_seen
    `).run(n.id, n.name, n.region, n.ip, n.status, n.cpu, n.ram, n.disk, n.ping, n.networkIn, n.networkOut, n.uptime, n.lastSeen);
  }

  async getIncidents() {
    const rows = this.db.prepare("SELECT * FROM incidents ORDER BY started_at DESC").all() as any[];
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      severity: r.severity,
      status: r.status,
      affectedServices: JSON.parse(r.affected_services || '[]'),
      startedAt: r.started_at,
      resolvedAt: r.resolved_at || undefined,
      updates: JSON.parse(r.updates || '[]')
    }));
  }

  async saveIncident(inc: any) {
    this.db.prepare(`
      INSERT INTO incidents (id, title, severity, status, affected_services, started_at, resolved_at, updates)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        resolved_at = excluded.resolved_at,
        updates = excluded.updates
    `).run(inc.id, inc.title, inc.severity, inc.status, JSON.stringify(inc.affectedServices), inc.startedAt, inc.resolvedAt || null, JSON.stringify(inc.updates));
  }

  async getMetricsHistory() {
    const rows = this.db.prepare("SELECT * FROM metrics_history ORDER BY id ASC LIMIT 200").all() as any[];
    return rows.map(r => ({
      timestamp: r.timestamp,
      avgLatency: r.avg_latency,
      cpuLoad: r.cpu_load,
      ramLoad: r.ram_load,
      p95Latency: r.p95_latency
    }));
  }

  async saveMetricPoint(pt: any) {
    this.db.prepare(`
      INSERT INTO metrics_history (timestamp, avg_latency, cpu_load, ram_load, p95_latency)
      VALUES (?, ?, ?, ?, ?)
    `).run(pt.timestamp, pt.avgLatency, pt.cpuLoad, pt.ramLoad, pt.p95Latency || pt.avgLatency * 1.4);
  }

  async getTelegramConfig() {
    const r = this.db.prepare("SELECT * FROM telegram_config WHERE id = 1").get() as any;
    return {
      botToken: r.bot_token,
      chatId: r.chat_id,
      enabled: !!r.enabled,
      alertOnStatusChange: !!r.alert_on_status_change,
      alertOnHighLoad: !!r.alert_on_high_load,
      alertOnIncident: !!r.alert_on_incident,
      dailyDigest: !!r.daily_digest,
      digestTime: r.digest_time
    };
  }

  async saveTelegramConfig(cfg: any) {
    this.db.prepare(`
      INSERT INTO telegram_config (id, bot_token, chat_id, enabled, alert_on_status_change, alert_on_high_load, alert_on_incident, daily_digest, digest_time)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        bot_token = excluded.bot_token,
        chat_id = excluded.chat_id,
        enabled = excluded.enabled,
        alert_on_status_change = excluded.alert_on_status_change,
        alert_on_high_load = excluded.alert_on_high_load,
        alert_on_incident = excluded.alert_on_incident,
        daily_digest = excluded.daily_digest,
        digest_time = excluded.digest_time
    `).run(cfg.botToken || '', cfg.chatId || '', cfg.enabled ? 1 : 0, cfg.alertOnStatusChange ? 1 : 0, cfg.alertOnHighLoad ? 1 : 0, cfg.alertOnIncident ? 1 : 0, cfg.dailyDigest ? 1 : 0, cfg.digestTime || '08:00');
  }

  async getTelegramLogs() {
    const rows = this.db.prepare("SELECT * FROM telegram_logs ORDER BY timestamp DESC LIMIT 50").all() as any[];
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      type: r.type,
      status: r.status,
      message: r.message,
      details: r.details || undefined
    }));
  }

  async saveTelegramLog(log: any) {
    this.db.prepare(`
      INSERT INTO telegram_logs (id, timestamp, type, status, message, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(log.id, log.timestamp, log.type, log.status, log.message, log.details || null);
  }

  async getQuotaSettings() {
    const r = this.db.prepare("SELECT * FROM quota_settings WHERE id = 1").get() as any;
    return {
      workerDailyRequestLimit: r.worker_daily_request_limit,
      historyRetentionDays: r.history_retention_days,
      ecoMode: !!r.eco_mode,
      autoPruneExpiredHistory: !!r.auto_prune_expired_history,
      heartbeatIntervalSeconds: r.heartbeat_interval_seconds,
      clientPollIntervalSeconds: r.client_poll_interval_seconds,
      maxStoredMetricPoints: r.max_stored_metric_points
    };
  }

  async saveQuotaSettings(q: any) {
    this.db.prepare(`
      INSERT INTO quota_settings (id, worker_daily_request_limit, history_retention_days, eco_mode, auto_prune_expired_history, heartbeat_interval_seconds, client_poll_interval_seconds, max_stored_metric_points)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        worker_daily_request_limit = excluded.worker_daily_request_limit,
        history_retention_days = excluded.history_retention_days,
        eco_mode = excluded.eco_mode,
        auto_prune_expired_history = excluded.auto_prune_expired_history,
        heartbeat_interval_seconds = excluded.heartbeat_interval_seconds,
        client_poll_interval_seconds = excluded.client_poll_interval_seconds,
        max_stored_metric_points = excluded.max_stored_metric_points
    `).run(q.workerDailyRequestLimit, q.historyRetentionDays, q.ecoMode ? 1 : 0, q.autoPruneExpiredHistory ? 1 : 0, q.heartbeatIntervalSeconds, q.clientPollIntervalSeconds, q.maxStoredMetricPoints);
  }

  async pruneHistory(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const res = this.db.prepare("DELETE FROM metrics_history WHERE timestamp < ?").run(cutoff);
    return res.changes || 0;
  }
}
