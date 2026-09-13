import React from 'react';
import { Activity, Bot, Shield, CheckCircle2 } from 'lucide-react';

interface FooterProps {
  onOpenTelegram: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenTelegram }) => {
  return (
    <footer className="mt-16 border-t border-slate-200/80 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-slate-900 dark:bg-slate-800 text-emerald-400 flex items-center justify-center">
              <Activity className="w-3 h-3" />
            </div>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              CloudPulse Ops Monitor
            </span>
            <span>•</span>
            <span>高可用运维监控与 Telegram 联动体系</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={onOpenTelegram}
              className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 hover:underline"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Telegram 机器人配置</span>
            </button>
            <span>•</span>
            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>SLA 99.98% 正常运行中</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
