import React, { useState } from 'react';
import { Search, Sliders, Copy, Check, Sparkles, Terminal, FileCode, Cpu, Layers } from 'lucide-react';

interface RecallSimulatorProps {
  onQuery: (params: {
    query: string;
    topK: number;
    maxTokens: number;
    weights: { vector: number; bm25: number; graph: number };
  }) => Promise<any>;
}

export const RecallSimulator: React.FC<RecallSimulatorProps> = ({ onQuery }) => {
  const [query, setQuery] = useState('What database rules and constraints do we follow?');
  const [topK, setTopK] = useState(5);
  const [maxTokens, setMaxTokens] = useState(500);
  const [wVec, setWVec] = useState(0.45);
  const [wBM25, setWBM25] = useState(0.35);
  const [wGraph, setWGraph] = useState(0.20);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const presets = [
    'What database rules and constraints do we follow?',
    'What is our frontend framework and styling stack?',
    'What does the user prefer for backend services?',
    'What cloud infrastructure is the project deployed on?',
  ];

  const handleRunQuery = async (customQuery?: string) => {
    const q = customQuery ?? query;
    if (!q.trim()) return;
    setIsLoading(true);
    try {
      const res = await onQuery({
        query: q,
        topK,
        maxTokens,
        weights: { vector: wVec, bm25: wBM25, graph: wGraph },
      });
      setResult(res);
    } catch (err) {
      console.error('Recall error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.systemPromptSnippet) {
      navigator.clipboard.writeText(result.systemPromptSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full bg-[#070b14] rounded-2xl border border-border p-6 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <Terminal className="w-4 h-4 text-sky-400" />
          Hybrid Recall Simulator & Prompt Synthesizer
        </h2>
        <p className="text-xs text-slate-400 font-mono mt-0.5">
          Simulate runtime memory retrieval blending dense Vector cosine, SQLite FTS5 BM25, and Graph adjacency
        </p>
      </div>

      {/* Query Bar & Presets */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunQuery()}
              placeholder="Enter agent query or user prompt..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-sans shadow-inner"
            />
          </div>
          <button
            onClick={() => handleRunQuery()}
            disabled={isLoading}
            className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-sky-500/20 disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Recalling...' : 'Simulate Recall'}
          </button>
        </div>

        {/* Preset Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono text-slate-500">Presets:</span>
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuery(preset);
                handleRunQuery(preset);
              }}
              className="px-2.5 py-1 text-xs rounded-lg bg-surface border border-border/80 text-slate-400 hover:text-white hover:border-slate-600 transition-all font-mono"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Parameter Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 p-4 rounded-xl bg-surface border border-border/70 text-xs">
        <div>
          <div className="flex justify-between text-slate-400 font-mono mb-1">
            <span>Top-K:</span>
            <span className="text-white font-semibold">{topK}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="w-full accent-sky-400"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-400 font-mono mb-1">
            <span>Max Tokens:</span>
            <span className="text-white font-semibold">{maxTokens}</span>
          </div>
          <input
            type="range"
            min="100"
            max="1500"
            step="50"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            className="w-full accent-sky-400"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-400 font-mono mb-1">
            <span>Vector Weight:</span>
            <span className="text-sky-400 font-semibold">{wVec.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={wVec}
            onChange={(e) => setWVec(Number(e.target.value))}
            className="w-full accent-sky-400"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-400 font-mono mb-1">
            <span>BM25 Weight:</span>
            <span className="text-indigo-400 font-semibold">{wBM25.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={wBM25}
            onChange={(e) => setWBM25(Number(e.target.value))}
            className="w-full accent-indigo-400"
          />
        </div>

        <div>
          <div className="flex justify-between text-slate-400 font-mono mb-1">
            <span>Graph Weight:</span>
            <span className="text-purple-400 font-semibold">{wGraph.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={wGraph}
            onChange={(e) => setWGraph(Number(e.target.value))}
            className="w-full accent-purple-400"
          />
        </div>
      </div>

      {/* Results View */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Ranked Breakdown Table */}
          <div className="lg:col-span-6 flex flex-col gap-3">
            <h3 className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Recalled Entities ({result.details?.length || 0})</span>
              <span className="text-[11px] text-slate-500 font-normal">Score Breakdown</span>
            </h3>

            <div className="space-y-2.5 overflow-y-auto max-h-[420px] pr-1">
              {result.details?.map((mem: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-surface border border-border/80 flex flex-col gap-2 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-sky-400 border border-border">
                        {mem.entity.entityType}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-1">{mem.entity.name}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {mem.totalRelevanceScore?.toFixed(3)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 block">Total Score</span>
                    </div>
                  </div>

                  {/* Connected Relations */}
                  {mem.connectedRelations?.length > 0 && (
                    <div className="text-[11px] font-mono text-slate-400 flex flex-wrap gap-1 mt-1">
                      {mem.connectedRelations.map((r: any, rIdx: number) => (
                        <span key={rIdx} className="px-2 py-0.5 rounded bg-slate-900 border border-border text-slate-300">
                          {r.relation} ➔ {r.targetName}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Micro metric pills */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-border/50 text-[10px] font-mono text-slate-400">
                    <div>
                      Vec: <span className="text-sky-300 font-semibold">{mem.scores?.vectorScore?.toFixed(2)}</span>
                    </div>
                    <div>
                      BM25: <span className="text-indigo-300 font-semibold">{mem.scores?.bm25Score?.toFixed(2)}</span>
                    </div>
                    <div>
                      Graph: <span className="text-purple-300 font-semibold">{mem.scores?.graphScore?.toFixed(2)}</span>
                    </div>
                    <div>
                      Ret: <span className="text-emerald-300 font-semibold">{Math.round((mem.entity?.decayRetention || 1) * 100)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Injected Prompt Block */}
          <div className="lg:col-span-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                Prompt Injection Snippet
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-border">
                  ~{result.tokenCount} tokens
                </span>
                <button
                  onClick={handleCopy}
                  className="px-2.5 py-1 text-xs font-mono rounded-lg bg-surface border border-border hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 transition-all"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <pre className="flex-1 p-4 rounded-xl bg-[#030712] border border-border text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[420px]">
              {result.systemPromptSnippet}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
