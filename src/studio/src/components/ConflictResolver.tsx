import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Check, Trash2, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';

interface ConflictItem {
  id: string;
  sourceEntityId: string;
  sourceEntityName: string;
  targetEntityId: string;
  targetEntityName: string;
  relationType: string;
  supersededBy?: string | null;
  validUntil?: number | null;
  confidence: number;
  createdAt: number;
  namespace: string;
}

interface ConflictResolverProps {
  currentNamespace: string;
  onResolved: () => void;
}

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  currentNamespace,
  onResolved,
}) => {
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchConflicts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/conflicts?namespace=${encodeURIComponent(currentNamespace)}`);
      const data = await res.json();
      setConflicts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load conflicts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentNamespace]);

  useEffect(() => {
    fetchConflicts();
  }, [fetchConflicts]);

  const handleResolve = async (
    conflictId: string,
    action: 'KEEP_OLD' | 'KEEP_NEW' | 'DELETE_BOTH'
  ) => {
    setActionInProgress(conflictId);
    try {
      const res = await fetch('/api/conflicts/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: conflictId, action }),
      });
      if (res.ok) {
        await fetchConflicts();
        onResolved();
      }
    } catch (err) {
      console.error('Failed to resolve conflict:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="flex flex-col bg-surface border border-border rounded-xl p-6 shadow-lg shadow-black/20 min-h-[500px]">
      <div className="flex items-center justify-between pb-4 border-b border-border mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              Contradiction & Conflict Resolver
            </h2>
            <span className="px-2 py-0.5 text-xs font-mono rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
              {conflicts.length} Contradictions Detected
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Review and resolve temporal contradictions where preferences or facts were superseded.
          </p>
        </div>

        <button
          onClick={fetchConflicts}
          className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-mono text-slate-300 hover:text-white border border-border transition-all flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-xs font-mono">
          Scanning for contradiction edges...
        </div>
      ) : conflicts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-white">No Semantic Contradictions</h3>
          <p className="text-xs text-slate-400 font-mono mt-1 max-w-sm">
            All stored relationships in namespace &apos;{currentNamespace}&apos; are consistent with zero unhandled superseded edges.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto max-h-[600px] pr-2">
          {conflicts.map((item) => (
            <div
              key={item.id}
              className="bg-[#0b1120] border border-amber-500/30 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-white">{item.sourceEntityName}</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.relationType}
                    </span>
                    <span className="font-semibold text-sm text-slate-300 line-through opacity-80">
                      {item.targetEntityName}
                    </span>
                    <span className="text-[11px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                      Superseded / Inactive
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-slate-400">
                    <span>Edge ID: {item.id.slice(0, 8)}...</span>
                    <span>•</span>
                    <span>Confidence: {item.confidence.toFixed(2)}</span>
                    <span>•</span>
                    <span>Namespace: {item.namespace}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                <button
                  onClick={() => handleResolve(item.id, 'KEEP_OLD')}
                  disabled={actionInProgress === item.id}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-border text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="Re-activate this old relation and un-supersede it"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                  Restore Old
                </button>

                <button
                  onClick={() => handleResolve(item.id, 'KEEP_NEW')}
                  disabled={actionInProgress === item.id}
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50"
                  title="Delete old relation permanently and keep newer fact"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Keep New
                </button>

                <button
                  onClick={() => handleResolve(item.id, 'DELETE_BOTH')}
                  disabled={actionInProgress === item.id}
                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-all disabled:opacity-50"
                  title="Delete both contradicting relations"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
