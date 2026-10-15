import React, { useState } from 'react';
import { FileText, ArrowRight, CheckCircle2, AlertCircle, Sparkles, Code2 } from 'lucide-react';

interface IngestionPlaygroundProps {
  currentNamespace: string;
  onIngestSuccess: () => void;
}

export const IngestionPlayground: React.FC<IngestionPlaygroundProps> = ({
  currentNamespace,
  onIngestSuccess,
}) => {
  const [mode, setMode] = useState<'DOCUMENT' | 'CONVERSATION'>('DOCUMENT');
  const [projectName, setProjectName] = useState('AgentMem');
  const [content, setContent] = useState<string>(
`# AgentMem Architecture Spec

AgentMem is an autonomous memory engine for AI agents written in TypeScript.
The storage layer uses SQLite with FTS5 and vector embeddings.
The web studio runs on port 50094.
The user prefers dark mode and concise responses.
The project requires Node 22 and uses React 19 for visualization.`
  );

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleIngest = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      if (mode === 'DOCUMENT') {
        const res = await fetch('/api/ingest-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            projectName,
            namespace: currentNamespace,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to ingest document');
        }

        const data = await res.json();
        setResult(data);
        onIngestSuccess();
      } else {
        // Conversation mode
        let parsedTurns: any[];
        try {
          parsedTurns = JSON.parse(content);
        } catch {
          // If not raw JSON, split lines into turns
          parsedTurns = content
            .split('\n')
            .filter((l) => l.trim())
            .map((line, idx) => ({
              role: idx % 2 === 0 ? 'user' : 'assistant',
              content: line.trim(),
            }));
        }

        const res = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: `playground_${Date.now()}`,
            turns: parsedTurns,
            namespace: currentNamespace,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to ingest dialogue');
        }

        const data = await res.json();
        setResult({
          type: 'episode',
          summary: data.summary,
          sessionId: data.sessionId,
          turnsCount: parsedTurns.length,
        });
        onIngestSuccess();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-220px)]">
      {/* Editor Column */}
      <div className="flex-1 flex flex-col bg-surface border border-border rounded-xl p-5 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('DOCUMENT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                mode === 'DOCUMENT'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Markdown Spec / Doc
            </button>
            <button
              onClick={() => setMode('CONVERSATION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                mode === 'CONVERSATION'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Dialogue Trace / JSON
            </button>
          </div>

          {mode === 'DOCUMENT' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Project:</span>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="bg-slate-900 border border-border px-2.5 py-1 rounded text-xs text-white font-mono focus:outline-none focus:border-sky-500 w-32"
                placeholder="Project Name"
              />
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col mb-4">
          <label className="text-xs font-mono text-slate-400 mb-2">
            {mode === 'DOCUMENT'
              ? 'Paste Markdown document, PRD, or technical specification:'
              : 'Paste JSON conversation turns array or line-separated chat dialogue:'}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 w-full bg-[#0a0f1d] border border-border/80 rounded-lg p-3 text-xs font-mono text-slate-200 resize-none focus:outline-none focus:border-sky-500 leading-relaxed"
            placeholder="Type or paste content here..."
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs font-mono text-slate-400">
            Target Namespace: <span className="text-sky-400 font-semibold">{currentNamespace}</span>
          </div>

          <button
            onClick={handleIngest}
            disabled={isLoading || !content.trim()}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 shadow-md shadow-sky-500/20"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Extracting Facts...' : 'Ingest & Extract Facts'}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Output / Results Column */}
      <div className="w-full lg:w-96 flex flex-col bg-surface border border-border rounded-xl p-5 shadow-lg shadow-black/20">
        <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 pb-3 border-b border-border mb-4">
          Extraction Output
        </h3>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Ingestion Failed</div>
              <div className="font-mono text-[11px] mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {result && (
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold">Successfully Ingested & Vectorized!</span>
            </div>

            {result.type === 'episode' ? (
              <div className="flex flex-col gap-2 bg-slate-900/60 p-3 rounded-lg border border-border">
                <div className="text-[11px] font-mono text-slate-400">Session ID:</div>
                <div className="text-xs font-mono text-sky-400 font-semibold">{result.sessionId}</div>
                <div className="text-[11px] font-mono text-slate-400 mt-2">Episodic Summary:</div>
                <div className="text-xs text-slate-200 leading-relaxed">{result.summary}</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-900/60 rounded-lg border border-border">
                  <div className="text-[11px] text-slate-400 font-mono">Sections</div>
                  <div className="text-base font-bold text-white font-mono mt-0.5">
                    {result.sectionsProcessed}
                  </div>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-lg border border-border">
                  <div className="text-[11px] text-slate-400 font-mono">Entities</div>
                  <div className="text-base font-bold text-sky-400 font-mono mt-0.5">
                    {result.entitiesCreated}
                  </div>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-lg border border-border">
                  <div className="text-[11px] text-slate-400 font-mono">Relations</div>
                  <div className="text-base font-bold text-indigo-400 font-mono mt-0.5">
                    {result.relationsCreated}
                  </div>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-lg border border-border">
                  <div className="text-[11px] text-slate-400 font-mono">Duration</div>
                  <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                    {result.durationMs}ms
                  </div>
                </div>
              </div>
            )}

            <div className="text-[11px] font-mono text-slate-400 leading-relaxed bg-slate-900/40 p-3 rounded-lg border border-border/50">
              💡 Entities and relations have been added to the knowledge graph and are immediately visible in the <span className="text-sky-300">Interactive Graph Canvas</span> and searchable via <span className="text-sky-300">Recall Simulator</span>.
            </div>
          </div>
        )}

        {!result && !error && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs font-mono">
            <FileText className="w-8 h-8 stroke-[1.5] mb-2 text-slate-600" />
            Paste a specification or conversation trace and click Ingest to see extracted knowledge graph entities.
          </div>
        )}
      </div>
    </div>
  );
};
