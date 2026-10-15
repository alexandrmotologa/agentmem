import React, { useState, useEffect, useCallback } from 'react';
import { StatsHeader } from './components/StatsHeader';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { RecallSimulator } from './components/RecallSimulator';
import { EpisodicTimeline } from './components/EpisodicTimeline';
import { MemoryEditorModal } from './components/MemoryEditorModal';
import { Network, Terminal, Clock, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'GRAPH' | 'SIMULATOR' | 'TIMELINE'>('GRAPH');
  const [stats, setStats] = useState<any | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsRes, graphRes, episodesRes] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/graph').then((r) => r.json()),
        fetch('/api/episodes').then((r) => r.json()),
      ]);
      setStats(statsRes);
      setGraphData(graphRes);
      setEpisodes(episodesRes);
    } catch (err) {
      console.error('Failed to fetch memory data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConsolidate = async () => {
    try {
      const res = await fetch('/api/consolidate', { method: 'POST' }).then((r) => r.json());
      await fetchData();
      alert(`Consolidation cycle completed in ${res.durationMs}ms!\nScored ${res.entitiesScored} entities, deduplicated ${res.deduplicatedCount}.`);
    } catch (err) {
      console.error('Failed to run consolidation:', err);
    }
  };

  const handleQuery = async (params: any) => {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col">
      {/* Top Header */}
      <StatsHeader
        stats={stats}
        onRefresh={fetchData}
        onOpenAddModal={() => setIsModalOpen(true)}
        onConsolidate={handleConsolidate}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-border/80 pb-4">
          <div className="flex items-center gap-2 bg-surface p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab('GRAPH')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'GRAPH'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              Interactive Graph Canvas
            </button>

            <button
              onClick={() => setActiveTab('SIMULATOR')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'SIMULATOR'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Recall Simulator
            </button>

            <button
              onClick={() => setActiveTab('TIMELINE')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'TIMELINE'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Episodic Timeline
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
              Syncing...
            </div>
          )}
        </div>

        {/* Tab Viewport */}
        <div className="flex-1">
          {activeTab === 'GRAPH' && (
            <KnowledgeGraph
              nodes={graphData.nodes}
              edges={graphData.edges}
              onRefresh={fetchData}
            />
          )}

          {activeTab === 'SIMULATOR' && (
            <RecallSimulator onQuery={handleQuery} />
          )}

          {activeTab === 'TIMELINE' && (
            <EpisodicTimeline episodes={episodes} />
          )}
        </div>
      </main>

      {/* Memory Editor Modal */}
      <MemoryEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        existingEntities={graphData.nodes.map((n) => ({ id: n.id, name: n.name, type: n.type }))}
        onCreated={fetchData}
      />
    </div>
  );
};
