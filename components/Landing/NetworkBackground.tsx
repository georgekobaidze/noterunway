'use client'

import { useEffect, useRef } from 'react'

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
}

interface Edge {
  a: number
  b: number
  opacity: number
}

const NODE_COUNT = 60
const MAX_DISTANCE = 220
const NODE_SPEED = 0.3

export function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let nodes: Node[] = []
    let edges: Edge[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const init = () => {
      resize()
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * NODE_SPEED,
        vy: (Math.random() - 0.5) * NODE_SPEED,
        radius: Math.random() * 2 + 1.5,
        opacity: Math.random() * 0.5 + 0.3,
      }))
    }

    const computeEdges = () => {
      edges = []
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MAX_DISTANCE) {
            edges.push({ a: i, b: j, opacity: 1 - dist / MAX_DISTANCE })
          }
        }
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Detect dark mode via CSS variable
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark')
      const nodeColor = isDark ? '0, 212, 255' : '0, 150, 200'
      const edgeColor = isDark ? '0, 212, 255' : '0, 150, 200'

      // Draw edges
      for (const edge of edges) {
        const { a, b, opacity } = edge
        ctx.beginPath()
        ctx.moveTo(nodes[a].x, nodes[a].y)
        ctx.lineTo(nodes[b].x, nodes[b].y)
        ctx.strokeStyle = `rgba(${edgeColor}, ${opacity * 0.55})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Draw nodes
      for (const node of nodes) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${nodeColor}, ${node.opacity})`
        ctx.fill()

        // Soft glow
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 4)
        glow.addColorStop(0, `rgba(${nodeColor}, 0.15)`)
        glow.addColorStop(1, `rgba(${nodeColor}, 0)`)
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius * 4, 0, Math.PI * 2)
        ctx.fillStyle = glow
        ctx.fill()
      }
    }

    const update = () => {
      for (const node of nodes) {
        node.x += node.vx
        node.y += node.vy

        // Bounce off edges
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1
      }
    }

    const loop = () => {
      update()
      computeEdges()
      draw()
      animationId = requestAnimationFrame(loop)
    }

    init()
    loop()

    const onResize = () => {
      resize()
      init()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  )
}
