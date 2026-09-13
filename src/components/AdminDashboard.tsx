import React, { useState } from 'react';
import {
  ShieldCheck,
  Server,
  Activity,
  AlertTriangle,
  Lock,
  Plus,
  Trash2,
  Edit2,
  Terminal,
  Copy,
  Check,
  Zap,
  Globe,
  Radio,
  Clock,
  Layers,
  CheckCircle2,
  AlertCircle,
  Key,
  LogOut,
  RefreshCw,
  Cpu,
  HardDrive,
  DownloadCloud,
  FileCode,
  Database,
  Webhook,
  Award,
  FileText,
  Cloud,
  Bot,
  Send,
} from 'lucide-react';
import { DatabaseBackupManager } from './DatabaseBackupManager';
import { WebhookManager } from './WebhookManager';
import { SlaReportsView } from './SlaReportsView';
import { AuditLogsView } from './AuditLogsView';
import { PublicStatusManager } from './PublicStatusManager';
import { CloudflareQuotaManager } from './CloudflareQuotaManager';
import { TelegramBotHub } from './TelegramBotHub';
import { ApiKeyManager } from './ApiKeyManager';
import {
  ServiceItem,
  ServerNode,
  Incident,
  AdminAuthState,
  TelegramConfig,
  TelegramLogItem,
} from '../types';
import {
  adminLogin,
  adminLogout,
  changeAdminPassword,
  createService,
  updateService,
  deleteService,
  createNode,
  updateNode,
  deleteNode,
  simulateNodeProbe,
  createIncident,
  addIncidentUpdate,
  resolveIncident,
  deleteIncident,
  resetDemoData,
} from '../api';

interface AdminDashboardProps {
  authState: AdminAuthState;
  services: ServiceItem[];
  nodes: ServerNode[];
  incidents: Incident[];
  telegramConfig?: (TelegramConfig & { hasBotToken: boolean; botTokenPreview: string }) | null;
  telegramLogs?: TelegramLogItem[];
  onAuthChange: (state: AdminAuthState) => void;
  onRefreshData: () => void;
  onShowToast: (type: 'success' | 'warning' | 'error' | 'info', title: string, desc?: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  authState,
  services = [],
  nodes = [],
  incidents = [],
  telegramConfig,
  telegramLogs = [],
  onAuthChange,
  onRefreshData,
  onShowToast,
}) => {
  const safeServices = Array.isArray(services) ? services : [];
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  // Navigation
  const [activeTab, setActiveTab] = useState<
    'nodes' | 'services' | 'incidents' | 'database' | 'deploy' | 'security' | 'webhooks' | 'sla' | 'audit' | 'public' | 'cloudflare' | 'telegram' | 'apikeys'
  >('nodes');

  // Login form state
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Probe Script Modal
  const [selectedNodeForProbe, setSelectedNodeForProbe] = useState<ServerNode | null>(null);
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  // Node Modal State
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<ServerNode | null>(null);
  const [nodeForm, setNodeForm] = useState({
    name: '',
    region: 'us-east-1',
    ip: '',
    os: 'Ubuntu 24.04 LTS (x86_64)',
    status: 'online' as ServerNode['status'],
    tags: 'vps, prod',
  });

  // Service Modal State
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [serviceForm, setServiceForm] = useState({
    name: '',
    category: 'API',
    url: '',
    status: 'operational' as ServiceItem['status'],
    latency: 35,
    description: '',
  });

  // Incident Modal State
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    title: '',
    severity: 'minor' as Incident['severity'],
    affectedServices: [] as string[],
    message: '',
  });

  // Incident Update Modal State
  const [selectedIncidentForUpdate, setSelectedIncidentForUpdate] = useState<Incident | null>(null);
  const [updateStatus, setUpdateStatus] = useState<Incident['status']>('investigating');
  const [updateMessage, setUpdateMessage] = useState('');

  // Change Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Loading states
  const [simulatingNodeId, setSimulatingNodeId] = useState<string | null>(null);

  // Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPassword) return;
    setIsLoggingIn(true);
    try {
      const res = await adminLogin(loginPassword);
      if (res.success && res.token) {
        onAuthChange({ isAuthenticated: true, token: res.token, username: 'admin' });
        onShowToast('success', '登录成功', '欢迎进入 CloudPulse 运维后台管理系统。');
      } else {
        onShowToast('error', '密码错误', res.error || '请输入正确的管理员密码');
      }
    } catch (err: any) {
      onShowToast('error', '登录失败', err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    onAuthChange({ isAuthenticated: false });
    onShowToast('info', '已退出登录', '后台管理员会话已终止。');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) return;
    setIsChangingPass(true);
    try {
      const res = await changeAdminPassword(oldPassword, newPassword);
      if (res.success) {
        onShowToast('success', '密码修改成功', '请牢记您的新管理员密码。');
        setOldPassword('');
        setNewPassword('');
      } else {
        onShowToast('error', '修改失败', res.error || '原密码错误');
      }
    } catch (err: any) {
      onShowToast('error', '修改失败', err.message);
    } finally {
      setIsChangingPass(false);
    }
  };

  // Node Actions
  const handleSaveNode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tagsArray = nodeForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (editingNode) {
        await updateNode(editingNode.id, {
          name: nodeForm.name,
          region: nodeForm.region,
          ip: nodeForm.ip,
          os: nodeForm.os,
          status: nodeForm.status,
          tags: tagsArray,
        });
        onShowToast('success', '节点已更新', `服务器 ${nodeForm.name} 信息已同步。`);
      } else {
        const created = await createNode({
          name: nodeForm.name,
          region: nodeForm.region,
          ip: nodeForm.ip,
          os: nodeForm.os,
          status: nodeForm.status,
          tags: tagsArray,
        });
        onShowToast('success', '服务器探针已添加', `探针密钥: ${created.probeToken}`);
        setSelectedNodeForProbe(created);
      }
      setIsNodeModalOpen(false);
      setEditingNode(null);
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '操作失败', err.message);
    }
  };

  const handleDeleteNode = async (id: string, name: string) => {
    if (!confirm(`确认要删除服务器探针「${name}」吗？相关监控上报将被中止。`)) return;
    try {
      await deleteNode(id);
      onShowToast('success', '节点已删除', `服务器 ${name} 已从监控拓扑中移除。`);
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '删除失败', err.message);
    }
  };

  const handleSimulateProbe = async (nodeId: string) => {
    setSimulatingNodeId(nodeId);
    try {
      const updated = await simulateNodeProbe(nodeId);
      onShowToast(
        'success',
        '模拟探针上报成功',
        `已收到来自 ${updated.name} 的心跳：CPU ${updated.cpu}%，内存 ${updated.ram}%`
      );
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '模拟上报失败', err.message);
    } finally {
      setSimulatingNodeId(null);
    }
  };

  // Service Actions
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingService) {
        await updateService(editingService.id, serviceForm);
        onShowToast('success', '微服务已更新', `服务 ${serviceForm.name} 配置已保存。`);
      } else {
        await createService(serviceForm);
        onShowToast('success', '微服务拨测已添加', `已纳入健康检查队列: ${serviceForm.name}`);
      }
      setIsServiceModalOpen(false);
      setEditingService(null);
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '操作失败', err.message);
    }
  };

  const handleDeleteService = async (id: string, name: string) => {
    if (!confirm(`确认要删除服务「${name}」的拨测监控吗？`)) return;
    try {
      await deleteService(id);
      onShowToast('success', '服务已删除', `已停止对 ${name} 的定时探测。`);
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '删除失败', err.message);
    }
  };

  // Incident Actions
  const handleSaveIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createIncident({
        title: incidentForm.title,
        severity: incidentForm.severity,
        affectedServices: incidentForm.affectedServices,
        timeline: [
          {
            id: `upd-${Date.now()}`,
            status: 'investigating',
            message: incidentForm.message || '应急响应小组已介入调查与止血。',
            timestamp: new Date().toISOString(),
          },
        ],
      });
      onShowToast('warning', '故障事件已发布', '系统已自动通过 Telegram 推送故障告警！');
      setIsIncidentModalOpen(false);
      setIncidentForm({ title: '', severity: 'minor', affectedServices: [], message: '' });
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '发布失败', err.message);
    }
  };

  const handleAddIncidentUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentForUpdate || !updateMessage) return;
    try {
      await addIncidentUpdate(selectedIncidentForUpdate.id, updateStatus, updateMessage);
      onShowToast('success', '进展通报已发布', 'Telegram 订阅通道已同步播报最新进展。');
      setSelectedIncidentForUpdate(null);
      setUpdateMessage('');
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '通报失败', err.message);
    }
  };

  const handleResolveIncident = async (id: string, title: string) => {
    if (!confirm(`确认将故障事件「${title}」标记为全部恢复并解除吗？`)) return;
    try {
      await resolveIncident(id, '经过持续监控与回访，所有指标已恢复正常，事件正式解除。');
      onShowToast('success', '故障已解除', '已向 Telegram 发送全链路恢复解除通知！');
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '解除失败', err.message);
    }
  };

  const handleDeleteIncident = async (id: string) => {
    if (!confirm('确认删除此事件记录吗？')) return;
    try {
      await deleteIncident(id);
      onShowToast('success', '已删除事件', '记录已从历史归档中清除。');
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '删除失败', err.message);
    }
  };

  const handleResetData = async () => {
    if (!confirm('确认重置演示环境所有数据为系统初始预设吗？')) return;
    try {
      await resetDemoData();
      onShowToast('info', '数据已重置', '监控指标与演示事件已复位。');
      onRefreshData();
    } catch (err: any) {
      onShowToast('error', '重置失败', err.message);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(label);
    setTimeout(() => setCopiedScript(null), 2000);
    onShowToast('info', '已复制到剪贴板', label);
  };

  // 1. Unauthenticated Login Screen
  if (!authState.isAuthenticated) {
    return (
      <div id="admin-login-screen" className="max-w-md mx-auto my-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              CloudPulse 运维后台管理系统
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              请进行管理员身份认证以管理监控探针、微服务拓扑及告警策略
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                管理员访问密钥 (Password)
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="请输入管理员密码"
                  autoFocus
                  className="w-full text-xs px-3.5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>



            <button
              type="submit"
              disabled={isLoggingIn || !loginPassword}
              className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>正在验证安全凭据...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>验证并登录后台</span>
                </>
              )}
            </button>
          </form>

          <div className="text-center text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-4">
            CloudPulse 生产级安全防护体系 • 会话持久加密保护
          </div>
        </div>
      </div>
    );
  }

  // 2. Authenticated Admin Dashboard Layout
  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <div id="admin-dashboard-container" className="space-y-6">
      {/* Admin Top Header */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                运维管理控制台 (Admin Operations)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                统一调度服务器探针、微服务健康探测、应急响应发布与多环境部署
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span>退出后台</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('nodes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'nodes'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>服务器与探针管理 ({safeNodes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('services')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'services'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>微服务拨测拓扑 ({safeServices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('incidents')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'incidents'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>故障通报与事件 ({safeIncidents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'database'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>数据备份与持久化优化</span>
        </button>

        <button
          onClick={() => setActiveTab('deploy')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'deploy'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <DownloadCloud className="w-3.5 h-3.5" />
          <span>多平台部署安装指南</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'security'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>安全与密码设置</span>
        </button>

        <button
          onClick={() => setActiveTab('webhooks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'webhooks'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Webhook className="w-3.5 h-3.5" />
          <span>多通道 Webhook 告警</span>
        </button>

        <button
          onClick={() => setActiveTab('sla')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'sla'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>可用性 SLA 报告</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>安全审计日志</span>
        </button>

        <button
          onClick={() => setActiveTab('public')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'public'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>公开状态页设置</span>
        </button>

        <button
          onClick={() => setActiveTab('cloudflare')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'cloudflare'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-950/20 hover:bg-orange-100/60'
          }`}
        >
          <Cloud className="w-3.5 h-3.5" />
          <span>Cloudflare 免费额度 &amp; 心跳保留</span>
        </button>

        <button
          onClick={() => setActiveTab('telegram')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'telegram'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-sky-600 dark:text-sky-400 bg-sky-50/50 dark:bg-sky-950/20 hover:bg-sky-100/60'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>TG 消息推送与 Bot 管理</span>
        </button>

        <button
          onClick={() => setActiveTab('apikeys')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'apikeys'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 hover:bg-purple-100/60'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>API KEY 设置</span>
        </button>
      </div>

      {/* TAB 1: NODES & PROBES */}
      {activeTab === 'nodes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-500" />
                <span>受监控服务器与探针上报节点</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                支持 Linux VPS / 物理机通过极简 Shell、Docker 或 Python 探针上报 CPU、内存、负载与网络吞吐
              </p>
            </div>

            <button
              onClick={() => {
                setEditingNode(null);
                setNodeForm({
                  name: '',
                  region: 'us-east-1',
                  ip: '',
                  os: 'Ubuntu 24.04 LTS (x86_64)',
                  status: 'online',
                  tags: 'vps, prod',
                });
                setIsNodeModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>+ 添加新服务器探针</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {safeNodes.map((node) => (
              <div
                key={node.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        node.status === 'online'
                          ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                          : node.status === 'degraded'
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                    />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {node.name}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 font-mono">
                        <span>{node.ip}</span>
                        <span>•</span>
                        <span>{node.region}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedNodeForProbe(node)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs"
                      title="查看并复制探针一键安装脚本"
                    >
                      <Terminal className="w-3.5 h-3.5 text-sky-500" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingNode(node);
                        setNodeForm({
                          name: node.name,
                          region: node.region,
                          ip: node.ip,
                          os: node.os,
                          status: node.status,
                          tags: node.tags.join(', '),
                        });
                        setIsNodeModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs"
                      title="编辑节点信息"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteNode(node.id, node.name)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs"
                      title="删除节点"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Metrics Progress */}
                <div className="space-y-2.5 pt-1">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-sky-500" />
                        <span>CPU 负载</span>
                      </span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                        {node.cpu}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          node.cpu > 80 ? 'bg-rose-500' : node.cpu > 60 ? 'bg-amber-500' : 'bg-sky-500'
                        }`}
                        style={{ width: `${node.cpu}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-emerald-500" />
                        <span>内存 (RAM)</span>
                      </span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                        {node.ram}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          node.ram > 85 ? 'bg-rose-500' : node.ram > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${node.ram}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Meta details & Simulate button */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="space-y-0.5">
                    <div>系统: {node.os}</div>
                    <div>心跳: {new Date(node.lastHeartbeat).toLocaleTimeString()}</div>
                  </div>

                  <button
                    onClick={() => handleSimulateProbe(node.id)}
                    disabled={simulatingNodeId === node.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 text-xs font-medium transition-colors disabled:opacity-50"
                    title="在没有外部 VPS 时模拟一次探针上报，检验心跳与图表刷新"
                  >
                    <Zap className={`w-3 h-3 ${simulatingNodeId === node.id ? 'animate-spin' : ''}`} />
                    <span>模拟心跳上报</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: SERVICES */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-500" />
                <span>微服务健康拨测拓扑管理</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                管理前台服务列表、API 探测目标、运行健康度状态与 30 天可用率 SLA
              </p>
            </div>

            <button
              onClick={() => {
                setEditingService(null);
                setServiceForm({
                  name: '',
                  category: 'API',
                  url: '',
                  status: 'operational',
                  latency: 35,
                  description: '',
                });
                setIsServiceModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>+ 新增微服务监控</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3.5 font-semibold">服务名称 & 分类</th>
                    <th className="p-3.5 font-semibold">健康状态</th>
                    <th className="p-3.5 font-semibold">探测延迟</th>
                    <th className="p-3.5 font-semibold">30d SLA</th>
                    <th className="p-3.5 font-semibold">目标 URL</th>
                    <th className="p-3.5 font-semibold text-right">管理操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {safeServices.map((srv) => (
                    <tr key={srv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {srv.name}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {srv.category}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            srv.status === 'operational'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : srv.status === 'degraded'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {srv.status}
                        </span>
                      </td>

                      <td className="p-3.5 font-mono text-slate-700 dark:text-slate-300">
                        {srv.latency} ms
                      </td>

                      <td className="p-3.5 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {srv.uptime30d}%
                      </td>

                      <td className="p-3.5 font-mono text-slate-400 truncate max-w-[180px]">
                        {srv.url || '-'}
                      </td>

                      <td className="p-3.5 text-right space-x-1">
                        <button
                          onClick={() => {
                            setEditingService(srv);
                            setServiceForm({
                              name: srv.name,
                              category: srv.category,
                              url: srv.url,
                              status: srv.status,
                              latency: srv.latency,
                              description: srv.description,
                            });
                            setIsServiceModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteService(srv.id, srv.name)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INCIDENTS */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>故障事件中心与应急协同</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                录入故障通报将自动格式化并通过 Telegram 机器人广播至订阅用户或运维群
              </p>
            </div>

            <button
              onClick={() => setIsIncidentModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>+ 发布新故障事件</span>
            </button>
          </div>

          <div className="space-y-4">
            {safeIncidents.map((inc) => (
              <div
                key={inc.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          inc.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {inc.status}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {inc.severity}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {inc.title}
                      </h4>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      发布时间: {new Date(inc.createdAt).toLocaleString()} | 影响范围:{' '}
                      {inc.affectedServices.join(', ') || '未指明'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {inc.status !== 'resolved' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedIncidentForUpdate(inc);
                            setUpdateStatus('monitoring');
                          }}
                          className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                        >
                          追加排查进展
                        </button>
                        <button
                          onClick={() => handleResolveIncident(inc.id, inc.title)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                        >
                          标记为已解除
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteIncident(inc.id)}
                      className="p-1 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                <div className="pl-3 border-l-2 border-slate-200 dark:border-slate-800 space-y-2 mt-2">
                  {(inc.timeline || []).map((item) => (
                    <div key={item.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold uppercase text-[10px] text-sky-600 dark:text-sky-400">
                          {item.status}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{item.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: DEPLOYMENT GUIDES */}
      {activeTab === 'deploy' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-sky-500" />
              <span>多环境全自动生产部署方案</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              CloudPulse 经过专门的云原生适配，可一键部署至 <strong>Cloudflare / Docker / 原生 Linux VPS</strong>。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Deploy Mode 1: Docker */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-sky-500">
                <FileCode className="w-5 h-5" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  方案 1: Docker & Docker Compose
                </h4>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                推荐容器化生产部署，数据持久化映射至 <code>data_store.json</code>，支持毫秒级健康检查。
              </p>

              <div className="bg-slate-950 p-3 rounded-xl font-mono text-[11px] text-slate-300 space-y-1.5 overflow-x-auto">
                <div className="text-slate-500"># 1. 启动容器集群</div>
                <div className="text-emerald-400">docker compose up -d --build</div>
                <div className="text-slate-500 mt-2"># 2. 查看容器运行日志</div>
                <div className="text-emerald-400">docker logs -f cloudpulse-monitor</div>
              </div>

              <button
                onClick={() =>
                  copyToClipboard(
                    'docker compose up -d --build',
                    'Docker Compose 启动命令'
                  )
                }
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
              >
                {copiedScript === 'Docker Compose 启动命令' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>复制 Docker 启动指令</span>
              </button>
            </div>

            {/* Deploy Mode 2: VPS One-Line Script */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-emerald-500">
                <Terminal className="w-5 h-5" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  方案 2: Linux VPS 原生一键安装
                </h4>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                无需复杂配置，自动探测 Ubuntu / Debian / CentOS，使用 PM2 守护进程保证 7x24 小时稳定。
              </p>

              <div className="bg-slate-950 p-3 rounded-xl font-mono text-[11px] text-slate-300 space-y-1.5 overflow-x-auto">
                <div className="text-slate-500"># 执行一键部署脚本</div>
                <div className="text-emerald-400">chmod +x deploy.sh && ./deploy.sh</div>
                <div className="text-slate-500 mt-2"># 管理命令</div>
                <div className="text-emerald-400">pm2 status cloudpulse</div>
              </div>

              <button
                onClick={() =>
                  copyToClipboard(
                    'chmod +x deploy.sh && ./deploy.sh',
                    'VPS 一键部署指令'
                  )
                }
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
              >
                {copiedScript === 'VPS 一键部署指令' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>复制 VPS 部署脚本</span>
              </button>
            </div>

            {/* Deploy Mode 3: Cloudflare Pages */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-amber-500">
                <Globe className="w-5 h-5" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  方案 3: Cloudflare 全球边缘分发
                </h4>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                通过项目根目录自带的 <code>wrangler.toml</code>，秒级将前端构建分发至 Cloudflare 全球 300+ 边缘机房。
              </p>

              <div className="bg-slate-950 p-3 rounded-xl font-mono text-[11px] text-slate-300 space-y-1.5 overflow-x-auto">
                <div className="text-slate-500"># 1. 编译静态产物</div>
                <div className="text-emerald-400">npm run build</div>
                <div className="text-slate-500 mt-2"># 2. 部署到 Cloudflare Pages</div>
                <div className="text-emerald-400">npx wrangler pages deploy dist</div>
              </div>

              <button
                onClick={() =>
                  copyToClipboard(
                    'npm run build && npx wrangler pages deploy dist',
                    'Cloudflare Pages 部署指令'
                  )
                }
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
              >
                {copiedScript === 'Cloudflare Pages 部署指令' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>复制 Cloudflare 部署指令</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SECURITY & PASSWORDS */}
      {activeTab === 'security' && (
        <div className="max-w-xl bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-sky-500" />
              <span>安全访问凭据与系统维护</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              修改 Web 后台管理员访问密码或复位系统数据
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                原管理密码
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入当前密码"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                新管理密码 (至少 6 位字符)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新安全密码"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPass || !oldPassword || !newPassword}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition-colors disabled:opacity-50"
            >
              {isChangingPass ? '正在更新密码...' : '确认更新管理员密码'}
            </button>
          </form>

          <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">
              危险维护操作
            </h4>
            <p className="text-[11px] text-slate-400 mb-3">
              重置演示数据会将服务节点、微服务与历史事件还原为官方演示模板。
            </p>
            <button
              onClick={handleResetData}
              className="px-4 py-1.5 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300 hover:bg-rose-100 transition-colors"
            >
              恢复演示初始数据
            </button>
          </div>
        </div>
      )}

      {/* TAB 6: DATABASE BACKUP & OPTIMIZATION */}
      {activeTab === 'database' && (
        <DatabaseBackupManager
          onShowToast={onShowToast}
          onDataRestored={onRefreshData}
        />
      )}

      {/* TAB 7: WEBHOOKS & MAINTENANCE */}
      {activeTab === 'webhooks' && <WebhookManager onShowToast={onShowToast} />}

      {/* TAB 8: SLA REPORTS */}
      {activeTab === 'sla' && <SlaReportsView onShowToast={onShowToast} />}

      {/* TAB 9: AUDIT LOGS */}
      {activeTab === 'audit' && <AuditLogsView onShowToast={onShowToast} />}

      {/* TAB 10: PUBLIC STATUS & ANNOUNCEMENT */}
      {activeTab === 'public' && <PublicStatusManager onShowToast={onShowToast} />}

      {/* TAB 11: CLOUDFLARE QUOTA & RETENTION */}
      {activeTab === 'cloudflare' && (
        <CloudflareQuotaManager onShowToast={onShowToast} onRefreshOverview={onRefreshData} />
      )}

      {/* TAB 12: TELEGRAM BOT & PUSH (Admin Gated) */}
      {activeTab === 'telegram' && (
        <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <TelegramBotHub
            config={telegramConfig ?? null}
            logs={telegramLogs ?? []}
            onRefreshData={onRefreshData}
            onShowToast={onShowToast}
          />
        </div>
      )}

      {/* TAB 8: API KEYS */}
      {activeTab === 'apikeys' && (
        <ApiKeyManager onShowToast={onShowToast} />
      )}

      {/* MODAL 1: Probe 1-Line Script Viewer */}
      {selectedNodeForProbe && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    一键探针安装脚本: {selectedNodeForProbe.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Token: {selectedNodeForProbe.probeToken}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedNodeForProbe(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Script 1: Curl Bash */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                1. Linux VPS 一键执行 (推荐，支持后台循环心跳上报)
              </span>
              <div className="bg-slate-950 p-3.5 rounded-xl font-mono text-xs text-emerald-400 break-all select-all flex items-center justify-between gap-3">
                <span>
                  curl -sSL "{originUrl}/api/probe/script?token={selectedNodeForProbe.probeToken}" | bash &amp;
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `curl -sSL "${originUrl}/api/probe/script?token=${selectedNodeForProbe.probeToken}" | bash &`,
                      '一键探针脚本'
                    )
                  }
                  className="p-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 shrink-0"
                  title="复制指令"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Script 2: Manual Ingest Curl Test */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                2. 单次手动上报测试 (cURL)
              </span>
              <div className="bg-slate-950 p-3.5 rounded-xl font-mono text-xs text-sky-400 break-all select-all">
                curl -X POST "{originUrl}/api/probe/report" \<br />
                &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                &nbsp;&nbsp;-d '{`{"token": "${selectedNodeForProbe.probeToken}", "cpu": 32, "ram": 45, "disk": 50}`}'
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 space-y-1">
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                探针工作机制与心跳频率说明
              </div>
              <p>
                探针默认根据【Cloudflare 免费额度与心跳配置】中设定的频率（默认 60 秒）向后端上报 CPU、内存、磁盘及系统负载。脚本亦支持通过参数 <code className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px]">&amp;interval=30</code> 单独指定自定义心跳频率。
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedNodeForProbe(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add/Edit Server Node */}
      {isNodeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {editingNode ? '编辑服务器探针节点' : '添加受监控服务器节点'}
            </h3>

            <form onSubmit={handleSaveNode} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  服务器名称 (如 香港机房主节点)
                </label>
                <input
                  type="text"
                  required
                  value={nodeForm.name}
                  onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                  placeholder="例如: US-West (Silicon Valley)"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    所在区域代号
                  </label>
                  <input
                    type="text"
                    required
                    value={nodeForm.region}
                    onChange={(e) => setNodeForm({ ...nodeForm, region: e.target.value })}
                    placeholder="us-west-1, hk-1..."
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    公网或内网 IP
                  </label>
                  <input
                    type="text"
                    required
                    value={nodeForm.ip}
                    onChange={(e) => setNodeForm({ ...nodeForm, ip: e.target.value })}
                    placeholder="198.51.100.23"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  操作系统规格
                </label>
                <input
                  type="text"
                  value={nodeForm.os}
                  onChange={(e) => setNodeForm({ ...nodeForm, os: e.target.value })}
                  placeholder="Ubuntu 24.04 LTS / Debian 12"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  标签 (以英文逗号分隔)
                </label>
                <input
                  type="text"
                  value={nodeForm.tags}
                  onChange={(e) => setNodeForm({ ...nodeForm, tags: e.target.value })}
                  placeholder="prod, api-gateway, master"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsNodeModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-xs"
                >
                  保存节点
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add/Edit Microservice */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {editingService ? '编辑微服务拨测' : '新增微服务拨测'}
            </h3>

            <form onSubmit={handleSaveService} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  微服务名称
                </label>
                <input
                  type="text"
                  required
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                  placeholder="例如: 核心会员与授权服务"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    所属分类
                  </label>
                  <select
                    value={serviceForm.category}
                    onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="API">API Gateway</option>
                    <option value="Frontend">Frontend / CDN</option>
                    <option value="Database">Database</option>
                    <option value="Cache">Cache & Queue</option>
                    <option value="Payments">Payments</option>
                    <option value="Integration">Integration</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    初始状态
                  </label>
                  <select
                    value={serviceForm.status}
                    onChange={(e) =>
                      setServiceForm({
                        ...serviceForm,
                        status: e.target.value as ServiceItem['status'],
                      })
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="operational">Operational (正常运行)</option>
                    <option value="degraded">Degraded (性能下降)</option>
                    <option value="partial_outage">Partial Outage (部分中断)</option>
                    <option value="major_outage">Major Outage (重大故障)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  探测目标 URL / 连通性地址
                </label>
                <input
                  type="text"
                  value={serviceForm.url}
                  onChange={(e) => setServiceForm({ ...serviceForm, url: e.target.value })}
                  placeholder="https://api.yourdomain.com/health"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  服务职能说明
                </label>
                <textarea
                  rows={2}
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                  placeholder="负责处理高并发 JWT 鉴权与第三方 OAuth 会话"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsServiceModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-xs"
                >
                  保存微服务
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Post Incident */}
      {isIncidentModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              <span>发布生产故障通报</span>
            </h3>

            <form onSubmit={handleSaveIncident} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  事件标题
                </label>
                <input
                  type="text"
                  required
                  value={incidentForm.title}
                  onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })}
                  placeholder="例如: 欧洲 CDN 节点访问超时与回源抖动"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  故障影响严重级别
                </label>
                <select
                  value={incidentForm.severity}
                  onChange={(e) =>
                    setIncidentForm({
                      ...incidentForm,
                      severity: e.target.value as Incident['severity'],
                    })
                  }
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="minor">Minor (轻微性能抖动)</option>
                  <option value="major">Major (部分业务受损)</option>
                  <option value="critical">Critical (全站重大中断)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  初始通报内容
                </label>
                <textarea
                  rows={3}
                  required
                  value={incidentForm.message}
                  onChange={(e) => setIncidentForm({ ...incidentForm, message: e.target.value })}
                  placeholder="值班运维已发现异常并拉起应急响应，正在全力排查链路..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsIncidentModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                >
                  发布并推送 Telegram
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Append Incident Update */}
      {selectedIncidentForUpdate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              追加故障排查进展
            </h3>
            <p className="text-xs text-slate-400 font-sans">
              针对事件: <strong>{selectedIncidentForUpdate.title}</strong>
            </p>

            <form onSubmit={handleAddIncidentUpdate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  当前进展阶段
                </label>
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value as Incident['status'])}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="investigating">Investigating (排查中)</option>
                  <option value="identified">Identified (已定位根因)</option>
                  <option value="monitoring">Monitoring (已修复，持续观察中)</option>
                  <option value="resolved">Resolved (彻底恢复解除)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  进展通报说明
                </label>
                <textarea
                  rows={3}
                  required
                  value={updateMessage}
                  onChange={(e) => setUpdateMessage(e.target.value)}
                  placeholder="例如: 瓶颈由于上游网关连接池耗尽导致，已实施紧急热扩容，当前延迟已恢复..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedIncidentForUpdate(null)}
                  className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-xs"
                >
                  提交并通报
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
