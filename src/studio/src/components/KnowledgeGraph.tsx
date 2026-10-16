import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Filter, Search, X, ShieldAlert, Cpu, User, FolderKanban, Heart, HelpCircle, Layers } from 'lucide-react';

interface GraphNode {
  id: string;
  name: string;
  type: string;
  importance: number;
  accessCount: number;
  retention: number;
  properties: Record<string, unknown>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  confidence: number;
  superseded: boolean;
}

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onRefresh: () => void;
}

const TYPE_COLORS: Record<string, { fill: string; stroke: string; glow: string }> = {
  PERSON: { fill: '#d97706', stroke: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
  PROJECT: { fill: '#2563eb', stroke: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)' },
  TECHNOLOGY: { fill: '#0891b2', stroke: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)' },
  PREFERENCE: { fill: '#9333ea', stroke: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
  CONSTRAINT: { fill: '#e11d48', stroke: '#f43f5e', glow: 'rgba(244, 63, 94, 0.4)' },
  CONCEPT: { fill: '#475569', stroke: '#64748b', glow: 'rgba(100, 116, 139, 0.4)' },
};

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ nodes, edges }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Viewport transforms
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);

  // Simulation nodes with physics coordinates
  const simNodesRef = useRef<GraphNode[]>([]);

  // Synchronize incoming nodes into simulation state
  useEffect(() => {
    const existingMap = new Map(simNodesRef.current.map((n) => [n.id, n]));
    const width = canvasRef.current?.width || 800;
    const height = canvasRef.current?.height || 600;

    simNodesRef.current = nodes.map((node) => {
      const prev = existingMap.get(node.id);
      const radius = Math.max(14, Math.min(30, 12 + node.importance * 12 + Math.min(node.accessCount * 1.5, 8)));
      return {
        ...node,
        radius,
        x: Number.isFinite(prev?.x) ? prev!.x : (width / 2 + (Math.random() - 0.5) * Math.min(width * 0.6, 350)),
        y: Number.isFinite(prev?.y) ? prev!.y : (height / 2 + (Math.random() - 0.5) * Math.min(height * 0.6, 350)),
        vx: Number.isFinite(prev?.vx) ? prev!.vx : 0,
        vy: Number.isFinite(prev?.vy) ? prev!.vy : 0,
      };
    });
  }, [nodes]);

  // Main force-directed physics animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const handleResize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight || 650;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const stepPhysics = () => {
      const simNodes = simNodesRef.current;
      const width = canvas.width;
      const height = canvas.height;

      // Filter active nodes for calculation
      const visibleNodes = simNodes.filter(
        (n) => selectedType === 'ALL' || n.type === selectedType
      );
      const visibleMap = new Map(visibleNodes.map((n) => [n.id, n]));

      // 1. Node Repulsion
      for (let i = 0; i < visibleNodes.length; i++) {
        for (let j = i + 1; j < visibleNodes.length; j++) {
          const a = visibleNodes[i];
          const b = visibleNodes[j];
          const dx = (b.x || 0) - (a.x || 0);
          const dy = (b.y || 0) - (a.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 280) {
            const force = 1800 / (dist * dist + 150);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (a !== draggedNodeRef.current) {
              a.vx = (a.vx || 0) - fx;
              a.vy = (a.vy || 0) - fy;
            }
            if (b !== draggedNodeRef.current) {
              b.vx = (b.vx || 0) + fx;
              b.vy = (b.vy || 0) + fy;
            }
          }
        }
      }

      // 2. Edge Attraction
      const restLength = 90;
      for (const edge of edges) {
        const source = visibleMap.get(edge.source);
        const target = visibleMap.get(edge.target);
        if (source && target) {
          const dx = (target.x || 0) - (source.x || 0);
          const dy = (target.y || 0) - (source.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const displacement = dist - restLength;
          const force = displacement * 0.02;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (source !== draggedNodeRef.current) {
            source.vx = (source.vx || 0) + fx;
            source.vy = (source.vy || 0) + fy;
          }
          if (target !== draggedNodeRef.current) {
            target.vx = (target.vx || 0) - fx;
            target.vy = (target.vy || 0) - fy;
          }
        }
      }

      // 3. Center Gravity & Velocity Damping & Bounds
      const centerX = width / 2;
      const centerY = height / 2;

      for (const node of visibleNodes) {
        if (node === draggedNodeRef.current) continue;

        const cdx = centerX - (node.x || centerX);
        const cdy = centerY - (node.y || centerY);
        node.vx = (node.vx || 0) * 0.8 + cdx * 0.004;
        node.vy = (node.vy || 0) * 0.8 + cdy * 0.004;

        // Clamp speed
        const speed = Math.sqrt((node.vx || 0) ** 2 + (node.vy || 0) ** 2);
        if (speed > 10) {
          node.vx = ((node.vx || 0) / speed) * 10;
          node.vy = ((node.vy || 0) / speed) * 10;
        }

        const nextX = (node.x || centerX) + (node.vx || 0);
        const nextY = (node.y || centerY) + (node.vy || 0);

        // Keep inside bounds
        node.x = Math.max(35, Math.min(width - 35, Number.isFinite(nextX) ? nextX : centerX));
        node.y = Math.max(35, Math.min(height - 35, Number.isFinite(nextY) ? nextY : centerY));
      }

      // 4. Render
      ctx.clearRect(0, 0, width, height);

      // Background grid dots
      ctx.save();
      const transform = transformRef.current;
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);

      // Draw Edges
      for (const edge of edges) {
        const source = visibleMap.get(edge.source);
        const target = visibleMap.get(edge.target);
        if (!source || !target) continue;

        ctx.beginPath();
        ctx.moveTo(source.x || 0, source.y || 0);
        ctx.lineTo(target.x || 0, target.y || 0);

        if (edge.superseded) {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
          ctx.lineWidth = 1;
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Edge label
        const midX = ((source.x || 0) + (target.x || 0)) / 2;
        const midY = ((source.y || 0) + (target.y || 0)) / 2;
        ctx.fillStyle = edge.superseded ? '#f87171' : '#94a3b8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(edge.label, midX, midY - 6);
      }

      // Draw Nodes
      for (const node of visibleNodes) {
        const isMatched = !searchQuery || node.name.toLowerCase().includes(searchQuery.toLowerCase());
        const isSelected = selectedNode?.id === node.id;
        const color = TYPE_COLORS[node.type] || TYPE_COLORS.CONCEPT;
        const r = node.radius || 18;

        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x || 0, node.y || 0, r, 0, Math.PI * 2);

        // Glow halo
        if (isSelected || isMatched) {
          ctx.shadowColor = color.stroke;
          ctx.shadowBlur = isSelected ? 20 : 10;
        }

        ctx.fillStyle = isMatched ? color.fill : 'rgba(30, 41, 59, 0.5)';
        ctx.fill();

        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.strokeStyle = isSelected ? '#ffffff' : color.stroke;
        ctx.stroke();
        ctx.restore();

        // Node title
        ctx.fillStyle = isMatched ? '#f8fafc' : '#64748b';
        ctx.font = `${isSelected ? 'bold ' : ''}11px Plus Jakarta Sans, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.name, node.x || 0, (node.y || 0) + r + 4);

        // Retention badge below title
        if (node.retention < 0.9) {
          ctx.fillStyle = node.retention > 0.4 ? '#fbbf24' : '#f87171';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillText(`ret: ${Math.round(node.retention * 100)}%`, node.x || 0, (node.y || 0) + r + 18);
        }
      }

      ctx.restore();

      animId = requestAnimationFrame(stepPhysics);
    };

    animId = requestAnimationFrame(stepPhysics);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [edges, selectedType, searchQuery, selectedNode]);

  // Mouse & touch interaction handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const transform = transformRef.current;
    const worldX = (clientX - transform.x) / transform.scale;
    const worldY = (clientY - transform.y) / transform.scale;

    // Check if clicked a node
    const clicked = simNodesRef.current.find((n) => {
      if (selectedType !== 'ALL' && n.type !== selectedType) return false;
      const dx = (n.x || 0) - worldX;
      const dy = (n.y || 0) - worldY;
      return Math.sqrt(dx * dx + dy * dy) <= (n.radius || 18);
    });

    if (clicked) {
      draggedNodeRef.current = clicked;
      setSelectedNode(clicked);
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: clientX - transform.x, y: clientY - transform.y };
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      const transform = transformRef.current;
      draggedNodeRef.current.x = (clientX - transform.x) / transform.scale;
      draggedNodeRef.current.y = (clientY - transform.y) / transform.scale;
    } else if (isDraggingCanvasRef.current) {
      transformRef.current.x = clientX - dragStartRef.current.x;
      transformRef.current.y = clientY - dragStartRef.current.y;
    }
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(3, transformRef.current.scale * delta));
    transformRef.current.scale = newScale;
  };

  const resetView = () => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
  };

  const connectedRelations = useMemo(() => {
    if (!selectedNode) return [];
    return edges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id
    );
  }, [selectedNode, edges]);

  return (
    <div className="relative w-full min-h-[500px] h-[calc(100vh-220px)] max-h-[850px] bg-[#070b14] rounded-2xl border border-border overflow-hidden flex flex-col">
      {/* Top Controls Toolbar */}
      <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4 z-10 flex flex-wrap items-center justify-between gap-2.5 pointer-events-none">
        {/* Type Filter Pills */}
        <div className="flex items-center gap-1 bg-surface/90 backdrop-blur-md p-1 sm:p-1.5 rounded-xl border border-border shadow-lg pointer-events-auto overflow-x-auto max-w-full scrollbar-none shrink-0">
          {['ALL', 'TECHNOLOGY', 'CONSTRAINT', 'PREFERENCE', 'PROJECT', 'PERSON'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-mono font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
                selectedType === type
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Search & Zoom Toolbar */}
        <div className="flex items-center gap-2 pointer-events-auto shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-surface/90 backdrop-blur-md border border-border rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono w-32 sm:w-48 focus:w-44 sm:focus:w-56 transition-all shadow-lg"
            />
          </div>

          <div className="flex items-center bg-surface/90 backdrop-blur-md border border-border rounded-xl p-1 shadow-lg shrink-0">
            <button
              onClick={() => (transformRef.current.scale = Math.min(3, transformRef.current.scale * 1.2))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => (transformRef.current.scale = Math.max(0.3, transformRef.current.scale * 0.8))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={resetView}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Node Inspector Drawer */}
      {selectedNode && (
        <div className="absolute right-3 sm:right-4 top-16 sm:top-20 bottom-14 sm:bottom-4 w-[calc(100%-1.5rem)] sm:w-80 max-w-sm bg-surface/95 backdrop-blur-md border border-border rounded-2xl p-4 sm:p-5 shadow-2xl overflow-y-auto z-20 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <span
                className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md uppercase"
                style={{
                  backgroundColor: TYPE_COLORS[selectedNode.type]?.fill + '25',
                  color: TYPE_COLORS[selectedNode.type]?.stroke,
                  border: `1px solid ${TYPE_COLORS[selectedNode.type]?.stroke}40`,
                }}
              >
                {selectedNode.type}
              </span>
              <h3 className="text-base font-bold text-white mt-1.5 break-words">{selectedNode.name}</h3>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3.5 text-xs">
            {/* Importance Bar */}
            <div>
              <div className="flex justify-between text-slate-400 font-mono mb-1">
                <span>Importance Score</span>
                <span className="text-white font-semibold">{(selectedNode.importance * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full"
                  style={{ width: `${selectedNode.importance * 100}%` }}
                />
              </div>
            </div>

            {/* Decay Retention Bar */}
            <div>
              <div className="flex justify-between text-slate-400 font-mono mb-1">
                <span>Decay Retention</span>
                <span className={selectedNode.retention > 0.5 ? 'text-emerald-400' : 'text-rose-400'}>
                  {(selectedNode.retention * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${selectedNode.retention > 0.5 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${selectedNode.retention * 100}%` }}
                />
              </div>
            </div>

            {/* Access Count */}
            <div className="flex justify-between items-center py-1 border-b border-border/50 text-slate-400 font-mono">
              <span>Recalled Count</span>
              <span className="text-white font-semibold">{selectedNode.accessCount} times</span>
            </div>

            {/* Properties JSON */}
            {Object.keys(selectedNode.properties).length > 0 && (
              <div>
                <span className="text-slate-400 font-mono block mb-1">Properties:</span>
                <pre className="p-2.5 rounded-lg bg-[#070b14] border border-border text-[11px] font-mono text-sky-300 overflow-x-auto">
                  {JSON.stringify(selectedNode.properties, null, 2)}
                </pre>
              </div>
            )}

            {/* Connected Relations */}
            <div>
              <span className="text-slate-400 font-mono block mb-1.5">
                Connected Relations ({connectedRelations.length}):
              </span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {connectedRelations.map((rel) => {
                  const isOutgoing = rel.source === selectedNode.id;
                  const otherId = isOutgoing ? rel.target : rel.source;
                  const otherNode = nodes.find((n) => n.id === otherId);
                  return (
                    <div
                      key={rel.id}
                      className="p-2 rounded-lg bg-surface border border-border/70 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="text-indigo-400 font-semibold">{rel.label}</span>
                        <span className="text-slate-500">{isOutgoing ? '➔' : '⬅'}</span>
                        <span className="text-slate-200 truncate max-w-[120px]">
                          {otherNode?.name || otherId}
                        </span>
                      </div>
                      {rel.superseded && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                          Superseded
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend Footer */}
      <div className="p-2.5 sm:p-3 bg-surface/80 border-t border-border flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-400 px-3 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <span className="font-mono text-slate-500 text-[11px] whitespace-nowrap">Legend:</span>
          {Object.entries(TYPE_COLORS).map(([type, c]) => (
            <div key={type} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.stroke }} />
              <span className="font-mono text-[11px] text-slate-300">{type}</span>
            </div>
          ))}
        </div>
        <div className="font-mono text-[11px] text-slate-500 whitespace-nowrap ml-auto sm:ml-0">
          Showing {nodes.length} nodes, {edges.length} edges
        </div>
      </div>
    </div>
  );
};
