import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ServiceItem,
  ServerNode,
  Incident,
  TelegramConfig,
  TelegramLogItem,
  SystemOverview,
  ProbeReportPayload,
  MetricHistoryPoint,
  DatabaseBackupMeta,
  DatabaseEngineStats,
  DatabaseOptimizationResult,
  WebhookChannelConfig,
  MaintenanceWindowConfig,
  PublicStatusConfig,
  AuditLogItem,
  SlaReportResponse,
  ServiceSlaSummary,
  SslCertInfo,
  CloudflareQuotaConfig,
  CloudflareQuotaEstimate,
} from '../src/types';

const DATA_FILE = path.join(process.cwd(), 'data_store.json');
const TMP_DATA_FILE = path.join(process.cwd(), 'data_store.tmp.json');
const FAILSAFE_BACKUP_FILE = path.join(process.cwd(), 'data_store.failsafe.json');
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const BACKUP_INDEX_FILE = path.join(BACKUP_DIR, 'backups_meta.json');

function generate24HourMetricsHistory(nodes: ServerNode[], services: ServiceItem[] = []): MetricHistoryPoint[] {
  const points: MetricHistoryPoint[] = [];
  const now = new Date();
  const currentAvgCpu = nodes.length > 0 ? Math.round(nodes.reduce((acc, n) => acc + n.cpu, 0) / nodes.length) : 32;
  const currentAvgRam = nodes.length > 0 ? Math.round(nodes.reduce((acc, n) => acc + n.ram, 0) / nodes.length) : 58;

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = d.getHours().toString().padStart(2, '0') + ':00';
    
    // Simulate diurnal pattern (lower at night, higher in business hours)
    const h = d.getHours();
    const diurnalFactor = Math.sin(((h - 8) / 24) * 2 * Math.PI) * 12;
    const randomNoise = (Math.sin(i * 1.7) * 4);

    let avgCpu = Math.round(currentAvgCpu + diurnalFactor * 0.7 + randomNoise);
    avgCpu = Math.max(10, Math.min(95, avgCpu));

    let avgRam = Math.round(currentAvgRam + (diurnalFactor * 0.4) + (Math.cos(i * 1.3) * 3));
    avgRam = Math.max(20, Math.min(92, avgRam));

    if (i === 0) {
      avgCpu = currentAvgCpu;
      avgRam = currentAvgRam;
    }

    const peakCpu = Math.min(98, Math.round(avgCpu + 12 + Math.abs(Math.sin(i)) * 10));
    const peakRam = Math.min(96, Math.round(avgRam + 8 + Math.abs(Math.cos(i)) * 6));

    // Response Latency correlation with CPU load & traffic curve
    const baseLatency = 24;
    const loadPenalty = (avgCpu / 100) * 18; // Higher load increases queuing delay
    const diurnalLatency = Math.max(0, diurnalFactor * 0.4);
    const randomJitter = Math.round(Math.abs(Math.sin(i * 2.3 + 1)) * 5);
    // Peak hour micro-burst (e.g. 14:00 or 20:00)
    const peakHourSpike = (h === 14 || h === 20) ? 28 : (i === 8 ? 36 : 0);

    const avgLatency = Math.round(Math.max(12, baseLatency + loadPenalty + diurnalLatency + randomJitter));
    const peakLatency = Math.round(avgLatency + 24 + Math.abs(Math.cos(i * 1.6)) * 20 + peakHourSpike);
    const p95Latency = Math.round(avgLatency + (peakLatency - avgLatency) * 0.65);
    const minLatency = Math.max(8, Math.round(avgLatency * 0.62));
    const jitter = Math.round(Math.abs(Math.sin(i * 1.8)) * 4 + 1);

    // Microservice breakdowns
    const serviceLatencies = {
      cdn: Math.max(10, Math.round(avgLatency * 0.65)),
      api: Math.max(18, Math.round(avgLatency * 1.1)),
      db: Math.max(8, Math.round(avgLatency * 0.45)),
      redis: Math.max(2, Math.round(avgLatency * 0.15)),
      gateway: Math.max(25, Math.round(avgLatency * 1.35)),
    };

    points.push({
      timestamp: d.toISOString(),
      timeLabel: hour,
      avgCpu,
      avgRam,
      peakCpu,
      peakRam,
      activeNodes: nodes.filter(n => n.status !== 'offline').length || nodes.length,
      avgLatency,
      peakLatency,
      p95Latency,
      minLatency,
      jitter,
      serviceLatencies,
    });
  }
  return points;
}

function generate30DayHistory(baseStatus: 'operational' | 'degraded' = 'operational') {
  const history = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    let status: 'operational' | 'degraded' | 'outage' = 'operational';
    if (baseStatus === 'degraded' && i < 2) {
      status = 'degraded';
    } else if (i === 12 && Math.random() > 0.6) {
      status = 'degraded';
    }
    history.push({ date: dateStr, status });
  }
  return history;
}

function generateProbeToken(prefix = 'prb'): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

const initialServices: ServiceItem[] = [
  {
    id: 'srv-frontend-cdn',
    name: 'Web Application & Edge CDN',
    category: 'Frontend',
    url: 'https://app.cloudpulse.io',
    status: 'operational',
    latency: 28,
    uptime30d: 99.99,
    uptimeHistory: generate30DayHistory('operational'),
    lastCheck: new Date().toISOString(),
    description: 'Global Cloudflare edge caching, Next.js / Vite SPA assets distribution',
  },
  {
    id: 'srv-rest-api',
    name: 'REST & GraphQL Core Gateway',
    category: 'API',
    url: 'https://api.cloudpulse.io/v1/health',
    status: 'operational',
    latency: 42,
    uptime30d: 99.96,
    uptimeHistory: generate30DayHistory('operational'),
    lastCheck: new Date().toISOString(),
    description: 'High-throughput microservices gateway and rate-limited router',
  },
  {
    id: 'srv-postgres-cluster',
    name: 'Primary PostgreSQL Database Cluster',
    category: 'Database',
    url: 'postgres://db-primary.cloudpulse.internal:5432',
    status: 'operational',
    latency: 14,
    uptime30d: 99.99,
    uptimeHistory: generate30DayHistory('operational'),
    lastCheck: new Date().toISOString(),
    description: 'HA multi-region replicated PostgreSQL 16 cluster with automated failover',
  },
  {
    id: 'srv-redis-cache',
    name: 'Redis Cache & Event PubSub',
    category: 'Cache',
    url: 'redis://cache-cluster.cloudpulse.internal:6379',
    status: 'operational',
    latency: 3,
    uptime30d: 100.0,
    uptimeHistory: generate30DayHistory('operational'),
    lastCheck: new Date().toISOString(),
    description: 'In-memory distributed session store, caching & message queues',
  },
  {
    id: 'srv-tg-bot',
    name: 'Telegram Bot & Notification Engine',
    category: 'Integration',
    url: 'https://api.telegram.org',
    status: 'operational',
    latency: 86,
    uptime30d: 99.98,
    uptimeHistory: generate30DayHistory('operational'),
    lastCheck: new Date().toISOString(),
    description: 'Webhook listener, message dispatcher, and interactive bot handler',
  },
  {
    id: 'srv-payment-gateway',
    name: 'Billing & Payment Gateway Service',
    category: 'Payments',
    url: 'https://payments.cloudpulse.io/health',
    status: 'operational',
    latency: 112,
    uptime30d: 99.94,
    uptimeHistory: generate30DayHistory('operational'),
    lastCheck: new Date().toISOString(),
    description: 'Stripe & crypto checkout transactions orchestration pipeline',
  },
];

const initialNodes: ServerNode[] = [
  {
    id: 'node-us-east-1',
    name: 'US-East (Virginia)',
    region: 'us-east-1',
    ip: '198.51.100.24',
    status: 'online',
    cpu: 34,
    ram: 48,
    disk: 52,
    networkIn: '148 MB/s',
    networkOut: '92 MB/s',
    ping: 18,
    uptime: '99.98%',
    os: 'Ubuntu 24.04 LTS (x86_64)',
    lastHeartbeat: new Date().toISOString(),
    tags: ['master', 'api-gateway', 'prod'],
    probeToken: 'prb_useast_7a9f21',
    probeInstalled: true,
    loadAvg: '0.42, 0.38, 0.29',
  },
  {
    id: 'node-eu-west-1',
    name: 'EU-West (Frankfurt)',
    region: 'eu-west-1',
    ip: '198.51.100.89',
    status: 'online',
    cpu: 42,
    ram: 64,
    disk: 61,
    networkIn: '110 MB/s',
    networkOut: '85 MB/s',
    ping: 32,
    uptime: '99.95%',
    os: 'Debian 12 Bookworm (x86_64)',
    lastHeartbeat: new Date().toISOString(),
    tags: ['database-replica', 'worker', 'prod'],
    probeToken: 'prb_euwest_8b1c43',
    probeInstalled: true,
    loadAvg: '0.65, 0.55, 0.48',
  },
  {
    id: 'node-ap-east-1',
    name: 'AP-East (Tokyo)',
    region: 'ap-east-1',
    ip: '203.0.113.12',
    status: 'online',
    cpu: 27,
    ram: 39,
    disk: 44,
    networkIn: '95 MB/s',
    networkOut: '64 MB/s',
    ping: 24,
    uptime: '99.99%',
    os: 'Ubuntu 24.04 LTS (x86_64)',
    lastHeartbeat: new Date().toISOString(),
    tags: ['cdn-edge', 'tg-webhook', 'prod'],
    probeToken: 'prb_apeast_3d4e92',
    probeInstalled: true,
    loadAvg: '0.22, 0.18, 0.15',
  },
  {
    id: 'node-ap-southeast-1',
    name: 'AP-Southeast (Singapore)',
    region: 'ap-southeast-1',
    ip: '203.0.113.88',
    status: 'online',
    cpu: 58,
    ram: 76,
    disk: 69,
    networkIn: '180 MB/s',
    networkOut: '135 MB/s',
    ping: 38,
    uptime: '99.92%',
    os: 'Ubuntu 24.04 LTS (x86_64)',
    lastHeartbeat: new Date().toISOString(),
    tags: ['analytics', 'worker'],
    probeToken: 'prb_apsg_5f6a10',
    probeInstalled: true,
    loadAvg: '1.10, 0.98, 0.85',
  },
];

const initialIncidents: Incident[] = [
  {
    id: 'inc-2026-001',
    title: 'Scheduled Cloudflare SSL Certificate Renewal & Edge Node Optimization',
    status: 'resolved',
    severity: 'minor',
    affectedServices: ['Web Application & Edge CDN'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 34).toISOString(),
    resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 34).toISOString(),
    timeline: [
      {
        id: 'upd-1',
        status: 'investigating',
        message: 'Maintenance window started: rotating edge certificates and running traffic re-route tests.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
      },
      {
        id: 'upd-2',
        status: 'monitoring',
        message: 'Certificates successfully updated across all edge POPs. Latencies normal.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 35).toISOString(),
      },
      {
        id: 'upd-3',
        status: 'resolved',
        message: 'All verification checks passed. Normal operations confirmed.',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 34).toISOString(),
      },
    ],
  },
];

class MemoryStore {
  services: ServiceItem[] = [];
  nodes: ServerNode[] = [];
  incidents: Incident[] = [];
  metricsHistory: MetricHistoryPoint[] = [];
  adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  activeSessions = new Set<string>();

  telegramConfig: TelegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'CloudPulseBot',
    webhookUrl: '',
    autoAlerts: {
      serviceStatusChanged: true,
      incidentCreated: true,
      incidentResolved: true,
      nodeOffline: true,
      cpuThresholdAlert: true,
    },
  };

  telegramLogs: TelegramLogItem[] = [
    {
      id: 'log-init',
      type: 'push',
      sender: 'System Init',
      chatId: process.env.TELEGRAM_CHAT_ID || 'channel_default',
      content: '🚀 CloudPulse 监控系统与 Telegram Bot 推送通道准备就绪，自动化告警引擎已激活。',
      status: 'simulated',
      timestamp: new Date().toISOString(),
      dataAction: 'system_boot',
    },
  ];

  webhooks: WebhookChannelConfig[] = [
    {
      id: 'wh-wecom-default',
      name: '企业微信运维告警群',
      type: 'wecom',
      enabled: true,
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=example-key',
      events: {
        serviceOutage: true,
        serviceRecovered: true,
        nodeOffline: true,
        highLoad: true,
        sslExpiring: true,
        backupCompleted: false,
      },
      createdAt: new Date().toISOString(),
      lastStatus: 'success',
      lastTestedAt: new Date().toISOString(),
    },
    {
      id: 'wh-dingtalk-default',
      name: '钉钉运维值班机器人',
      type: 'dingtalk',
      enabled: false,
      webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=example-token',
      secret: 'SEC_example_secret',
      events: {
        serviceOutage: true,
        serviceRecovered: true,
        nodeOffline: true,
        highLoad: false,
        sslExpiring: true,
        backupCompleted: true,
      },
      createdAt: new Date().toISOString(),
    },
  ];

  maintenanceWindow: MaintenanceWindowConfig = {
    enabled: false,
    startHour: 2,
    endHour: 4,
    mutedChannels: [],
    reason: '例行每周数据库底层冷备份与内核升级',
    updatedAt: new Date().toISOString(),
  };

  publicStatusConfig: PublicStatusConfig = {
    isPublicEnabled: true,
    companyName: 'CloudPulse Enterprise Core',
    customTitle: '全局系统状态与事件中心',
    customSubtitle: '实时监测全球微服务拨测可用率、节点探针集群性能与应急故障事件。',
    hideInternalIps: true,
    showUptimeChart: true,
    supportContactUrl: 'https://status.cloudpulse.io/support',
    announcement: {
      enabled: false,
      type: 'info',
      title: '关于本周五夜间例行网络割接通知',
      message: '本周五 02:00 - 04:00 华东数据中心将升级核心交换机，部分拨测延迟可能出现短期波动。',
      updatedAt: new Date().toISOString(),
    },
  };

  auditLogs: AuditLogItem[] = [
    {
      id: 'audit-1',
      action: 'SYSTEM_BOOT',
      actor: 'system',
      timestamp: new Date().toISOString(),
      category: 'settings',
      details: 'CloudPulse Enterprise V2.5 核心引擎启动完成',
      ip: '127.0.0.1',
    },
  ];

  quotaSettings: CloudflareQuotaConfig = {
    heartbeatIntervalSeconds: 60,
    historyRetentionDays: 30,
    clientPollIntervalSeconds: 30,
    ecoMode: true,
    edgeCacheMaxAge: 30,
    maxStoredMetricPoints: 720,
    autoPruneExpiredHistory: true,
    workerDailyRequestLimit: 100000,
  };

  lastPersistedAt = new Date().toISOString();
  bootTimestamp = Date.now();
  integrityStatus: 'healthy' | 'warning' | 'repaired' = 'healthy';
  autoBackupEnabled = true;
  autoBackupIntervalHours = 12;
  backupsMeta: DatabaseBackupMeta[] = [];
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private autoBackupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureBackupDir();
    this.loadFromDisk();
    this.ensureProbeTokens();
    this.initAutoBackupScheduler();
  }

  private ensureBackupDir() {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      if (fs.existsSync(BACKUP_INDEX_FILE)) {
        const raw = fs.readFileSync(BACKUP_INDEX_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          this.backupsMeta = list;
        }
      }
    } catch (err) {
      console.warn('Backup directory initialization notice:', err);
    }
  }

  private saveBackupIndex() {
    try {
      fs.writeFileSync(BACKUP_INDEX_FILE, JSON.stringify(this.backupsMeta, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save backup index:', err);
    }
  }

  private initAutoBackupScheduler() {
    // If no backup exists on boot, take an initial bootstrap backup
    if (this.backupsMeta.length === 0) {
      setTimeout(() => {
        try {
          this.createBackup('auto', 'System Boot Initial Baseline Snapshot');
        } catch (e) {
          console.error('Initial baseline backup error:', e);
        }
      }, 5000);
    }

    // Interval scheduler for auto backups
    const intervalMs = Math.max(1, this.autoBackupIntervalHours) * 3600 * 1000;
    this.autoBackupTimer = setInterval(() => {
      if (this.autoBackupEnabled) {
        try {
          this.createBackup('auto', 'Periodic Automated CloudPulse Snapshot');
        } catch (err) {
          console.error('Auto backup execution error:', err);
        }
      }
    }, intervalMs);
  }

  private ensureProbeTokens() {
    let changed = false;
    for (const node of this.nodes) {
      if (!node.probeToken) {
        node.probeToken = generateProbeToken('prb_' + node.region.replace(/[^a-z0-9]/g, ''));
        changed = true;
      }
    }
    if (changed) {
      this.saveToDisk(true);
    }
  }

  loadFromDisk() {
    let loadedSuccessfully = false;

    // 1. Primary load from DATA_FILE
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const data = JSON.parse(raw);
        this.applyParsedData(data);
        this.integrityStatus = 'healthy';
        loadedSuccessfully = true;

        // Keep a copy in FAILSAFE_BACKUP_FILE on clean load
        try {
          fs.copyFileSync(DATA_FILE, FAILSAFE_BACKUP_FILE);
        } catch {}
        return;
      }
    } catch (err) {
      console.warn('Primary data store unreadable, attempting recovery from failsafe:', err);
    }

    // 2. Failsafe recovery from FAILSAFE_BACKUP_FILE
    if (!loadedSuccessfully) {
      try {
        if (fs.existsSync(FAILSAFE_BACKUP_FILE)) {
          const raw = fs.readFileSync(FAILSAFE_BACKUP_FILE, 'utf-8');
          const data = JSON.parse(raw);
          this.applyParsedData(data);
          this.integrityStatus = 'repaired';
          console.info('Successfully recovered database from failsafe snapshot.');
          this.saveToDisk(true);
          return;
        }
      } catch (err) {
        console.warn('Failsafe snapshot unreadable, attempting latest backup restore:', err);
      }
    }

    // 3. Fallback: Check newest backup in backupsMeta
    if (!loadedSuccessfully && this.backupsMeta.length > 0) {
      const sorted = [...this.backupsMeta].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      for (const meta of sorted) {
        const bkPath = path.join(BACKUP_DIR, meta.filename);
        if (fs.existsSync(bkPath)) {
          try {
            const raw = fs.readFileSync(bkPath, 'utf-8');
            const data = JSON.parse(raw);
            this.applyParsedData(data);
            this.integrityStatus = 'repaired';
            console.info(`Recovered database from backup: ${meta.filename}`);
            this.saveToDisk(true);
            return;
          } catch {}
        }
      }
    }

    // 4. Fallback to initial seeds
    this.services = [...initialServices];
    this.nodes = [...initialNodes];
    this.incidents = [...initialIncidents];
    this.metricsHistory = generate24HourMetricsHistory(this.nodes);
    this.integrityStatus = 'healthy';
    this.saveToDisk(true);
  }

  private applyParsedData(data: any) {
    this.services = data.services || initialServices;
    this.nodes = data.nodes || initialNodes;
    this.incidents = data.incidents || initialIncidents;
    if (data.adminPassword) {
      this.adminPassword = data.adminPassword;
    }
    this.telegramConfig = {
      ...this.telegramConfig,
      ...(data.telegramConfig || {}),
      botToken: process.env.TELEGRAM_BOT_TOKEN || data.telegramConfig?.botToken || '',
      chatId: process.env.TELEGRAM_CHAT_ID || data.telegramConfig?.chatId || '',
    };
    if (data.quotaSettings) {
      this.quotaSettings = { ...this.quotaSettings, ...data.quotaSettings };
    }
    if (Array.isArray(data.webhooks) && data.webhooks.length > 0) {
      this.webhooks = data.webhooks;
    }
    if (data.maintenanceWindow) {
      this.maintenanceWindow = { ...this.maintenanceWindow, ...data.maintenanceWindow };
    }
    if (data.publicStatusConfig) {
      this.publicStatusConfig = { ...this.publicStatusConfig, ...data.publicStatusConfig };
    }
    if (Array.isArray(data.auditLogs) && data.auditLogs.length > 0) {
      this.auditLogs = data.auditLogs;
    }
    if (data.metricsHistory && Array.isArray(data.metricsHistory) && data.metricsHistory.length > 0) {
      this.metricsHistory = data.metricsHistory.map((pt: MetricHistoryPoint, idx: number) => {
        if (typeof pt.avgLatency === 'number') return pt;
        const base = 24 + Math.round((pt.avgCpu / 100) * 16);
        const jitter = Math.round(Math.abs(Math.sin(idx * 2.1)) * 5);
        const avg = base + jitter;
        return {
          ...pt,
          avgLatency: avg,
          peakLatency: avg + 25 + (idx % 7 === 0 ? 35 : 12),
          p95Latency: Math.round(avg * 1.35),
          minLatency: Math.max(8, Math.round(avg * 0.65)),
          jitter: Math.round(Math.abs(Math.sin(idx * 1.7)) * 4 + 1),
          serviceLatencies: {
            cdn: Math.max(10, Math.round(avg * 0.65)),
            api: Math.max(18, Math.round(avg * 1.1)),
            db: Math.max(8, Math.round(avg * 0.45)),
            redis: Math.max(2, Math.round(avg * 0.15)),
            gateway: Math.max(25, Math.round(avg * 1.35)),
          },
        };
      });
    } else {
      this.metricsHistory = generate24HourMetricsHistory(this.nodes, this.services);
    }
    this.telegramLogs = data.telegramLogs || this.telegramLogs;
    if (Array.isArray(data.activeSessions)) {
      this.activeSessions = new Set(data.activeSessions);
    }
  }

  /**
   * Atomic & High-Performance Persistence
   * Writes to TMP_DATA_FILE and renames atomically to DATA_FILE to prevent corruptions during crash/reboot
   */
  saveToDisk(immediate = false) {
    const doWrite = () => {
      try {
        const data = {
          version: '1.3.0',
          persistedAt: new Date().toISOString(),
          services: this.services,
          nodes: this.nodes,
          incidents: this.incidents,
          metricsHistory: this.metricsHistory.slice(-Math.max(48, this.quotaSettings.maxStoredMetricPoints)),
          adminPassword: this.adminPassword,
          activeSessions: Array.from(this.activeSessions),
          telegramConfig: this.telegramConfig,
          telegramLogs: this.telegramLogs.slice(-100),
          quotaSettings: this.quotaSettings,
          webhooks: this.webhooks,
          maintenanceWindow: this.maintenanceWindow,
          publicStatusConfig: this.publicStatusConfig,
          auditLogs: this.auditLogs.slice(-200),
        };
        const content = JSON.stringify(data, null, 2);

        // Atomic write via temp file
        fs.writeFileSync(TMP_DATA_FILE, content, 'utf-8');
        fs.renameSync(TMP_DATA_FILE, DATA_FILE);

        this.lastPersistedAt = new Date().toISOString();

        // Periodically update failsafe file
        if (Math.random() > 0.6) {
          try {
            fs.writeFileSync(FAILSAFE_BACKUP_FILE, content, 'utf-8');
          } catch {}
        }
      } catch (err) {
        console.error('Failed to persist store atomically:', err);
      }
    };

    if (immediate) {
      if (this.saveDebounceTimer) {
        clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = null;
      }
      doWrite();
    } else {
      if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = setTimeout(() => {
        this.saveDebounceTimer = null;
        doWrite();
      }, 500);
    }
  }

  // --- Backup Engine API ---

  createBackup(type: 'manual' | 'auto' | 'pre-restore' = 'manual', description?: string): DatabaseBackupMeta {
    this.ensureBackupDir();
    const id = `bk-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const filename = `backup_${type}_${Date.now()}_${id}.json`;
    const fullPath = path.join(BACKUP_DIR, filename);

    const snapshot = {
      backupId: id,
      version: '1.3.0',
      createdAt: new Date().toISOString(),
      type,
      description: description || (type === 'auto' ? 'Automated Periodic Snapshot' : 'Manual Admin Backup'),
      services: this.services,
      nodes: this.nodes,
      incidents: this.incidents,
      metricsHistory: this.metricsHistory,
      adminPassword: this.adminPassword,
      activeSessions: Array.from(this.activeSessions),
      telegramConfig: this.telegramConfig,
      telegramLogs: this.telegramLogs,
      quotaSettings: this.quotaSettings,
      webhooks: this.webhooks,
      maintenanceWindow: this.maintenanceWindow,
      publicStatusConfig: this.publicStatusConfig,
      auditLogs: this.auditLogs,
    };

    const content = JSON.stringify(snapshot, null, 2);
    const checksum = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    fs.writeFileSync(fullPath, content, 'utf-8');

    const meta: DatabaseBackupMeta = {
      id,
      filename,
      createdAt: snapshot.createdAt,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      servicesCount: this.services.length,
      nodesCount: this.nodes.length,
      incidentsCount: this.incidents.length,
      checksum,
      type,
      description: snapshot.description,
    };

    this.backupsMeta.unshift(meta);

    // Auto-prune old auto-backups if total exceeds 25 to prevent disk inflation
    if (this.backupsMeta.length > 25) {
      const toRemove = this.backupsMeta.slice(25);
      this.backupsMeta = this.backupsMeta.slice(0, 25);
      for (const old of toRemove) {
        try {
          const oldPath = path.join(BACKUP_DIR, old.filename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch {}
      }
    }

    this.saveBackupIndex();

    this.logTelegramAction({
      type: 'alert',
      sender: 'Database Engine',
      chatId: this.telegramConfig.chatId || 'system',
      content: `📦 数据备份已生成 [${type.toUpperCase()}]: ${meta.filename} (大小: ${(meta.sizeBytes / 1024).toFixed(1)} KB, 校验码: ${checksum})`,
      status: 'sent',
      dataAction: `backup_create:${id}`,
    });

    return meta;
  }

  listBackups(): DatabaseBackupMeta[] {
    this.ensureBackupDir();
    return [...this.backupsMeta].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getBackupContent(id: string): any | null {
    const meta = this.backupsMeta.find((b) => b.id === id);
    if (!meta) return null;
    const fullPath = path.join(BACKUP_DIR, meta.filename);
    if (!fs.existsSync(fullPath)) return null;
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  restoreBackup(id: string): { success: boolean; error?: string; restoredMeta?: DatabaseBackupMeta } {
    const meta = this.backupsMeta.find((b) => b.id === id);
    if (!meta) {
      return { success: false, error: '未找到对应备份文件' };
    }
    const fullPath = path.join(BACKUP_DIR, meta.filename);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: '备份物理文件丢失' };
    }

    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const data = JSON.parse(raw);

      if (!data.services || !Array.isArray(data.services) || !data.nodes || !Array.isArray(data.nodes)) {
        return { success: false, error: '备份文件结构不完整或损坏' };
      }

      // Step 1: Create a safety pre-restore backup first
      this.createBackup('pre-restore', `Automatic Pre-Restore Safety Point (Before applying ${meta.filename})`);

      // Step 2: Apply snapshot to MemoryStore
      this.applyParsedData(data);

      // Step 3: Save to disk atomically
      this.saveToDisk(true);

      this.logTelegramAction({
        type: 'alert',
        sender: 'Database Engine',
        chatId: this.telegramConfig.chatId || 'system',
        content: `⚠️ 系统已从历史备份中恢复数据 [${meta.filename}], 服务数: ${this.services.length}, 探针数: ${this.nodes.length}`,
        status: 'sent',
        dataAction: `backup_restore:${id}`,
      });

      return { success: true, restoredMeta: meta };
    } catch (err: any) {
      return { success: false, error: `恢复失败: ${err.message}` };
    }
  }

  importBackup(rawContent: string | any, description = 'Imported External Backup'): { success: boolean; error?: string; backupMeta?: DatabaseBackupMeta } {
    this.ensureBackupDir();
    try {
      const data = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
      if (!data || typeof data !== 'object') {
        return { success: false, error: '导入的备份数据格式无效' };
      }
      if (!Array.isArray(data.services) && !Array.isArray(data.nodes)) {
        return { success: false, error: '备份必须包含 services 或 nodes 数组数据' };
      }

      const id = `bk-imp-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      const filename = `backup_import_${Date.now()}_${id}.json`;
      const fullPath = path.join(BACKUP_DIR, filename);

      const snapshot = {
        backupId: id,
        version: data.version || '1.2.0',
        createdAt: new Date().toISOString(),
        type: 'manual',
        description,
        services: data.services || this.services,
        nodes: data.nodes || this.nodes,
        incidents: data.incidents || this.incidents,
        metricsHistory: data.metricsHistory || this.metricsHistory,
        adminPassword: data.adminPassword || this.adminPassword,
        activeSessions: Array.isArray(data.activeSessions) ? data.activeSessions : Array.from(this.activeSessions),
        telegramConfig: data.telegramConfig || this.telegramConfig,
        telegramLogs: data.telegramLogs || this.telegramLogs,
      };

      const content = JSON.stringify(snapshot, null, 2);
      const checksum = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
      fs.writeFileSync(fullPath, content, 'utf-8');

      const meta: DatabaseBackupMeta = {
        id,
        filename,
        createdAt: snapshot.createdAt,
        sizeBytes: Buffer.byteLength(content, 'utf-8'),
        servicesCount: (snapshot.services || []).length,
        nodesCount: (snapshot.nodes || []).length,
        incidentsCount: (snapshot.incidents || []).length,
        checksum,
        type: 'manual',
        description,
      };

      this.backupsMeta.unshift(meta);
      this.saveBackupIndex();

      return { success: true, backupMeta: meta };
    } catch (err: any) {
      return { success: false, error: `导入解析失败: ${err.message}` };
    }
  }

  deleteBackup(id: string): boolean {
    const idx = this.backupsMeta.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    const meta = this.backupsMeta[idx];
    const fullPath = path.join(BACKUP_DIR, meta.filename);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (e) {
      console.warn('Failed to delete backup file on disk:', e);
    }
    this.backupsMeta.splice(idx, 1);
    this.saveBackupIndex();
    return true;
  }

  /**
   * Database Optimization & Vacuum
   * De-duplicates metrics, cleans up stale sessions, prunes redundant logs, measures reclaimed space
   */
  optimizeDatabase(): DatabaseOptimizationResult {
    const startTime = Date.now();
    let beforeSize = 0;
    try {
      if (fs.existsSync(DATA_FILE)) {
        beforeSize = fs.statSync(DATA_FILE).size;
      }
    } catch {}

    const prevMetricsCount = this.metricsHistory.length;
    const prevLogsCount = this.telegramLogs.length;
    const prevSessionsCount = this.activeSessions.size;

    // 1. De-duplicate metrics history & limit to 48 points
    const seenTimestamps = new Set<string>();
    const cleanedMetrics: MetricHistoryPoint[] = [];
    for (let i = this.metricsHistory.length - 1; i >= 0; i--) {
      const p = this.metricsHistory[i];
      if (!seenTimestamps.has(p.timeLabel)) {
        seenTimestamps.add(p.timeLabel);
        cleanedMetrics.unshift(p);
      }
      if (cleanedMetrics.length >= 48) break;
    }
    this.metricsHistory = cleanedMetrics;

    // 2. Prune old Telegram logs to 80
    if (this.telegramLogs.length > 80) {
      this.telegramLogs = this.telegramLogs.slice(0, 80);
    }

    // 3. Prune sessions (keep only recent ones)
    if (this.activeSessions.size > 20) {
      const arr = Array.from(this.activeSessions);
      this.activeSessions = new Set(arr.slice(-10));
    }

    // 4. Force atomic write
    this.saveToDisk(true);

    let afterSize = beforeSize;
    try {
      if (fs.existsSync(DATA_FILE)) {
        afterSize = fs.statSync(DATA_FILE).size;
      }
    } catch {}

    const reclaimedBytes = Math.max(0, beforeSize - afterSize);
    const durationMs = Date.now() - startTime;

    this.logTelegramAction({
      type: 'alert',
      sender: 'Database Optimizer',
      chatId: this.telegramConfig.chatId || 'system',
      content: `⚡ 数据库优化与持久化压实完成: 回收空间 ${(reclaimedBytes / 1024).toFixed(1)} KB, 耗时 ${durationMs}ms`,
      status: 'sent',
      dataAction: 'database_vacuum',
    });

    return {
      success: true,
      prunedMetricsCount: Math.max(0, prevMetricsCount - this.metricsHistory.length),
      prunedLogsCount: Math.max(0, prevLogsCount - this.telegramLogs.length),
      prunedSessionsCount: Math.max(0, prevSessionsCount - this.activeSessions.size),
      beforeSizeBytes: beforeSize,
      afterSizeBytes: afterSize,
      reclaimedBytes,
      durationMs,
      message: `数据库优化完成，成功清理冗余指标与日志，当前存储大小 ${(afterSize / 1024).toFixed(1)} KB`,
    };
  }

  getDatabaseStats(): DatabaseEngineStats {
    let dbSize = 0;
    try {
      if (fs.existsSync(DATA_FILE)) {
        dbSize = fs.statSync(DATA_FILE).size;
      }
    } catch {}

    const sortedBackups = [...this.backupsMeta].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      dbSizeBytes: dbSize,
      dbFile: path.basename(DATA_FILE),
      isAtomicWriteEnabled: true,
      lastPersistedAt: this.lastPersistedAt,
      totalBackups: this.backupsMeta.length,
      lastBackupAt: sortedBackups.length > 0 ? sortedBackups[0].createdAt : undefined,
      servicesCount: this.services.length,
      nodesCount: this.nodes.length,
      incidentsCount: this.incidents.length,
      metricsCount: this.metricsHistory.length,
      logsCount: this.telegramLogs.length,
      sessionsCount: this.activeSessions.size,
      integrityStatus: this.integrityStatus,
      autoBackupEnabled: this.autoBackupEnabled,
      autoBackupIntervalHours: this.autoBackupIntervalHours,
      uptimeSeconds: Math.floor((Date.now() - this.bootTimestamp) / 1000),
    };
  }

  // Admin Auth methods
  verifyAdminPassword(password: string): boolean {
    return password === this.adminPassword;
  }

  createAdminSession(): string {
    const token = `adm_${crypto.randomBytes(16).toString('hex')}_${Date.now()}`;
    this.activeSessions.add(token);
    this.saveToDisk();
    return token;
  }

  verifyAdminSession(token?: string): boolean {
    if (!token) return false;
    return this.activeSessions.has(token);
  }

  destroyAdminSession(token?: string): void {
    if (token && this.activeSessions.has(token)) {
      this.activeSessions.delete(token);
      this.saveToDisk();
    }
  }

  changeAdminPassword(oldPass: string, newPass: string): { success: boolean; error?: string } {
    if (oldPass !== this.adminPassword) {
      return { success: false, error: '原管理密码不正确' };
    }
    if (!newPass || newPass.length < 6) {
      return { success: false, error: '新密码长度至少需要 6 个字符' };
    }
    this.adminPassword = newPass;
    // Invalidate old sessions when password is changed
    this.activeSessions.clear();
    this.saveToDisk();
    return { success: true };
  }

  getOverview(): SystemOverview {
    const totalServices = this.services.length;
    const operationalServices = this.services.filter((s) => s.status === 'operational').length;
    const degradedServices = this.services.filter(
      (s) => s.status === 'degraded' || s.status === 'partial_outage'
    ).length;
    const outageServices = this.services.filter((s) => s.status === 'major_outage').length;
    const activeIncidents = this.incidents.filter((i) => i.status !== 'resolved');

    let overallStatus: SystemOverview['overallStatus'] = 'all_good';
    if (outageServices > 0 || activeIncidents.some((i) => i.severity === 'critical')) {
      overallStatus = 'major_outage';
    } else if (
      degradedServices > 0 ||
      activeIncidents.length > 0 ||
      this.nodes.some((n) => n.status !== 'online')
    ) {
      overallStatus = 'degraded';
    }

    const totalNodes = this.nodes.length;
    const onlineNodes = this.nodes.filter((n) => n.status === 'online').length;

    return {
      overallStatus,
      uptime30d: 99.98,
      totalServices,
      operationalServices,
      totalNodes,
      onlineNodes,
      activeIncidentsCount: activeIncidents.length,
      telegramConfigured: Boolean(this.telegramConfig.botToken && this.telegramConfig.chatId),
      lastUpdated: new Date().toISOString(),
    };
  }

  // Probe ingestion
  reportProbe(payload: ProbeReportPayload): { success: boolean; node?: ServerNode; error?: string } {
    if (!payload.token) {
      return { success: false, error: 'Probe token is required' };
    }

    const node = this.nodes.find((n) => n.probeToken === payload.token || n.id === payload.token);
    if (!node) {
      return { success: false, error: 'No node found matching probe token' };
    }

    node.cpu = Math.min(100, Math.max(0, Math.round(payload.cpu)));
    node.ram = Math.min(100, Math.max(0, Math.round(payload.ram)));
    node.disk = Math.min(100, Math.max(0, Math.round(payload.disk)));
    if (payload.networkIn) node.networkIn = payload.networkIn;
    if (payload.networkOut) node.networkOut = payload.networkOut;
    if (payload.ping !== undefined) node.ping = payload.ping;
    if (payload.os) node.os = payload.os;
    if (payload.uptime) node.uptime = payload.uptime;
    if (payload.loadAvg) node.loadAvg = payload.loadAvg;

    node.probeInstalled = true;
    node.lastHeartbeat = new Date().toISOString();

    // Auto calculate status based on thresholds
    if (node.cpu > 85 || node.ram > 90) {
      node.status = 'degraded';
    } else {
      node.status = 'online';
    }

    this.updateLatestMetricsPoint();
    this.saveToDisk();
    return { success: true, node };
  }

  updateLatestMetricsPoint() {
    if (!this.metricsHistory || this.metricsHistory.length === 0) {
      this.metricsHistory = generate24HourMetricsHistory(this.nodes, this.services);
      return;
    }
    const now = new Date();
    const currentHourLabel = now.getHours().toString().padStart(2, '0') + ':00';
    const onlineNodes = this.nodes.filter((n) => n.status !== 'offline');
    const validNodes = onlineNodes.length > 0 ? onlineNodes : this.nodes;
    if (validNodes.length === 0) return;

    const avgCpu = Math.round(validNodes.reduce((acc, n) => acc + n.cpu, 0) / validNodes.length);
    const avgRam = Math.round(validNodes.reduce((acc, n) => acc + n.ram, 0) / validNodes.length);
    const peakCpu = Math.max(...validNodes.map((n) => n.cpu));
    const peakRam = Math.max(...validNodes.map((n) => n.ram));

    // Live Service Latency Calculation
    const activeServices = this.services.filter((s) => s.latency && s.latency > 0);
    const avgLatency = activeServices.length > 0
      ? Math.round(activeServices.reduce((acc, s) => acc + s.latency, 0) / activeServices.length)
      : Math.round(26 + (avgCpu / 100) * 15);
    const peakLatency = activeServices.length > 0
      ? Math.max(...activeServices.map((s) => s.latency))
      : Math.round(avgLatency * 1.6);
    const minLatency = activeServices.length > 0
      ? Math.min(...activeServices.map((s) => s.latency))
      : Math.max(8, Math.round(avgLatency * 0.6));
    const p95Latency = Math.round(avgLatency + (peakLatency - avgLatency) * 0.7);
    const jitter = Math.round(Math.abs(peakLatency - minLatency) * 0.12) || 2;

    const serviceLatencies = {
      cdn: this.services.find(s => s.id === 'srv-frontend-cdn')?.latency || Math.round(avgLatency * 0.65),
      api: this.services.find(s => s.id === 'srv-rest-api')?.latency || Math.round(avgLatency * 1.1),
      db: this.services.find(s => s.id === 'srv-postgres-cluster')?.latency || Math.round(avgLatency * 0.45),
      redis: this.services.find(s => s.id === 'srv-redis-cache')?.latency || Math.round(avgLatency * 0.15),
      gateway: this.services.find(s => s.id === 'srv-payment-gateway')?.latency || Math.round(avgLatency * 1.35),
    };

    const lastPoint = this.metricsHistory[this.metricsHistory.length - 1];
    if (lastPoint && lastPoint.timeLabel === currentHourLabel) {
      lastPoint.avgCpu = avgCpu;
      lastPoint.avgRam = avgRam;
      lastPoint.peakCpu = Math.max(lastPoint.peakCpu, peakCpu);
      lastPoint.peakRam = Math.max(lastPoint.peakRam, peakRam);
      lastPoint.activeNodes = onlineNodes.length;
      lastPoint.avgLatency = avgLatency;
      lastPoint.peakLatency = Math.max(lastPoint.peakLatency || peakLatency, peakLatency);
      lastPoint.p95Latency = p95Latency;
      lastPoint.minLatency = Math.min(lastPoint.minLatency || minLatency, minLatency);
      lastPoint.jitter = jitter;
      lastPoint.serviceLatencies = serviceLatencies;
      lastPoint.timestamp = now.toISOString();
    } else {
      this.metricsHistory.push({
        timestamp: now.toISOString(),
        timeLabel: currentHourLabel,
        avgCpu,
        avgRam,
        peakCpu,
        peakRam,
        activeNodes: onlineNodes.length,
        avgLatency,
        peakLatency,
        p95Latency,
        minLatency,
        jitter,
        serviceLatencies,
      });
      const maxPoints = Math.max(24, this.quotaSettings.maxStoredMetricPoints || 720);
      if (this.metricsHistory.length > maxPoints) {
        this.metricsHistory = this.metricsHistory.slice(-maxPoints);
      }
    }
  }

  getMetricsHistory(): MetricHistoryPoint[] {
    if (!this.metricsHistory || this.metricsHistory.length === 0) {
      this.metricsHistory = generate24HourMetricsHistory(this.nodes, this.services);
    }
    // Ensure all points have latency properties
    this.metricsHistory = this.metricsHistory.map((pt, idx) => {
      if (typeof pt.avgLatency === 'number') return pt;
      const base = 24 + Math.round((pt.avgCpu / 100) * 16);
      const jitter = Math.round(Math.abs(Math.sin(idx * 2.1)) * 5);
      const avg = base + jitter;
      return {
        ...pt,
        avgLatency: avg,
        peakLatency: avg + 26 + (idx % 7 === 0 ? 35 : 12),
        p95Latency: Math.round(avg * 1.35),
        minLatency: Math.max(8, Math.round(avg * 0.65)),
        jitter: Math.round(Math.abs(Math.sin(idx * 1.7)) * 4 + 1),
        serviceLatencies: {
          cdn: Math.max(10, Math.round(avg * 0.65)),
          api: Math.max(18, Math.round(avg * 1.1)),
          db: Math.max(8, Math.round(avg * 0.45)),
          redis: Math.max(2, Math.round(avg * 0.15)),
          gateway: Math.max(25, Math.round(avg * 1.35)),
        },
      };
    });
    this.updateLatestMetricsPoint();
    return this.metricsHistory;
  }

  addService(service: Partial<ServiceItem>): ServiceItem {
    const id = service.id || `srv-${Date.now().toString(36)}`;
    const newService: ServiceItem = {
      id,
      name: service.name || 'Untitled Service',
      category: service.category || 'General',
      url: service.url || '',
      status: service.status || 'operational',
      latency: service.latency || Math.floor(20 + Math.random() * 40),
      uptime30d: 99.99,
      uptimeHistory: generate30DayHistory(service.status === 'degraded' ? 'degraded' : 'operational'),
      lastCheck: new Date().toISOString(),
      description: service.description || '',
    };
    this.services.unshift(newService);
    this.saveToDisk();
    return newService;
  }

  updateService(id: string, updates: Partial<ServiceItem>): ServiceItem | null {
    const idx = this.services.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    this.services[idx] = {
      ...this.services[idx],
      ...updates,
      lastCheck: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.services[idx];
  }

  deleteService(id: string): boolean {
    const initialLen = this.services.length;
    this.services = this.services.filter((s) => s.id !== id);
    if (this.services.length !== initialLen) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  addNode(node: Partial<ServerNode>): ServerNode {
    const id = node.id || `node-${(node.name || 'node').toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36).slice(-4)}`;
    const region = node.region || 'global';
    const newNode: ServerNode = {
      id,
      name: node.name || 'New Server Node',
      region,
      ip: node.ip || '127.0.0.1',
      status: node.status || 'online',
      cpu: node.cpu ?? Math.floor(15 + Math.random() * 30),
      ram: node.ram ?? Math.floor(30 + Math.random() * 30),
      disk: node.disk ?? Math.floor(40 + Math.random() * 30),
      networkIn: node.networkIn || `${Math.floor(20 + Math.random() * 80)} MB/s`,
      networkOut: node.networkOut || `${Math.floor(10 + Math.random() * 50)} MB/s`,
      ping: node.ping ?? Math.floor(15 + Math.random() * 30),
      uptime: '99.99%',
      os: node.os || 'Linux 6.6.x (Ubuntu/Debian)',
      lastHeartbeat: new Date().toISOString(),
      tags: node.tags || ['probe', region],
      probeToken: node.probeToken || generateProbeToken(`prb_${region.replace(/[^a-z0-9]/g, '')}`),
      probeInstalled: node.probeInstalled ?? false,
      loadAvg: node.loadAvg || '0.24, 0.18, 0.12',
    };
    this.nodes.unshift(newNode);
    this.saveToDisk();
    return newNode;
  }

  updateNode(id: string, updates: Partial<ServerNode>): ServerNode | null {
    const idx = this.nodes.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    this.nodes[idx] = {
      ...this.nodes[idx],
      ...updates,
      lastHeartbeat: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.nodes[idx];
  }

  deleteNode(id: string): boolean {
    const initialLen = this.nodes.length;
    this.nodes = this.nodes.filter((n) => n.id !== id);
    if (this.nodes.length !== initialLen) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  addIncident(incident: Partial<Incident>): Incident {
    const id = incident.id || `inc-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const newIncident: Incident = {
      id,
      title: incident.title || 'System Incident Report',
      status: incident.status || 'investigating',
      severity: incident.severity || 'minor',
      affectedServices: incident.affectedServices || [],
      createdAt: now,
      updatedAt: now,
      timeline: incident.timeline && incident.timeline.length > 0 ? incident.timeline : [
        {
          id: `upd-${Date.now().toString(36)}`,
          status: incident.status || 'investigating',
          message: incident.title ? `Incident reported: ${incident.title}` : 'Engineering team is investigating.',
          timestamp: now,
        },
      ],
    };
    this.incidents.unshift(newIncident);
    this.saveToDisk();
    return newIncident;
  }

  addIncidentUpdate(incidentId: string, status: Incident['status'], message: string): Incident | null {
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!inc) return null;
    const now = new Date().toISOString();
    inc.status = status;
    inc.updatedAt = now;
    if (status === 'resolved') {
      inc.resolvedAt = now;
    }
    inc.timeline.unshift({
      id: `upd-${Date.now().toString(36)}`,
      status,
      message,
      timestamp: now,
    });
    this.saveToDisk();
    return inc;
  }

  resolveIncident(incidentId: string, message = 'Issue has been resolved and verified.'): Incident | null {
    return this.addIncidentUpdate(incidentId, 'resolved', message);
  }

  logTelegramAction(item: Omit<TelegramLogItem, 'id' | 'timestamp'>): TelegramLogItem {
    const log: TelegramLogItem = {
      ...item,
      id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.telegramLogs.unshift(log);
    if (this.telegramLogs.length > 150) {
      this.telegramLogs = this.telegramLogs.slice(0, 150);
    }
    this.saveToDisk();
    return log;
  }

  logAudit(action: string, actor = 'admin', category: AuditLogItem['category'] = 'settings', details = '', ip = '127.0.0.1') {
    const item: AuditLogItem = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      actor,
      timestamp: new Date().toISOString(),
      category,
      details,
      ip,
    };
    this.auditLogs.unshift(item);
    if (this.auditLogs.length > 200) {
      this.auditLogs = this.auditLogs.slice(0, 200);
    }
    this.saveToDisk();
    return item;
  }

  getSlaReports(period: '7d' | '30d' | '90d' = '30d'): SlaReportResponse {
    const servicesSummary: ServiceSlaSummary[] = this.services.map((s) => {
      const uptime30d = s.uptime30d || 99.95;
      const uptime7d = Math.min(100, Math.max(98, uptime30d + (Math.random() * 0.1 - 0.05)));
      const uptime90d = Math.max(99.0, uptime30d - 0.02);
      const targetSla = 99.9;
      const targetMet = uptime30d >= targetSla;
      const incidentCount = this.incidents.filter(inc => inc.affectedServices.includes(s.name) || inc.affectedServices.includes(s.id)).length;
      return {
        serviceId: s.id,
        serviceName: s.name,
        category: s.category,
        url: s.url,
        status: s.status,
        uptime30d: Number(uptime30d.toFixed(2)),
        uptime7d: Number(uptime7d.toFixed(2)),
        uptime90d: Number(uptime90d.toFixed(2)),
        outageMinutes30d: Math.round((100 - uptime30d) * 4.32),
        outageMinutes7d: Math.round((100 - uptime7d) * 1.0),
        avgLatencyMs: s.latency || 35,
        targetSla,
        targetMet,
        incidentCount,
        sslStatus: s.ssl?.status || 'valid',
      };
    });

    const overallAvailability = servicesSummary.length > 0 
      ? Number((servicesSummary.reduce((acc, curr) => acc + curr.uptime30d, 0) / servicesSummary.length).toFixed(3))
      : 99.99;

    const compliantServices = servicesSummary.filter(s => s.targetMet).length;
    const nonCompliantServices = servicesSummary.length - compliantServices;

    let tier: SlaReportResponse['systemReliabilityTier'] = 'Tier IV (99.99%)';
    if (overallAvailability < 99.0) tier = 'Needs Attention';
    else if (overallAvailability < 99.9) tier = 'Tier II (99.0%)';
    else if (overallAvailability < 99.99) tier = 'Tier III (99.9%)';

    return {
      generatedAt: new Date().toISOString(),
      reportingPeriod: period,
      overallAvailability,
      totalServices: servicesSummary.length,
      compliantServices,
      nonCompliantServices,
      systemReliabilityTier: tier,
      services: servicesSummary,
    };
  }

  updateQuotaSettings(updates: Partial<CloudflareQuotaConfig>): CloudflareQuotaConfig {
    this.quotaSettings = {
      ...this.quotaSettings,
      ...updates,
    };
    if (this.quotaSettings.autoPruneExpiredHistory) {
      this.pruneExpiredHistory();
    }
    this.saveToDisk();
    return this.quotaSettings;
  }

  getQuotaEstimate(): CloudflareQuotaEstimate {
    const totalNodes = this.nodes.length;
    const heartbeatSec = Math.max(10, this.quotaSettings.heartbeatIntervalSeconds || 60);
    const clientPollSec = Math.max(10, this.quotaSettings.clientPollIntervalSeconds || 30);
    
    // Daily node heartbeat reports
    const dailyNodeHeartbeatRequests = Math.round(totalNodes * (86400 / heartbeatSec));
    
    // Model 20 concurrent visitors browsing / status page
    const estimatedDailyPageViews = 250;
    const baseDailyApiReads = Math.round(20 * (86400 / clientPollSec));
    // Edge Cache absorbs ~85% if ecoMode is active
    const edgeCacheHitRate = this.quotaSettings.ecoMode ? 0.85 : 0.20;
    const estimatedDailyApiReads = Math.round(baseDailyApiReads * (1 - edgeCacheHitRate));
    
    const estimatedTotalDailyRequests = dailyNodeHeartbeatRequests + estimatedDailyApiReads + 60; // buffer
    const freeTierLimit = this.quotaSettings.workerDailyRequestLimit || 100000;
    const usagePercentage = Number(((estimatedTotalDailyRequests / freeTierLimit) * 100).toFixed(1));

    let status: CloudflareQuotaEstimate['status'] = 'safe';
    if (usagePercentage >= 100) status = 'exceeded';
    else if (usagePercentage >= 75) status = 'warning';

    const recommendations: string[] = [];
    if (heartbeatSec < 30) {
      recommendations.push('探针心跳上报频率低于 30 秒，节点较多时会快速消耗 Cloudflare Workers 免费额度，建议调整至 60 秒。');
    }
    if (this.quotaSettings.historyRetentionDays > 60) {
      recommendations.push('历史数据保留超过 60 天，建议开启定期清理或使用 Cloudflare D1 存储，避免内存与 KV 超限。');
    }
    if (!this.quotaSettings.ecoMode) {
      recommendations.push('建议开启【免费额度节能模式】，由边缘 CDN 节点缓存服务健康状态，可减少 85% 以上 Worker 转发请求。');
    }
    if (status === 'safe') {
      recommendations.push(`当前配置预计每日消耗约 ${estimatedTotalDailyRequests.toLocaleString()} 次请求，占免费额度 ${usagePercentage}%，处于极佳绿色安全区间。`);
    }

    return {
      config: this.quotaSettings,
      totalNodes,
      dailyNodeHeartbeatRequests,
      estimatedDailyPageViews,
      estimatedDailyApiReads,
      estimatedTotalDailyRequests,
      freeTierLimit,
      usagePercentage,
      status,
      recommendations,
    };
  }

  pruneExpiredHistory(customRetentionDays?: number) {
    const days = customRetentionDays || this.quotaSettings.historyRetentionDays || 30;
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const beforeMetricsCount = this.metricsHistory.length;
    this.metricsHistory = this.metricsHistory.filter((pt) => {
      const t = new Date(pt.timestamp).getTime();
      return isNaN(t) || t >= cutoffTime;
    });
    const prunedMetrics = beforeMetricsCount - this.metricsHistory.length;

    // Prune old telegram logs & audit logs beyond retention
    const beforeLogs = this.telegramLogs.length;
    this.telegramLogs = this.telegramLogs.filter((l) => {
      const t = new Date(l.timestamp).getTime();
      return isNaN(t) || t >= cutoffTime;
    });
    const prunedLogs = beforeLogs - this.telegramLogs.length;

    const beforeAudits = this.auditLogs.length;
    this.auditLogs = this.auditLogs.filter((a) => {
      const t = new Date(a.timestamp).getTime();
      return isNaN(t) || t >= cutoffTime;
    });
    const prunedAudits = beforeAudits - this.auditLogs.length;

    this.saveToDisk(true);

    return {
      prunedMetrics,
      prunedLogs,
      prunedAudits,
      remainingPoints: this.metricsHistory.length,
      retentionDaysApplied: days,
    };
  }

  resetDemoData() {
    this.services = [...initialServices];
    this.nodes = [...initialNodes];
    this.incidents = [...initialIncidents];
    this.saveToDisk();
  }
}

export const store = new MemoryStore();
