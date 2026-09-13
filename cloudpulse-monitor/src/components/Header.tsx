import React from 'react';
import {
  Activity,
  Bot,
  AlertTriangle,
  ShieldCheck,
  Send,
  RefreshCw,
  Server,
  Lock,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { SystemOverview, AdminAuthState } from '../types';

interface HeaderProps {
  activeTab: 'overview' | 'telegram' | 'incidents' | 'admin';
  setActiveTab: (tab: 'overview' | 'telegram' | 'incidents' | 'admin') => void;
  overview: SystemOverview | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenQuickPush: () => void;
  authState?: AdminAuthState;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  overview,
  onRefresh,
  isRefreshing,
  onOpenQuickPush,
  authState,
}) => {
  const isAllGood = overview?.overallStatus === 'all_good';
  const hasActiveIncidents = (overview?.activeIncidentsCount || 0) > 0;

  return (
    <header id="app-header" className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Status indicator */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-800 text-white shadow-sm">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isAllGood ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isAllGood ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white font-sans">
                  CloudPulse
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  v2.5 Live
                </span>
              </div>
              <p className="hidden md:block text-xs text-slate-500 dark:text-slate-400">
                集群探针监控 • Telegram 告警推送 • 后台运维管理
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <nav id="header-nav-tabs" className="hidden lg:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
            <button
              id="tab-btn-overview"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                activeTab === 'overview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Server className="w-4 h-4 text-emerald-500" />
              <span>监控大盘</span>
            </button>

            <button
              id="tab-btn-telegram"
              onClick={() => setActiveTab('telegram')}
              className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                activeTab === 'telegram'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bot className="w-4 h-4 text-sky-500" />
              <span>Telegram 消息推送</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
                Push Only
              </span>
            </button>

            <button
              id="tab-btn-incidents"
              onClick={() => setActiveTab('incidents')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                activeTab === 'incidents'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <AlertTriangle className={`w-4 h-4 ${hasActiveIncidents ? 'text-amber-500' : 'text-slate-400'}`} />
              <span>故障事件</span>
              {hasActiveIncidents && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>

            <button
              id="tab-btn-admin"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                activeTab === 'admin'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {authState?.isAuthenticated ? (
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              ) : (
                <Lock className="w-4 h-4 text-purple-500" />
              )}
              <span>后台管理</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                Admin
              </span>
            </button>
          </nav>

          {/* Right Action buttons */}
          <div className="flex items-center gap-2">
            {/* Quick Telegram Push button */}
            <button
              id="quick-push-btn"
              onClick={onOpenQuickPush}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-500 hover:bg-sky-600 text-white shadow-xs transition-colors"
              title="发送即时 Telegram 广播或告警"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">TG 推送</span>
            </button>

            {/* Refresh Button */}
            <button
              id="header-refresh-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="刷新数据"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
            </button>

            {/* 4-Theme Mode Selector */}
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex lg:hidden overflow-x-auto py-2 border-t border-slate-100 dark:border-slate-800 gap-2 scrollbar-none">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            📊 监控大盘
          </button>
          <button
            onClick={() => setActiveTab('telegram')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === 'telegram'
                ? 'bg-sky-600 text-white font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            🤖 TG 消息推送
          </button>
          <button
            onClick={() => setActiveTab('incidents')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === 'incidents'
                ? 'bg-amber-600 text-white font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            ⚠️ 故障事件
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              activeTab === 'admin'
                ? 'bg-purple-600 text-white font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            🛡 后台管理
          </button>
        </div>
      </div>
    </header>
  );
};
