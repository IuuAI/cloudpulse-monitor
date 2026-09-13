import {
  ServiceItem,
  ServiceStatus,
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
  SlaReportResponse,
  AuditLogItem,
  CloudflareQuotaConfig,
  CloudflareQuotaEstimate,
} from './types';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('cloudpulse_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response, fallbackError: string): Promise<T> {
  if (!res.ok) {
    let message = fallbackError;
    try {
      const errJson = await res.json();
      if (errJson && (errJson.error || errJson.message)) {
        message = errJson.error || errJson.message;
      }
    } catch {
      // not json
    }
    throw new Error(message);
  }
  return res.json();
}

// Overview
export async function fetchOverview(): Promise<SystemOverview> {
  const res = await fetch(`${API_BASE}/overview`);
  return handleResponse<SystemOverview>(res, 'Failed to fetch overview');
}

// Metrics History
export async function fetchMetricsHistory(): Promise<MetricHistoryPoint[]> {
  const res = await fetch(`${API_BASE}/metrics/history`);
  return handleResponse<MetricHistoryPoint[]>(res, 'Failed to fetch metrics history');
}

// Services
export async function fetchServices(): Promise<ServiceItem[]> {
  const res = await fetch(`${API_BASE}/services`);
  return handleResponse<ServiceItem[]>(res, 'Failed to fetch services');
}

export async function createService(data: Partial<ServiceItem>): Promise<ServiceItem> {
  const res = await fetch(`${API_BASE}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse<ServiceItem>(res, 'Failed to create service');
}

export async function updateService(id: string, data: Partial<ServiceItem>): Promise<ServiceItem> {
  const res = await fetch(`${API_BASE}/services/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse<ServiceItem>(res, 'Failed to update service');
}

export async function deleteService(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/services/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    let msg = 'Failed to delete service';
    try {
      const errJson = await res.json();
      if (errJson?.error) msg = errJson.error;
    } catch {}
    throw new Error(msg);
  }
}

export async function checkServiceLive(id: string): Promise<{ success: boolean; service: ServiceItem; latency: number; status: ServiceStatus; statusCode?: number }> {
  const res = await fetch(`${API_BASE}/services/${id}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  return handleResponse(res, 'Failed to check service live status');
}

export async function checkAllServicesLive(): Promise<{ success: boolean; totalChecked: number; services: ServiceItem[] }> {
  const res = await fetch(`${API_BASE}/services/check-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  return handleResponse(res, 'Failed to check all services');
}

// Nodes
export async function fetchNodes(): Promise<ServerNode[]> {
  const res = await fetch(`${API_BASE}/nodes`);
  return handleResponse<ServerNode[]>(res, 'Failed to fetch nodes');
}

export async function createNode(data: Partial<ServerNode>): Promise<ServerNode> {
  const res = await fetch(`${API_BASE}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse<ServerNode>(res, 'Failed to create node');
}

export async function updateNode(id: string, data: Partial<ServerNode>): Promise<ServerNode> {
  const res = await fetch(`${API_BASE}/nodes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse<ServerNode>(res, 'Failed to update node');
}

export async function deleteNode(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/nodes/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    let msg = 'Failed to delete node';
    try {
      const errJson = await res.json();
      if (errJson?.error) msg = errJson.error;
    } catch {}
    throw new Error(msg);
  }
}

// Probe simulation / report
export async function simulateNodeProbe(nodeId: string): Promise<ServerNode> {
  const res = await fetch(`${API_BASE}/nodes/${nodeId}/simulate-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error('Failed to simulate probe report');
  const data = await res.json();
  return data.node;
}

export async function reportProbeMetric(payload: ProbeReportPayload): Promise<{ ok: boolean; node?: ServerNode }> {
  const res = await fetch(`${API_BASE}/probe/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to report probe metric');
  return res.json();
}

// Incidents
export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch(`${API_BASE}/incidents`);
  return handleResponse<Incident[]>(res, 'Failed to fetch incidents');
}

export async function createIncident(data: Partial<Incident>): Promise<Incident> {
  const res = await fetch(`${API_BASE}/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse<Incident>(res, 'Failed to create incident');
}

export async function addIncidentUpdate(
  id: string,
  status: Incident['status'],
  message: string
): Promise<Incident> {
  const res = await fetch(`${API_BASE}/incidents/${id}/updates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ status, message }),
  });
  return handleResponse<Incident>(res, 'Failed to add incident update');
}

export async function resolveIncident(id: string, message?: string): Promise<Incident> {
  const res = await fetch(`${API_BASE}/incidents/${id}/resolve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ message }),
  });
  return handleResponse<Incident>(res, 'Failed to resolve incident');
}

export async function deleteIncident(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/incidents/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    let msg = 'Failed to delete incident';
    try {
      const errJson = await res.json();
      if (errJson?.error) msg = errJson.error;
    } catch {}
    throw new Error(msg);
  }
}

// Telegram Config
export async function fetchTelegramConfig(): Promise<TelegramConfig & { hasBotToken: boolean; botTokenPreview: string }> {
  const res = await fetch(`${API_BASE}/tg/config`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('Failed to fetch Telegram config');
  return res.json();
}

export async function saveTelegramConfig(config: Partial<TelegramConfig>): Promise<void> {
  const res = await fetch(`${API_BASE}/tg/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save Telegram config');
}

// Telegram Push
export async function sendTelegramPush(payload: {
  text: string;
  chatId?: string;
  parseMode?: string;
  silent?: boolean;
}): Promise<{ success: boolean; simulated: boolean; status: string; error?: string }> {
  const res = await fetch(`${API_BASE}/tg/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchTelegramLogs(): Promise<TelegramLogItem[]> {
  const res = await fetch(`${API_BASE}/tg/logs`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('Failed to fetch Telegram logs');
  return res.json();
}

export async function pollTelegramUpdates(): Promise<{ success: boolean; processedCount?: number; error?: string }> {
  const res = await fetch(`${API_BASE}/tg/poll`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  return res.json();
}

// Admin Auth
export async function adminLogin(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('cloudpulse_admin_token', data.token);
  }
  return data;
}

export async function verifyAdminAuth(): Promise<boolean> {
  const token = localStorage.getItem('cloudpulse_admin_token');
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/admin/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

export async function adminLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/admin/logout`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
  } catch (err) {
    console.warn('Server logout call failed:', err);
  } finally {
    localStorage.removeItem('cloudpulse_admin_token');
  }
}

export async function changeAdminPassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/admin/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  return res.json();
}

export async function resetDemoData(): Promise<void> {
  await fetch(`${API_BASE}/reset-data`, { method: 'POST', headers: getAuthHeader() });
}

// Database Engine & Backup APIs
export async function fetchDatabaseStats(): Promise<DatabaseEngineStats> {
  const res = await fetch(`${API_BASE}/database/stats`);
  if (!res.ok) throw new Error('Failed to fetch database stats');
  return res.json();
}

export async function optimizeDatabase(): Promise<DatabaseOptimizationResult> {
  const res = await fetch(`${API_BASE}/database/optimize`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to optimize database');
  return res.json();
}

export async function fetchDatabaseBackups(): Promise<DatabaseBackupMeta[]> {
  const res = await fetch(`${API_BASE}/database/backups`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to fetch backups');
  return res.json();
}

export async function createDatabaseBackup(type: 'manual' | 'auto' = 'manual', description?: string): Promise<DatabaseBackupMeta> {
  const res = await fetch(`${API_BASE}/database/backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ type, description }),
  });
  if (!res.ok) throw new Error('Failed to create database backup');
  return res.json();
}

export async function restoreDatabaseBackup(id: string): Promise<{ success: boolean; error?: string; restoredMeta?: DatabaseBackupMeta }> {
  const res = await fetch(`${API_BASE}/database/backups/${id}/restore`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  return res.json();
}

export async function deleteDatabaseBackup(id: string): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`${API_BASE}/database/backups/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  return res.json();
}

export async function importDatabaseBackup(content: string | object, description?: string): Promise<{ success: boolean; error?: string; backupMeta?: DatabaseBackupMeta }> {
  const payloadContent = typeof content === 'string' ? content : JSON.stringify(content);
  const res = await fetch(`${API_BASE}/database/backups/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ content: payloadContent, description }),
  });
  return res.json();
}

export async function downloadBackupFile(id: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}/database/backups/${id}/download`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to download backup');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// Webhooks & Maintenance
export async function fetchWebhooks(): Promise<WebhookChannelConfig[]> {
  const res = await fetch(`${API_BASE}/webhooks`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error('Failed to fetch webhooks');
  return res.json();
}

export async function createWebhook(data: Partial<WebhookChannelConfig>): Promise<WebhookChannelConfig> {
  const res = await fetch(`${API_BASE}/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create webhook');
  return res.json();
}

export async function updateWebhook(id: string, data: Partial<WebhookChannelConfig>): Promise<WebhookChannelConfig> {
  const res = await fetch(`${API_BASE}/webhooks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update webhook');
  return res.json();
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/webhooks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to delete webhook');
}

export async function testWebhook(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/webhooks/${id}/test`, {
    method: 'POST',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error('Failed to test webhook');
  return res.json();
}

export async function fetchMaintenanceWindow(): Promise<MaintenanceWindowConfig> {
  const res = await fetch(`${API_BASE}/maintenance-window`);
  return handleResponse<MaintenanceWindowConfig>(res, 'Failed to fetch maintenance window');
}

export async function updateMaintenanceWindow(data: Partial<MaintenanceWindowConfig>): Promise<MaintenanceWindowConfig> {
  const res = await fetch(`${API_BASE}/maintenance-window`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse<MaintenanceWindowConfig>(res, 'Failed to update maintenance window');
}

// Public Status & Reports
export async function fetchPublicStatus(): Promise<PublicStatusConfig> {
  const res = await fetch(`${API_BASE}/public/status`);
  return handleResponse<PublicStatusConfig>(res, 'Failed to fetch public status config');
}

export async function updatePublicStatus(data: Partial<PublicStatusConfig>): Promise<PublicStatusConfig> {
  const res = await fetch(`${API_BASE}/public/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse<PublicStatusConfig>(res, 'Failed to update public status');
}

export async function fetchSlaReports(period: '7d' | '30d' | '90d' = '30d'): Promise<SlaReportResponse> {
  const res = await fetch(`${API_BASE}/sla-reports?period=${period}`);
  return handleResponse<SlaReportResponse>(res, 'Failed to fetch SLA reports');
}

export async function fetchAuditLogs(): Promise<AuditLogItem[]> {
  const res = await fetch(`${API_BASE}/audit-logs`, { headers: getAuthHeader() });
  return handleResponse<AuditLogItem[]>(res, 'Failed to fetch audit logs');
}

// Cloudflare Quota & History Retention
export async function fetchQuotaSettings(): Promise<CloudflareQuotaEstimate> {
  const res = await fetch(`${API_BASE}/settings/quota`);
  return handleResponse<CloudflareQuotaEstimate>(res, 'Failed to fetch quota settings');
}

export async function updateQuotaSettings(data: Partial<CloudflareQuotaConfig>): Promise<CloudflareQuotaEstimate> {
  const res = await fetch(`${API_BASE}/settings/quota`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  });
  return handleResponse<CloudflareQuotaEstimate>(res, 'Failed to update quota settings');
}

export async function pruneExpiredHistory(retentionDays?: number): Promise<{
  success: boolean;
  prunedMetrics: number;
  prunedLogs: number;
  prunedAudits: number;
  remainingPoints: number;
  retentionDaysApplied: number;
}> {
  const res = await fetch(`${API_BASE}/settings/quota/prune`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ retentionDays }),
  });
  return handleResponse<{
    success: boolean;
    prunedMetrics: number;
    prunedLogs: number;
    prunedAudits: number;
    remainingPoints: number;
    retentionDaysApplied: number;
  }>(res, 'Failed to prune expired history');
}
