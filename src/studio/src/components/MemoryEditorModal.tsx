import React, { useState } from 'react';
import { X, Plus, Database, GitFork } from 'lucide-react';

interface MemoryEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingEntities: Array<{ id: string; name: string; type: string }>;
  onCreated: () => void;
  currentNamespace?: string;
}

export const MemoryEditorModal: React.FC<MemoryEditorModalProps> = ({
  isOpen,
  onClose,
  existingEntities,
  onCreated,
  currentNamespace = 'default',
}) => {
  const [activeTab, setActiveTab] = useState<'ENTITY' | 'RELATION'>('ENTITY');

  // Entity Form State
  const [entityName, setEntityName] = useState('');
  const [entityType, setEntityType] = useState('TECHNOLOGY');
  const [importance, setImportance] = useState(0.8);
  const [propertiesJson, setPropertiesJson] = useState('{}');

  // Relation Form State
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [relationType, setRelationType] = useState('USES');
  const [confidence, setConfidence] = useState(1.0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityName.trim()) return;

    let props = {};
    try {
      props = JSON.parse(propertiesJson);
    } catch {
      setError('Invalid JSON in properties field');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: entityName.trim(),
          entityType,
          importanceScore: importance,
          properties: props,
          namespace: currentNamespace,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as any;
        throw new Error(data.error || 'Failed to create entity');
      }

      setEntityName('');
      setPropertiesJson('{}');
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !targetId) {
      setError('Please select both source and target entities');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          relationType,
          confidence,
          namespace: currentNamespace,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as any;
        throw new Error(data.error || 'Failed to create relation');
      }

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-surface border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white whitespace-nowrap">Manual Memory Editor</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-border bg-[#0b1120] shrink-0">
          <button
            onClick={() => setActiveTab('ENTITY')}
            className={`flex-1 py-2.5 sm:py-3 text-xs font-mono font-medium flex items-center justify-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'ENTITY'
                ? 'border-sky-500 text-sky-400 bg-sky-500/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Add Entity Node</span>
          </button>
          <button
            onClick={() => setActiveTab('RELATION')}
            className={`flex-1 py-2.5 sm:py-3 text-xs font-mono font-medium flex items-center justify-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'RELATION'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Link Relation Edge</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="m-3 sm:m-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs shrink-0">
            {error}
          </div>
        )}

        {/* Entity Form */}
        {activeTab === 'ENTITY' ? (
          <form onSubmit={handleCreateEntity} className="overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
            <div>
              <label className="text-slate-400 font-mono block mb-1.5">Entity Name *</label>
              <input
                type="text"
                required
                value={entityName}
                onChange={(e) => setEntityName(e.target.value)}
                placeholder="e.g. PostgreSQL, React 19, Strict Pure SQL"
                className="w-full px-3 py-2 bg-[#070b14] border border-border rounded-xl text-white focus:outline-none focus:border-sky-500 font-sans"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 font-mono block mb-1.5">Entity Type</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#070b14] border border-border rounded-xl text-white focus:outline-none focus:border-sky-500 font-mono"
                >
                  <option value="TECHNOLOGY">TECHNOLOGY</option>
                  <option value="CONSTRAINT">CONSTRAINT</option>
                  <option value="PREFERENCE">PREFERENCE</option>
                  <option value="PROJECT">PROJECT</option>
                  <option value="PERSON">PERSON</option>
                  <option value="CONCEPT">CONCEPT</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-mono block mb-1.5">
                  Importance: <span className="text-sky-400 font-semibold">{importance.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={importance}
                  onChange={(e) => setImportance(Number(e.target.value))}
                  className="w-full mt-2 accent-sky-400"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 font-mono block mb-1.5">Properties (JSON)</label>
              <textarea
                rows={3}
                value={propertiesJson}
                onChange={(e) => setPropertiesJson(e.target.value)}
                className="w-full px-3 py-2 bg-[#070b14] border border-border rounded-xl text-white focus:outline-none focus:border-sky-500 font-mono text-[11px]"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-mono whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold font-mono disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isSubmitting ? 'Creating...' : 'Create Entity'}
              </button>
            </div>
          </form>
        ) : (
          /* Relation Form */
          <form onSubmit={handleCreateRelation} className="overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
            <div>
              <label className="text-slate-400 font-mono block mb-1.5">Source Entity *</label>
              <select
                required
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full px-3 py-2 bg-[#070b14] border border-border rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="">Select source entity...</option>
                {existingEntities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name} ({ent.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 font-mono block mb-1.5">Relation Type</label>
                <select
                  value={relationType}
                  onChange={(e) => setRelationType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#070b14] border border-border rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
                >
                  <option value="USES">USES</option>
                  <option value="PREFERS">PREFERS</option>
                  <option value="DEPLOYED_ON">DEPLOYED_ON</option>
                  <option value="REQUIRES">REQUIRES</option>
                  <option value="RESTRICTS">RESTRICTS</option>
                  <option value="SUPERSEDES">SUPERSEDES</option>
                  <option value="DEPENDS_ON">DEPENDS_ON</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-mono block mb-1.5">Confidence ({confidence.toFixed(2)})</label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={confidence}
                  onChange={(e) => setConfidence(Number(e.target.value))}
                  className="w-full mt-2 accent-indigo-400"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 font-mono block mb-1.5">Target Entity *</label>
              <select
                required
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-3 py-2 bg-[#070b14] border border-border rounded-xl text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="">Select target entity...</option>
                {existingEntities
                  .filter((e) => e.id !== sourceId)
                  .map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} ({ent.type})
                    </option>
                  ))}
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-mono whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold font-mono disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isSubmitting ? 'Linking...' : 'Link Relation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
