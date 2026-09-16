import React, { useState } from 'react';
import { X, Cpu, Zap, Layers, Sparkles, Shield, HardDrive, CheckCircle2, ArrowRight } from 'lucide-react';

interface AndromedaSpecsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModel?: (modelId: string) => void;
}

export const AndromedaSpecsModal: React.FC<AndromedaSpecsModalProps> = ({
  isOpen,
  onClose,
  onSelectModel,
}) => {
  const [activeTab, setActiveTab] = useState<'1.0' | '2.0' | '2.1' | 'comparison'>('1.0');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden text-slate-800">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-300">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">Andromeda Soul Architecture & Specs</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Sovereign Fleet v3.7
                </span>
              </div>
              <p className="text-xs text-slate-300">Comprehensive technical breakdown, version history, and base architectures</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-6 py-3 bg-slate-50 border-b border-slate-200 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('1.0')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === '1.0'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" /> Andromeda Soul 1.0
          </button>
          <button
            onClick={() => setActiveTab('2.0')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === '2.0'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" /> Andromeda Soul 2.0
          </button>
          <button
            onClick={() => setActiveTab('2.1')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === '2.1'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" /> Andromeda Soul 2.1
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'comparison'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" /> Fleet Comparison
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {activeTab === '1.0' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-slate-50 border border-indigo-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                      Flagship Sovereign Model
                    </span>
                    <span className="text-xs font-medium text-slate-500">Released Q1 2025</span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Andromeda Soul 1.0</h3>
                  <p className="text-sm text-slate-600 max-w-2xl">
                    Engineered for massive codebase synthesis, multi-file code editing, and long-horizon planning with 800k context window support.
                  </p>
                </div>
                {onSelectModel && (
                  <button
                    onClick={() => {
                      onSelectModel('andromeda-soul-1');
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
                  >
                    <span>Select Model 1.0</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Base Architecture</div>
                  <div className="text-base font-bold text-slate-900">Google Gemini Frontier 3.x Flash / Pro Cloud</div>
                  <p className="text-xs text-slate-500">Leverages Google Cloud TPU v5p infrastructure with native multimodal reasoning.</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Context Window</div>
                  <div className="text-base font-bold text-indigo-600">800,000 Tokens</div>
                  <p className="text-xs text-slate-500">Capable of ingesting complete software repositories and documentation libraries simultaneously.</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Reasoning Speed</div>
                  <div className="text-base font-bold text-slate-900">&lt; 135ms TTFT</div>
                  <p className="text-xs text-slate-500">Optimized KV caching and parallel speculative decoding pipelines.</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Technical Specifications & Capabilities</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    'Autonomous multi-file code patching and AST analysis',
                    'Continuous Google Cloud Firestore auto-learning synchronization',
                    'Built-in chain-of-thought extended thinking toggle',
                    'Native image generation and SVG/D3 data visualization',
                    'Robust markdown and code block sandbox execution',
                    'Enterprise-grade security and secret isolation',
                  ].map((spec, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs sm:text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{spec}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Version History & Changelog</h4>
                <div className="space-y-3 border-l-2 border-indigo-200 pl-4 ml-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-600">v1.3.0 (Current)</span>
                      <span className="text-xs text-slate-400">• Upgraded to Gemini 3.6/3.8 Flash inference engine</span>
                    </div>
                    <p className="text-xs text-slate-600">Enhanced reasoning stability, reduced latency by 18%, and added deep KV-cache recycling.</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">v1.1.0</span>
                      <span className="text-xs text-slate-400">• Initial Cloud Integration</span>
                    </div>
                    <p className="text-xs text-slate-600">Established direct sovereign cloud binding with Firestore memory sync.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === '2.0' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-slate-50 border border-indigo-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                      Dual-Engine Hybrid Intelligence
                    </span>
                    <span className="text-xs font-medium text-slate-500">Released Q2 2025</span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Andromeda Soul 2.0 (Sonnet 3.7)</h3>
                  <p className="text-sm text-slate-600 max-w-2xl">
                    Combines NVIDIA Nemotron 3.5 Lightning and Moonshot Kimi K3 hosted on NVIDIA NIM with a 16,000 token dedicated reasoning budget.
                  </p>
                </div>
                {onSelectModel && (
                  <button
                    onClick={() => {
                      onSelectModel('andromeda-sonnet-3.7');
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
                  >
                    <span>Select Model 2.0</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Base Architecture</div>
                  <div className="text-base font-bold text-slate-900">NVIDIA Nemotron 3.5 + Moonshot Kimi K3</div>
                  <p className="text-xs text-slate-500">Hybrid NIM inference pipeline with automated load balancing.</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Reasoning Budget</div>
                  <div className="text-base font-bold text-indigo-600">16,000 Tokens</div>
                  <p className="text-xs text-slate-500">Dedicated cognitive deliberation for complex algorithmic and math problem solving.</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Context Window</div>
                  <div className="text-base font-bold text-slate-900">128,000 Tokens</div>
                  <p className="text-xs text-slate-500">Optimized for high-density code modules and technical documentation.</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Technical Specifications & Capabilities</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    'Visible chain-of-thought reasoning steps stream in real-time',
                    'Advanced algorithmic code generation and refactoring',
                    'High precision in multi-step deductive reasoning',
                    'Optimized NVIDIA NIM hardware acceleration',
                    'Nuanced conversational tone and multi-turn context retention',
                  ].map((spec, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs sm:text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{spec}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Version History & Changelog</h4>
                <div className="space-y-3 border-l-2 border-indigo-200 pl-4 ml-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-600">v2.0.2 (Current)</span>
                      <span className="text-xs text-slate-400">• NIM Hardware Optimization</span>
                    </div>
                    <p className="text-xs text-slate-600">Integrated Moonshot Kimi K3 vision models and reduced thinking overhead by 30%.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === '2.1' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-slate-50 border border-indigo-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                      Lightning High-Throughput Model
                    </span>
                    <span className="text-xs font-medium text-slate-500">Released Q3 2025</span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Andromeda Soul 2.1 (Haiku 3.5)</h3>
                  <p className="text-sm text-slate-600 max-w-2xl">
                    Lightning-fast ultra-responsive inference engine optimized for instantaneous daily coding, drafting, and real-time conversation.
                  </p>
                </div>
                {onSelectModel && (
                  <button
                    onClick={() => {
                      onSelectModel('andromeda-haiku-3.5');
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
                  >
                    <span>Select Model 2.1</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Base Architecture</div>
                  <div className="text-base font-bold text-slate-900">Optimized High-Throughput Transformer</div>
                  <p className="text-xs text-slate-500">Fine-tuned for minimal latency and high tokens-per-second output.</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Throughput</div>
                  <div className="text-base font-bold text-indigo-600">300+ Tokens / Sec</div>
                  <p className="text-xs text-slate-500">Instantaneous word and code generation for fluid interactive chat.</p>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Context Window</div>
                  <div className="text-base font-bold text-slate-900">64,000 Tokens</div>
                  <p className="text-xs text-slate-500">Balanced memory footprint for rapid query-response workflows.</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Technical Specifications & Capabilities</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    'Instantaneous time-to-first-token (&lt; 80ms)',
                    'Lightweight prompt summarization and fast code explanation',
                    'Zero-latency stream rendering in UI chat bubbles',
                    'Low memory and compute overhead',
                  ].map((spec, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs sm:text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{spec}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Version History & Changelog</h4>
                <div className="space-y-3 border-l-2 border-indigo-200 pl-4 ml-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-600">v2.1.0 (Current)</span>
                      <span className="text-xs text-slate-400">• High-Throughput Release</span>
                    </div>
                    <p className="text-xs text-slate-600">Optimized KV caching weights for lightning-fast chat responsiveness.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'comparison' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-900">Andromeda Soul Fleet Comparison</h3>
                <p className="text-xs sm:text-sm text-slate-600">
                  Compare the technical specifications, context limits, and base architectures across the entire Andromeda Soul family.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-2xs">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                      <th className="p-3.5 font-bold">Model</th>
                      <th className="p-3.5 font-bold">Base Architecture</th>
                      <th className="p-3.5 font-bold">Context Limit</th>
                      <th className="p-3.5 font-bold">Reasoning / TTFT</th>
                      <th className="p-3.5 font-bold">Primary Use Case</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    <tr className="hover:bg-slate-50/80">
                      <td className="p-3.5 font-semibold text-slate-900">Andromeda Soul 1.0</td>
                      <td className="p-3.5">Google Gemini 3.6 / 3.8 Flash & Pro</td>
                      <td className="p-3.5 font-semibold text-indigo-600">800,000 Tokens</td>
                      <td className="p-3.5">&lt; 135ms TTFT</td>
                      <td className="p-3.5">Full codebase synthesis & long context</td>
                    </tr>
                    <tr className="hover:bg-slate-50/80">
                      <td className="p-3.5 font-semibold text-slate-900">Andromeda Soul 2.0</td>
                      <td className="p-3.5">NVIDIA Nemotron 3.5 + Moonshot Kimi K3</td>
                      <td className="p-3.5">128,000 Tokens</td>
                      <td className="p-3.5 font-semibold text-indigo-600">16k Reasoning Budget</td>
                      <td className="p-3.5">Complex reasoning & math logic</td>
                    </tr>
                    <tr className="hover:bg-slate-50/80">
                      <td className="p-3.5 font-semibold text-slate-900">Andromeda Soul 2.1</td>
                      <td className="p-3.5">Optimized High-Throughput Transformer</td>
                      <td className="p-3.5">64,000 Tokens</td>
                      <td className="p-3.5 font-semibold text-emerald-600">&lt; 80ms TTFT (300+ tok/s)</td>
                      <td className="p-3.5">Instantaneous daily chat & scripting</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">Andromeda Soul Sovereign Intelligence Engine © 2026</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer"
          >
            Close Specs
          </button>
        </div>

      </div>
    </div>
  );
};
