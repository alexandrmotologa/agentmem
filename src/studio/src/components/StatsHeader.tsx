import React, { useState, useEffect, useRef } from 'react';
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
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/namespaces')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setNamespaces(data);
      })
      .catch((err) => console.error('Failed to load namespaces:', err));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

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

  const renderActionButtons = () => (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
      {/* Export Dropdown */}
      <div className="relative" ref={exportMenuRef}>
        <button
          onClick={() => setShowExportMenu(!showExportMenu)}
          className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-lg bg-surface border border-border text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 shadow-sm"
          title="Export Knowledge Graph"
        >
          <Download className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="whitespace-nowrap">Export</span>
        </button>

        {showExportMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-[#0d1527] border border-border rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-xl">
            <button
              onClick={() => downloadExport('json')}
              className="px-3 py-2 text-xs text-left font-mono rounded-lg hover:bg-slate-800 text-slate-200 flex items-center justify-between whitespace-nowrap"
            >
              <span>JSON Graph</span>
              <span className="text-[10px] text-slate-400 font-mono">.json</span>
            </button>
            <button
              onClick={() => downloadExport('graphml')}
              className="px-3 py-2 text-xs text-left font-mono rounded-lg hover:bg-slate-800 text-slate-200 flex items-center justify-between whitespace-nowrap"
            >
              <span>GraphML (Gephi)</span>
              <span className="text-[10px] text-slate-400 font-mono">.graphml</span>
            </button>
            <button
              onClick={() => downloadExport('cypher')}
              className="px-3 py-2 text-xs text-left font-mono rounded-lg hover:bg-slate-800 text-slate-200 flex items-center justify-between whitespace-nowrap"
            >
              <span>Cypher (Neo4j)</span>
              <span className="text-[10px] text-slate-400 font-mono">.cypher</span>
            </button>
          </div>
        )}
      </div>

      <button
        onClick={handleConsolidate}
        disabled={isConsolidating}
        className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-lg bg-surface border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 hover:border-sky-500/50 transition-all flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 whitespace-nowrap shrink-0 shadow-sm"
        title="Trigger Ebbinghaus decay scoring and noise pruning"
      >
        <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isConsolidating ? 'animate-spin text-sky-400' : ''}`} />
        <span className="whitespace-nowrap">{isConsolidating ? 'Consolidating...' : 'Consolidate'}</span>
      </button>

      <button
        onClick={onOpenAddModal}
        className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-medium transition-all flex items-center gap-1 sm:gap-1.5 shadow-md shadow-sky-500/20 whitespace-nowrap shrink-0"
      >
        <Plus className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
        <span className="whitespace-nowrap">New Memory</span>
      </button>

      <button
        onClick={onRefresh}
        className="p-1.5 sm:p-2 rounded-lg bg-surface border border-border text-slate-400 hover:text-white hover:bg-slate-800 transition-all shrink-0 shadow-sm"
        title="Refresh Memory Metrics"
      >
        <RefreshCw className="w-3.5 sm:w-4 h-3.5 sm:h-4 shrink-0" />
      </button>
    </div>
  );

  return (
    <header className="border-b border-border bg-[#0b1120]/90 backdrop-blur-md sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3.5">
      <div className="max-w-7xl mx-auto flex flex-col 2xl:flex-row items-stretch 2xl:items-center justify-between gap-3">
        {/* Row 1 on <2xl / Left section on 2xl: Brand and Actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-500/20 via-indigo-500/20 to-purple-500/20 border border-sky-500/30 flex items-center justify-center p-1.5 shadow-lg shadow-sky-500/10 shrink-0">
              <img src="/logo.svg" alt="AgentMem" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight whitespace-nowrap">
                  AgentMem Studio
                </h1>
                <span className="px-2 py-0.5 text-[10px] sm:text-[11px] font-mono font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                  <span className="whitespace-nowrap">Active Engine</span>
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-mono whitespace-nowrap hidden sm:block">
                SQLite Hierarchical Memory & Entity Graph
              </p>
            </div>
          </div>

          {/* Action Controls for screens < 2xl */}
          <div className="flex 2xl:hidden items-center gap-2 shrink-0">
            {renderActionButtons()}
          </div>
        </div>

        {/* Live Metrics Ribbon */}
        <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto scrollbar-none py-1 w-full 2xl:w-auto shrink min-w-0">
          {/* Namespace Dropdown */}
          <div className="bg-surface border border-sky-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2 shrink-0 shadow-sm">
            <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider leading-none mb-0.5 whitespace-nowrap">
                Namespace
              </div>
              <select
                value={currentNamespace}
                onChange={(e) => onNamespaceChange(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-sky-300 focus:outline-none cursor-pointer pr-1 leading-tight whitespace-nowrap"
              >
                {namespaces.map((ns) => (
                  <option key={ns} value={ns} className="bg-slate-900 text-white font-mono">
                    {ns}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Entities */}
          <div className="bg-surface border border-border px-3 py-1.5 rounded-lg flex items-center gap-2.5 shrink-0 shadow-sm">
            <Database className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider leading-none mb-0.5 whitespace-nowrap">
                Entities
              </div>
              <div className="text-xs sm:text-sm font-semibold text-white font-mono leading-tight whitespace-nowrap">
                {stats?.entitiesCount ?? 0}
              </div>
            </div>
          </div>

          {/* Relations */}
          <div className="bg-surface border border-border px-3 py-1.5 rounded-lg flex items-center gap-2.5 shrink-0 shadow-sm">
            <GitFork className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider leading-none mb-0.5 whitespace-nowrap">
                Relations
              </div>
              <div className="text-xs sm:text-sm font-semibold text-white font-mono leading-tight whitespace-nowrap">
                {stats?.relationsCount ?? 0}
              </div>
            </div>
          </div>

          {/* Episodes */}
          <div className="bg-surface border border-border px-3 py-1.5 rounded-lg flex items-center gap-2.5 shrink-0 shadow-sm">
            <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider leading-none mb-0.5 whitespace-nowrap">
                Episodes
              </div>
              <div className="text-xs sm:text-sm font-semibold text-white font-mono leading-tight whitespace-nowrap">
                {stats?.episodesCount ?? 0}
              </div>
            </div>
          </div>

          {/* Avg Retention */}
          <div className="bg-surface border border-border px-3 py-1.5 rounded-lg flex items-center gap-2.5 shrink-0 shadow-sm">
            <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider leading-none mb-0.5 whitespace-nowrap">
                Avg Retention
              </div>
              <div className="text-xs sm:text-sm font-semibold text-emerald-400 font-mono leading-tight whitespace-nowrap">
                {stats ? `${Math.round(stats.activeRetentionAvg * 100)}%` : '100%'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls for 2xl+ */}
        <div className="hidden 2xl:flex items-center gap-2 shrink-0">
          {renderActionButtons()}
        </div>
      </div>
    </header>
  );
};
