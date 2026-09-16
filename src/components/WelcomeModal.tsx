import React from 'react';
import {
  X,
  Sparkles,
  Terminal,
  Cpu,
  Shield,
  Layers,
  ArrowRight,
  Code2,
  CheckCircle2,
  Zap
} from 'lucide-react';
import { ScrambleText } from './ScrambleText';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerminal: () => void;
  onOpenSpecs: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onOpenTerminal,
  onOpenSpecs,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col text-slate-800 animate-in zoom-in-95 duration-200">
        
        {/* Cyber Header Bar */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 border-b border-indigo-900/40 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider text-indigo-300 uppercase">
                  Andromeda Soul OS
                </span>
                <span className="px-1.5 py-0.2 text-[10px] font-mono font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ONLINE
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[80vh]">
          
          {/* Main Cipher Scramble Heading */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-mono font-semibold mb-1">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
              <span>Sovereign Intelligence Engine</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight font-mono">
              <ScrambleText text="Welcome to Andromeda Soul" duration={1400} delay={100} />
            </h2>

            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              <ScrambleText text="Think • Code • Create • Autonomous Multimodal AI" duration={1600} delay={300} />
            </p>
          </div>

          {/* Quick Capability Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            
            {/* Terminal & Local AI Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-slate-900 text-emerald-400">
                  <Terminal className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  Local AI Ready
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">Built-in Terminal & Local AI</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Run bash commands directly. Install & execute <span className="font-semibold text-slate-800">Ollama</span> and <span className="font-semibold text-slate-800">OpenCode</span> with one click in the terminal.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onOpenTerminal();
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>Launch Terminal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Frontier Fleet Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-indigo-300 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-indigo-600 text-white">
                  <Cpu className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                  Models 1.0 - 2.1
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">Frontier Model Fleet</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Powered by Google Gemini 800k context (Soul 1.0), NVIDIA Nemotron & Kimi K3 hybrid reasoning (Soul 2.0), and Haiku 3.5 (Soul 2.1).
              </p>
              <button
                onClick={() => {
                  onClose();
                  onOpenSpecs();
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer pt-1"
              >
                <span>View Architecture Specs</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

          {/* Quick Features List */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/80 space-y-2.5">
            <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-indigo-900">
              Key Sovereign Capabilities
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Google Cloud Firestore real-time sync</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Install Ollama & run local LLMs</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Install & launch OpenCode CLI</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Zero token leak security boundary</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => {
              onClose();
              onOpenTerminal();
            }}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Open Terminal (Ollama & OpenCode)</span>
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-indigo-200"
          >
            <span>Start Chatting</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
