import React, { useState, useEffect } from 'react';
import {
  Database,
  Activity,
  GitFork,
  BookOpen,
  RefreshCw,
  Plus,
  Sparkles,
  Download,
  Layers,
} from 'lucide-react';

interface StatsHeaderProps {
  stats: {
    entitiesCount: number;
    relationsCount: number;
    episodesCount: number;
    activeRetentionAvg: number;
  } | null;
  currentNamespace: string;
  onNamespaceChange: (ns: string) => void;
  onRefresh: () => void;
  onOpenAddModal: () => void;
  onConsolidate: () => Promise<void>;
}

export const StatsHeader: React.FC<StatsHeaderProps> = ({
  stats,
  currentNamespace,
  onNamespaceChange,
  onRefresh,
  onOpenAddModal,
  onConsolidate,
}) => {
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>(['default']);
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    fetch('/api/namespaces')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setNamespaces(data);
      })
      .catch((err) => console.error('Failed to load namespaces:', err));
  }, []);

  const handleConsolidate = async () => {
    setIsConsolidating(true);
    try {
      await onConsolidate();
    } finally {
      setIsConsolidating(false);
    }
  };

  const downloadExport = (format: 'json' | 'graphml' | 'cypher') => {
    setShowExportMenu(false);
    const url = `/api/export?format=${format}&namespace=${encodeURIComponent(currentNamespace)}`;
    window.open(url, '_blank');
  };

  return (
    <header className="border-b border-border bg-[#0b1120]/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3 sm:py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 via-indigo-500/20 to-purple-500/20 border border-sky-500/30 flex items-center justify-center p-1.5 shadow-lg shadow-sky-500/10">
            <img src="/logo.svg" alt="AgentMem" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">AgentMem Studio</h1>
              <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Active Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">SQLite Hierarchical Memory & Entity Graph</p>
          </div>
        </div>

        {/* Live Metrics */}
        <div className="flex items-center gap-3 overflow-x-auto w-full md:w-auto py-1">
          {/* Namespace Dropdown */}
          <div className="bg-surface border border-sky-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <div>
              <div className="text-[10px] text-slate-400 font-mono">Namespace</div>
              <select
                value={currentNamespace}
                onChange={(e) => onNamespaceChange(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-sky-300 focus:outline-none cursor-pointer"
              >
                {namespaces.map((ns) => (
                  <option key={ns} value={ns} className="bg-slate-900 text-white font-mono">
                    {ns}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-surface border border-border px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
            <Database className="w-4 h-4 text-sky-400" />
            <div>
              <div className="text-[11px] text-slate-400 font-mono">Entities</div>
              <div className="text-sm font-semibold text-white font-mono">{stats?.entitiesCount ?? 0}</div>
            </div>
          </div>

          <div className="bg-surface border border-border px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
            <GitFork className="w-4 h-4 text-indigo-400" />
            <div>
              <div className="text-[11px] text-slate-400 font-mono">Relations</div>
              <div className="text-sm font-semibold text-white font-mono">{stats?.relationsCount ?? 0}</div>
            </div>
          </div>

          <div className="bg-surface border border-border px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <div>
              <div className="text-[11px] text-slate-400 font-mono">Episodes</div>
              <div className="text-sm font-semibold text-white font-mono">{stats?.episodesCount ?? 0}</div>
            </div>
          </div>

          <div className="bg-surface border border-border px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[11px] text-slate-400 font-mono">Avg Retention</div>
              <div className="text-sm font-semibold text-emerald-400 font-mono">
                {stats ? `${Math.round(stats.activeRetentionAvg * 100)}%` : '100%'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end md:self-auto relative">
          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-surface border border-border text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-1.5"
              title="Export Knowledge Graph"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Export
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-[#0d1527] border border-border rounded-xl shadow-xl p-1.5 z-50 flex flex-col gap-1">
                <button
                  onClick={() => downloadExport('json')}
                  className="px-3 py-1.5 text-xs text-left font-mono rounded hover:bg-slate-800 text-slate-200 flex items-center justify-between"
                >
                  <span>JSON Graph</span>
                  <span className="text-[10px] text-slate-400">.json</span>
                </button>
                <button
                  onClick={() => downloadExport('graphml')}
                  className="px-3 py-1.5 text-xs text-left font-mono rounded hover:bg-slate-800 text-slate-200 flex items-center justify-between"
                >
                  <span>GraphML (Gephi)</span>
                  <span className="text-[10px] text-slate-400">.graphml</span>
                </button>
                <button
                  onClick={() => downloadExport('cypher')}
                  className="px-3 py-1.5 text-xs text-left font-mono rounded hover:bg-slate-800 text-slate-200 flex items-center justify-between"
                >
                  <span>Cypher (Neo4j)</span>
                  <span className="text-[10px] text-slate-400">.cypher</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleConsolidate}
            disabled={isConsolidating}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-surface border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 hover:border-sky-500/50 transition-all flex items-center gap-2 disabled:opacity-50"
            title="Trigger Ebbinghaus decay scoring and noise pruning"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isConsolidating ? 'animate-spin text-sky-400' : ''}`} />
            {isConsolidating ? 'Consolidating...' : 'Consolidate'}
          </button>

          <button
            onClick={onOpenAddModal}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-medium transition-all flex items-center gap-1.5 shadow-md shadow-sky-500/20"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            New Memory
          </button>

          <button
            onClick={onRefresh}
            className="p-2 rounded-lg bg-surface border border-border text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Refresh Memory Metrics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
