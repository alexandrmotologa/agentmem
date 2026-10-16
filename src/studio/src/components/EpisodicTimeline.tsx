import React, { useState } from 'react';
import { Clock, CheckCircle2, ChevronDown, ChevronRight, MessageSquare, Search } from 'lucide-react';

interface EpisodeItem {
  id: string;
  sessionId: string;
  summary: string;
  rawTurns: Array<{ role: string; content: string }>;
  importance: number;
  outcome: string;
  createdAt: number;
}

interface EpisodicTimelineProps {
  episodes: EpisodeItem[];
}

export const EpisodicTimeline: React.FC<EpisodicTimelineProps> = ({ episodes }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = episodes.filter(
    (ep) =>
      ep.sessionId.toLowerCase().includes(search.toLowerCase()) ||
      ep.summary.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full bg-[#070b14] rounded-2xl border border-border p-6 flex flex-col gap-6">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Episodic Memory Stream
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Chronological milestone summaries distilled from multi-turn dialogues
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
          />
        </div>
      </div>

      {/* Episode Cards Feed */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-500 font-mono text-xs">
          No episodic memory sessions recorded yet.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((ep) => {
            const isExpanded = expandedId === ep.id;
            const dateStr = new Date(ep.createdAt).toLocaleString();

            return (
              <div
                key={ep.id}
                className="bg-surface border border-border rounded-xl p-5 hover:border-slate-600 transition-all shadow-md"
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-white whitespace-nowrap">
                          Session: {ep.sessionId}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-border whitespace-nowrap">
                          {dateStr}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                          {ep.outcome}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 mt-2 leading-relaxed">{ep.summary}</p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                    <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
                      Importance: <strong className="text-white">{(ep.importance * 100).toFixed(0)}%</strong>
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : ep.id)}
                      className="px-2.5 py-1 text-xs font-mono text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>{ep.rawTurns.length} turns</span>
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Conversation Turns */}
                {isExpanded && ep.rawTurns.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/70 space-y-2.5">
                    <span className="text-[11px] font-mono text-slate-400 block mb-2">
                      Original Conversation Dialogue:
                    </span>
                    {ep.rawTurns.map((turn, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg text-xs leading-relaxed ${
                          turn.role === 'user'
                            ? 'bg-sky-500/5 border border-sky-500/20 text-sky-100'
                            : 'bg-slate-900 border border-border text-slate-300'
                        }`}
                      >
                        <span
                          className={`font-mono font-semibold uppercase text-[10px] block mb-1 ${
                            turn.role === 'user' ? 'text-sky-400' : 'text-indigo-400'
                          }`}
                        >
                          {turn.role}
                        </span>
                        {turn.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
