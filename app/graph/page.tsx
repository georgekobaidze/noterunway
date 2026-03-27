'use client'

import { useState, useCallback, useRef, useEffect, useMemo, createContext, useContext } from 'react'
import Link from 'next/link'
import ReactFlow, {
  Node,
  Edge,
  NodeTypes,
  useNodesState,
  useEdgesState,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { ArrowLeft, ScanSearch, AlertTriangle, ExternalLink, ChevronRight, ChevronDown, X } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { CyberLoader } from '@/components/CyberLoader'
import type { GraphData, GraphNode, GraphEdge } from '@/lib/notion/NotionClient'

// ─── Depth colors ─────────────────────────────────────────────────────────────

const DEPTH_COLORS = [
  '#00d4ff', // 0 — cyan (root)
  '#a855f7', // 1 — purple
  '#22c55e', // 2 — green
  '#f59e0b', // 3 — amber
  '#64748b', // 4+ — slate
]

function depthColor(depth: number): string {
  return DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)]
}

// ─── Hover context (avoids rebuilding nodes on hover) ─────────────────────────

type HoverCtx = {
  hoveredId: string | null
  connectedIds: Set<string>  // neighbours of hovered node
}
const HoverContext = createContext<HoverCtx>({ hoveredId: null, connectedIds: new Set() })

// ─── Custom node ──────────────────────────────────────────────────────────────

type NodeData = {
  label: string
  depth: number
  isOrphan: boolean
  childCount: number
  mentionCount: number
  expanded: boolean
  hasChildren: boolean
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  isSelected: boolean
}

function PageNode({ id, data }: { id: string; data: NodeData }) {
  const { hoveredId, connectedIds } = useContext(HoverContext)
  const isHighlighted = hoveredId === null ? data.isSelected : (hoveredId === id || connectedIds.has(id))
  const isDimmed = hoveredId !== null && hoveredId !== id && !connectedIds.has(id)

  const color = data.isOrphan ? '#f87171' : depthColor(data.depth)
  const opacity = isDimmed ? 0.2 : 1

  return (
    <div
      onClick={() => data.onSelect(id)}
      style={{
        opacity,
        border: `1.5px solid ${color}`,
        boxShadow: isHighlighted ? `0 0 12px ${color}88` : undefined,
        background: 'rgba(10,10,20,0.92)',
        borderRadius: 10,
        padding: '8px 12px',
        minWidth: 140,
        maxWidth: 200,
        cursor: 'pointer',
        transition: 'opacity 0.15s, box-shadow 0.15s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {data.hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); data.onToggle(id) }}
            style={{ color, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
          >
            {data.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#e2e8f0',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {data.label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
        {data.isOrphan && (
          <span style={{ fontSize: 9, color: '#f87171', background: '#f8717120', padding: '1px 5px', borderRadius: 4, border: '1px solid #f8717140' }}>
            orphan
          </span>
        )}
        {data.childCount > 0 && (
          <span style={{ fontSize: 9, color, background: `${color}15`, padding: '1px 5px', borderRadius: 4 }}>
            {data.childCount} {data.childCount === 1 ? 'child' : 'children'}
          </span>
        )}
        {data.mentionCount > 0 && (
          <span style={{ fontSize: 9, color: '#94a3b8', background: '#94a3b815', padding: '1px 5px', borderRadius: 4 }}>
            {data.mentionCount} mention{data.mentionCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const NODE_TYPES: NodeTypes = { page: PageNode }

// ─── Layout helpers ───────────────────────────────────────────────────────────

// Simple top-down layered layout: group nodes by depth, space evenly
function layoutNodes(
  graphNodes: GraphNode[],
  visibleIds: Set<string>,
): Record<string, { x: number; y: number }> {
  const visible = graphNodes.filter((n) => visibleIds.has(n.id))
  const byDepth = new Map<number, GraphNode[]>()
  for (const n of visible) {
    const arr = byDepth.get(n.depth) ?? []
    arr.push(n)
    byDepth.set(n.depth, arr)
  }
  const positions: Record<string, { x: number; y: number }> = {}
  const X_GAP = 220
  const Y_GAP = 120
  for (const [depth, nodes] of byDepth) {
    const totalW = (nodes.length - 1) * X_GAP
    nodes.forEach((n, i) => {
      positions[n.id] = { x: i * X_GAP - totalW / 2, y: depth * Y_GAP }
    })
  }
  return positions
}

// ─── Convert graph data to React Flow nodes/edges ─────────────────────────────
// Hover state is intentionally excluded — it's handled via HoverContext to avoid
// triggering a full node rebuild (which causes flicker) on mouse enter/leave.

function buildFlow(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  expandedIds: Set<string>,
  selectedId: string | null,
  onToggle: (id: string) => void,
  onSelect: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {

  // A node is visible only if its entire ancestor chain is expanded.
  // Build a parent -> children adjacency map once, then BFS from roots following
  // only expanded parents to determine visibility in O(N + E).
  const parentToChildren = new Map<string, string[]>()
  for (const n of graphNodes) {
    if (n.parentId !== null) {
      const children = parentToChildren.get(n.parentId) ?? []
      children.push(n.id)
      parentToChildren.set(n.parentId, children)
    }
  }

  const visibleIds = new Set<string>()
  const queue: string[] = []

  // Roots (nodes without a parent) are always visible entry points.
  for (const n of graphNodes) {
    if (n.parentId === null) {
      if (!visibleIds.has(n.id)) {
        visibleIds.add(n.id)
        queue.push(n.id)
      }
    }
  }

  // BFS: a child is visible only if its parent is visible and expanded.
  while (queue.length > 0) {
    const currentId = queue.shift() as string
    const children = parentToChildren.get(currentId)
    if (!children || !expandedIds.has(currentId)) continue

    for (const childId of children) {
      if (!visibleIds.has(childId)) {
        visibleIds.add(childId)
        queue.push(childId)
      }
    }
  }
  const positions = layoutNodes(graphNodes, visibleIds)

  const nodes: Node[] = graphNodes
    .filter((n) => visibleIds.has(n.id))
    .map((n) => ({
      id: n.id,
      type: 'page',
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: {
        label: n.title,
        depth: n.depth,
        isOrphan: n.isOrphan,
        childCount: n.childCount,
        mentionCount: n.mentionCount,
        expanded: expandedIds.has(n.id),
        hasChildren: n.childCount > 0,
        onToggle,
        onSelect,
        isSelected: selectedId === n.id,
      } satisfies NodeData,
      selected: selectedId === n.id,
    }))

  const edges: Edge[] = graphEdges
    .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: e.type === 'mention',
      style: {
        stroke: e.type === 'parent' ? '#334155' : '#00d4ff44',
        strokeDasharray: e.type === 'mention' ? '4 3' : undefined,
        opacity: 0.5,
      },
      markerEnd: e.type === 'parent'
        ? { type: MarkerType.ArrowClosed, color: '#334155', width: 12, height: 12 }
        : undefined,
    }))

  return { nodes, edges }
}

// ─── Details panel ────────────────────────────────────────────────────────────

function DetailsPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const color = node.isOrphan ? '#f87171' : depthColor(node.depth)
  return (
    <div className="absolute top-4 right-4 z-10 glass-card rounded-xl border p-5 w-72 flex flex-col gap-3"
      style={{ borderColor: `${color}40` }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-snug">{node.title}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded border"
          style={{ color, borderColor: `${color}40`, background: `${color}15` }}>
          Depth {node.depth}
        </span>
        {node.isOrphan && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded border text-red-400 border-red-400/30 bg-red-400/10">
            orphan
          </span>
        )}
      </div>

      <div className="text-xs text-muted-foreground flex flex-col gap-1">
        {node.childCount > 0 && <span>↳ {node.childCount} child page{node.childCount !== 1 ? 's' : ''}</span>}
        {node.mentionCount > 0 && <span>◎ Mentioned by {node.mentionCount} page{node.mentionCount !== 1 ? 's' : ''}</span>}
        {node.parentId && <span className="font-mono text-[10px] text-muted-foreground/60 truncate">Parent: {node.parentId}</span>}
      </div>

      <a
        href={`https://notion.so/${node.id.replace(/-/g, '')}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-[#00d4ff] hover:underline"
      >
        <ExternalLink size={11} /> Open in Notion
      </a>
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="absolute top-4 left-4 z-10 glass-card rounded-xl border border-white/5 p-3 flex flex-col gap-2 text-[10px] font-mono text-muted-foreground">
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: DEPTH_COLORS[0] }} /> Root pages</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: DEPTH_COLORS[1] }} /> Depth 1</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: DEPTH_COLORS[2] }} /> Depth 2</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: DEPTH_COLORS[3] }} /> Depth 3+</div>
      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-400" /> Orphan</div>
      <div className="flex items-center gap-2 mt-1">
        <span className="w-6 border-t border-slate-500" /> Parent edge
      </div>
      <div className="flex items-center gap-2">
        <span className="w-6 border-t border-dashed border-[#00d4ff66]" /> @mention edge
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const containerRef = useRef<HTMLDivElement>(null)
  const prevData = useRef<GraphData | null>(null)

  const onToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onSelect = useCallback((id: string) => {
    setSelectedId((prev) => prev === id ? null : id)
  }, [])

  const expandAll = useCallback(() => {
    if (!prevData.current) return
    setExpandedIds(new Set(prevData.current.nodes.map((n) => n.id)))
  }, [])

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  // Ref so the rebuild effect can read the current hover state without adding
  // it as a dependency (which would cause node flicker on every hover).
  const hoveredIdRef = useRef<string | null>(null)

  // Rebuild only when structure changes (expand/collapse or selection) — NOT on hover
  useEffect(() => {
    if (!prevData.current) return
    const { nodes: n, edges: e } = buildFlow(
      prevData.current.nodes, prevData.current.edges,
      expandedIds, selectedId, onToggle, onSelect,
    )
    setNodes(n)
    // Apply current hover state immediately so edge styles survive a rebuild
    const hId = hoveredIdRef.current
    setEdges(hId ? e.map((edge) => {
      const connected = edge.source === hId || edge.target === hId
      return { ...edge, style: { ...edge.style, opacity: connected ? 1 : 0.05, strokeWidth: connected ? 2 : 1 } }
    }) : e)
  }, [expandedIds, selectedId, onToggle, onSelect, setNodes, setEdges])

  const load = async () => {
    setLoading(true)
    setError(null)
    setGraphData(null)
    setExpandedIds(new Set())
    setSelectedId(null)
    setHoveredId(null)

    try {
      const res = await fetch('/api/graph')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Load failed.'); return }
      prevData.current = data
      setGraphData(data)
      const { nodes: n, edges: e } = buildFlow(data.nodes, data.edges, new Set(), null, onToggle, onSelect)
      setNodes(n)
      setEdges(e)
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setLoading(false)
    }
  }

  // Hover: just update state — HoverContext propagates to nodes without rebuilding
  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    setHoveredId(node.id)
  }, [])

  const onNodeMouseLeave = useCallback(() => {
    setHoveredId(null)
  }, [])

  // Precompute connected node IDs for the hovered node (memoized, not a ref)
  const connectedIds = useMemo(() => {
    if (!hoveredId || !prevData.current) return new Set<string>()
    const s = new Set<string>()
    for (const e of prevData.current.edges) {
      if (e.source === hoveredId) s.add(e.target)
      if (e.target === hoveredId) s.add(e.source)
    }
    return s
  }, [hoveredId])

  // Sync ref so the rebuild effect always has the current hover state
  useEffect(() => {
    hoveredIdRef.current = hoveredId
  }, [hoveredId])

  // Update edge opacity on hover without touching nodes
  useEffect(() => {
    setEdges((prev) => prev.map((e) => {
      const connected = hoveredId && (e.source === hoveredId || e.target === hoveredId)
      return {
        ...e,
        style: {
          ...e.style,
          opacity: hoveredId ? (connected ? 1 : 0.05) : 0.5,
          strokeWidth: connected ? 2 : 1,
        },
      }
    }))
  }, [hoveredId, connectedIds, setEdges])

  const hoverCtx = useMemo<HoverCtx>(
    () => ({ hoveredId, connectedIds }),
    [hoveredId, connectedIds],
  )
  const selectedNode = graphData?.nodes.find((n) => n.id === selectedId) ?? null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar
        rightSlot={
          <Link href="/dashboard" className="neon-btn-ghost text-sm w-32 text-center py-3">Dashboard</Link>
        }
      />

      <main className="flex-1 flex flex-col px-6 py-6 gap-6 max-w-7xl mx-auto w-full">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#00d4ff] transition-colors w-fit mb-2">
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold neon-text" style={{ fontFamily: 'var(--font-orbitron), sans-serif' }}>
                Dependency Graph
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Interactive map of page relationships. Click to expand, hover to highlight connections.
              </p>
            </div>
            <button onClick={load} disabled={loading} className="neon-btn px-6 py-2.5 flex items-center gap-2 disabled:opacity-40">
              {loading ? <><span className="animate-spin">⠋</span> Loading…</> : <><ScanSearch size={14} /> {graphData ? 'Reload' : 'Load Graph'}</>}
            </button>
          </div>
        </div>

        {/* Stats + expand controls */}
        {graphData && (
          <div className="flex flex-wrap gap-3 items-center">
            <div className="glass-card rounded-lg px-4 py-2 border border-white/5 flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-[#00d4ff]">{graphData.stats.totalPages}</span>
              <span className="text-xs text-muted-foreground">pages</span>
            </div>
            <div className="glass-card rounded-lg px-4 py-2 border border-white/5 flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-purple-400">{graphData.stats.edgeCount}</span>
              <span className="text-xs text-muted-foreground">connections</span>
            </div>
            <div className="glass-card rounded-lg px-4 py-2 border border-red-400/20 flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-red-400">{graphData.stats.orphanCount}</span>
              <span className="text-xs text-muted-foreground">orphans</span>
            </div>
            {graphData.stats.archiveExcluded > 0 && (
              <div className="glass-card rounded-lg px-4 py-2 border border-white/5 flex items-center gap-2">
                <span className="text-lg font-bold font-mono text-muted-foreground">{graphData.stats.archiveExcluded}</span>
                <span className="text-xs text-muted-foreground">archive excluded</span>
              </div>
            )}
            <div className="ml-auto flex gap-2">
              <button onClick={expandAll} className="neon-btn-ghost px-4 py-1.5 text-xs flex items-center gap-1.5">
                <ChevronDown size={12} /> Expand All
              </button>
              <button onClick={collapseAll} className="neon-btn-ghost px-4 py-1.5 text-xs flex items-center gap-1.5">
                <ChevronRight size={12} /> Collapse All
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass-card rounded-xl p-5 border border-red-400/30 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="glass-card rounded-xl p-10 border border-white/5 flex flex-col items-center gap-4">
            <CyberLoader />
            <p className="text-xs font-mono text-muted-foreground">Building workspace graph…</p>
          </div>
        )}

        {/* Graph */}
        {graphData && !loading && (
          <div ref={containerRef} className="relative glass-card rounded-xl border border-white/5 overflow-hidden" style={{ height: 780 }}>
            <HoverContext.Provider value={hoverCtx}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.1}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={24} size={1} />
                <Controls showInteractive={false} className="!bg-background !border-white/10" />
                <MiniMap
                  nodeColor={(n) => {
                    const d = (n.data as NodeData)
                    return d.isOrphan ? '#f87171' : depthColor(d.depth)
                  }}
                  maskColor="rgba(0,0,0,0.7)"
                  style={{ background: 'rgba(10,10,20,0.9)', border: '1px solid rgba(255,255,255,0.05)' }}
                />
              </ReactFlow>
            </HoverContext.Provider>
            <Legend />
            {selectedNode && <DetailsPanel node={selectedNode} onClose={() => setSelectedId(null)} />}
          </div>
        )}

        {/* Empty state */}
        {!graphData && !loading && !error && (
          <div className="glass-card rounded-xl p-12 border border-white/5 flex flex-col items-center gap-3 text-center">
            <p className="text-muted-foreground text-sm">Click <span className="text-foreground font-medium">Load Graph</span> to visualise your workspace.</p>
            <p className="text-xs text-muted-foreground/60">Root pages are shown first — click the expand arrow on any node to reveal its children.</p>
          </div>
        )}

      </main>
    </div>
  )
}
