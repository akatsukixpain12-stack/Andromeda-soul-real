import React from 'react';
import { ShieldAlert, Terminal, Check, X, CheckCheck, FolderGit2 } from 'lucide-react';

export interface CommandPermissionRequest {
  id: string;
  type: 'terminal_command' | 'github_commit' | 'file_write' | 'tool_execution';
  title?: string;
  commandOrDetails: string;
  onAllow: () => void;
  onAlwaysAllow?: () => void;
  onDecline: () => void;
}

interface CommandPermissionCardProps {
  request: CommandPermissionRequest;
}

export const CommandPermissionCard: React.FC<CommandPermissionCardProps> = ({ request }) => {
  return (
    <div className="my-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-slate-900 dark:text-slate-100 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
          {request.type === 'github_commit' ? (
            <FolderGit2 className="w-5 h-5" />
          ) : (
            <Terminal className="w-5 h-5" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>{request.title || 'Security Confirmation: Execute Action'}</span>
            </h4>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold">
              Permission Required
            </span>
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300">
            The AI is requesting permission to execute the following operation on your environment or GitHub repository:
          </p>

          <pre className="p-3 rounded-xl bg-slate-900 text-amber-300 text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
            <code>{request.commandOrDetails}</code>
          </pre>

          {/* 3 Action Buttons: Allow | Always Allow | Decline */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={request.onAllow}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer hover:scale-102"
              title="Execute this command once"
            >
              <Check className="w-4 h-4" />
              <span>Allow</span>
            </button>

            <button
              onClick={request.onAlwaysAllow || request.onAllow}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer hover:scale-102"
              title="Always allow commands in this session without prompting"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Always Allow</span>
            </button>

            <button
              onClick={request.onDecline}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-200 hover:bg-rose-100 hover:text-rose-700 dark:bg-slate-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              title="Decline this operation"
            >
              <X className="w-4 h-4" />
              <span>Decline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
