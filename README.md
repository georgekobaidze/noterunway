<div align="center">

# NoteRunway

### AI-Powered Notion Workspace Management

Clean, organize, and command your Notion workspace with AI. Powered by the Notion MCP.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Notion MCP](https://img.shields.io/badge/Notion_MCP-2.2-000?logo=notion)](https://github.com/notionhq/notion-mcp-server)
[![Vercel AI SDK](https://img.shields.io/badge/Vercel_AI_SDK-6-000?logo=vercel)](https://sdk.vercel.ai/)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)

</div>

---

## Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [AI Provider Support](#-ai-provider-support)
- [MCP Integration](#-mcp-integration)
- [Archive System](#-archive-system)
- [Security](#-security)
- [Scripts](#-scripts)
- [Author](#-author)
- [Acknowledgements](#-acknowledgements)
- [License](#-license)

---

## Overview

**NoteRunway** is a browser-based tool that helps Notion power users clean up, audit, and manage their workspace using a combination of deterministic scans and AI-powered intelligence via the [Notion MCP](https://github.com/notionhq/notion-mcp-server).

It connects to your Notion workspace through OAuth, runs server-side analysis via Next.js API routes, and provides a cyberpunk-themed UI for reviewing findings and approving actions.

### Core Principles

| Principle             | Description                                                                   |
| --------------------- | ----------------------------------------------------------------------------- |
| **Zero Lock-in**      | Your data stays in Notion. NoteRunway never stores workspace content.         |
| **Human-in-the-Loop** | No destructive action runs without explicit user approval.                    |
| **Privacy First**     | AI keys stored in your browser only (BYOK). Never sent to NoteRunway servers. |
| **Transparency**      | Every AI decision shows reasoning, similarity scores, and proposed actions.   |

---

## Features

NoteRunway includes **7 core tools**, split into read-only scanners and AI-powered actions.

### 1. Workspace Health Dashboard

**Route:** `/dashboard`

Real-time workspace metrics at a glance.

- **Total pages** — count of all pages in the workspace
- **Top-level pages** — root pages without a parent
- **Recently edited** — pages modified in the last 7 days
- **Empty pages** — pages with zero content blocks
- **Link density** — percentage of pages referenced by other pages via @mentions
- Quick-access links to all 7 tools

> **Dependencies:** `NotionClient.getWorkspaceStats()`, `getEmptyPageCount()`, `getLinkDensity()`
> **AI Required:** No

---

### 2. Duplicate Detection

**Route:** `/doctor/duplicates`

AI-powered semantic duplicate detection with structured output.

**How it works:**
1. Fetches up to 100 non-archive pages with title + content snippet (600 chars max)
2. Sends to LLM with a specialized system prompt and Zod schema
3. AI returns duplicate groups with similarity scores (threshold: ≥ 85%)
4. UI shows grouped pages with the AI's recommended "keep" pick (⭐)
5. User selects which pages to archive → pages go to `NoteRunway Archive/Duplicates` with full audit trail

**API:**
- `GET /api/duplicates` — AI scan (reads `x-ai-key`, `x-ai-model` headers)
- `POST /api/duplicates` — Archive confirmed duplicates (Zod-validated body)

> **Dependencies:** `DuplicateDetectionPromptBuilder`, `NotionClient.getAllPages()`, `getPageSnippetWithMeta()`, `moveToArchive()`
> **AI Required:** Yes — uses `generateObject()` with structured Zod schema at temperature 0

---

### 3. Garbage Collector

**Route:** `/doctor/garbage`

Rule-based detection of workspace clutter across three categories.

| Category     | Detection Logic                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **Orphaned** | Page has a `parent_id` but the parent no longer exists in workspace      |
| **Empty**    | Page has zero content blocks (`blocks.children.list` returns empty)      |
| **Stale**    | `last_edited_time` older than threshold (default: 90 days, configurable) |

- Categories are **mutually exclusive** (orphaned > empty > stale priority)
- Archive pages are always excluded from scans
- Dry-run mode is on by default — review before acting
- Confirmed pages archived to `NoteRunway Archive/Garbage Collection`

**API:**
- `GET /api/garbage?staleDays=90` — Scan workspace
- `POST /api/garbage` — Archive confirmed garbage (Zod-validated body)

> **Dependencies:** `NotionClient.getGarbagePages()`, `moveToArchive()`
> **AI Required:** No

---

### 4. Dead Link Detector

**Route:** `/doctor/deadlinks`

Finds broken @mentions pointing to pages that have been deleted or archived.

**How it works:**
1. Scans all non-archive pages for `page_mention` block types
2. Cross-references mention targets against the workspace page set
3. For missing targets, attempts to resolve the title (returns `null` if hard-deleted)
4. Displays source page → broken target in a table

**API:**
- `GET /api/deadlinks` — Scan and return `{ deadLinks[], stats }`

> **Dependencies:** `NotionClient.getDeadLinks()`
> **AI Required:** No

---

### 5. Sensitive Data Finder

**Route:** `/doctor/sensitive`

Two-phase scanner for secrets and PII accidentally stored in Notion.

**Phase 1 — Regex Scan (always runs):**

Scans all page content (including nested blocks, toggles, callouts) against 10+ patterns:

| Pattern         | Example Match                             |
| --------------- | ----------------------------------------- |
| OpenAI Key      | `sk-proj-...`                             |
| Anthropic Key   | `sk-ant-...`                              |
| xAI Key         | `xai-...`                                 |
| Stripe Key      | `sk_live_...`, `pk_test_...`              |
| AWS Access Key  | `AKIA...`                                 |
| GitHub Token    | `ghp_...`, `github_pat_...`               |
| PEM Private Key | `-----BEGIN PRIVATE KEY-----`             |
| JWT Token       | `xxx.xxx.xxx` (3-part base64)             |
| Database URL    | `postgres://...`, `mongodb://...`         |
| Credit Card     | Visa, Mastercard, Amex, Discover patterns |

All findings are **redacted** — only `[N chars redacted]` is shown, never the full value.

**Phase 2 — AI Deep Scan (optional):**

Sends page text to the LLM to catch natural-language secrets that regex misses (e.g., *"the password is hunter2"*, *"login: admin/password123"*).

**API:**
- `GET /api/sensitive` — Regex scan
- `POST /api/sensitive` — AI deep scan (with Zod-validated body)

> **Dependencies:** `NotionClient.getSensitiveFindings()`, `getAllPagesWithText()`, `getModelWithKey()`
> **AI Required:** Phase 1 no, Phase 2 yes

---

### 6. Dependency Graph

**Route:** `/graph`

Interactive force-directed graph visualization of your workspace structure using React Flow.

- **Nodes** — Pages, colored by depth level (cyan → purple → green → orange)
- **Edges** — Parent/child hierarchy (solid lines) + @mention links (dashed lines)
- **Orphans** — Highlighted in red (no parent, no inbound mentions)
- **Interactions** — Hover highlights, click to preview, collapse/expand children, mini-map, pan/zoom

**API:**
- `GET /api/graph` — Returns `{ nodes[], edges[], stats }`

> **Dependencies:** `NotionClient.getGraphData()`, `reactflow`
> **AI Required:** No

---

### 7. Semantic Ask (Agentic Chat)

**Route:** `/ask`

Natural language interface to your workspace. The most powerful tool in NoteRunway.

**How it works:**
1. User types a free-form instruction
2. AI breaks it down into tool calls (search, read, analyze)
3. Tool results feed back into the AI context loop (up to 10 steps)
4. AI proposes structured actions for user approval
5. User reviews proposed changes → confirms or cancels
6. Approved actions execute via MCP or NotionClient

**Available Tools (server-side):**

| Tool               | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| `search_pages`     | Search workspace via MCP `API-post-search`                                      |
| `get_page`         | Fetch page metadata via MCP `API-retrieve-a-page`                               |
| `get_page_content` | Read page blocks via MCP `API-get-block-children`                               |
| `run_analysis`     | Run any built-in scanner (dead_links, garbage, workspace_stats, sensitive_data) |
| `propose_actions`  | Propose structured write actions for approval                                   |

**Supported Action Types:**

| Action    | Description                                                   |
| --------- | ------------------------------------------------------------- |
| `archive` | Move page to NoteRunway Archive with audit stub               |
| `create`  | Create a new page with title + markdown content               |
| `rename`  | Update a page's title property                                |
| `append`  | Add content blocks to the end of a page (non-destructive)     |
| `update`  | Replace all content on a page (deletes existing blocks first) |

**Streaming:** Uses Server-Sent Events (SSE) for real-time streaming of AI responses, tool steps, and proposed actions.

> **Dependencies:** `MCPClient`, `NotionClient`, `getModelWithKey()`, Vercel AI SDK `streamText()`
> **AI Required:** Yes — agentic loop with tool calling

---

## Tech Stack

| Layer            | Technology                                                                                                                                              | Purpose                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Framework**    | [Next.js 16](https://nextjs.org/) (App Router)                                                                                                          | Full-stack React framework                         |
| **Language**     | [TypeScript 5](https://typescriptlang.org/)                                                                                                             | Type safety throughout                             |
| **Styling**      | [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)                                                                        | Utility-first CSS + accessible components          |
| **AI SDK**       | [Vercel AI SDK 6](https://sdk.vercel.ai/)                                                                                                               | Unified streaming, tool calling, structured output |
| **AI Providers** | OpenAI, Anthropic, xAI (Grok), Google (Gemini)                                                                                                          | Multi-provider BYOK support                        |
| **Notion SDK**   | [@notionhq/client 5](https://github.com/makenotion/notion-sdk-js)                                                                                       | Official Notion API wrapper                        |
| **MCP**          | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) + [@notionhq/notion-mcp-server](https://github.com/notionhq/notion-mcp-server) | Tool calling via stdio subprocess                  |
| **Graph**        | [React Flow 11](https://reactflow.dev/)                                                                                                                 | Interactive graph visualization                    |
| **Validation**   | [Zod 4](https://zod.dev/)                                                                                                                               | Runtime schema validation                          |
| **Icons**        | [Lucide React](https://lucide.dev/)                                                                                                                     | Icon library                                       |

---

## Architecture

<div align="center">
  <img src="/public/images/architecture.png" alt="NoteRunway Architecture" width="600" />
</div>

### Key Design Decisions

- **MCP runs server-side only** — stdio transport spawns a child process, which can't run in the browser
- **Streaming via SSE** — tool steps and AI responses stream in real-time to the frontend
- **Lazy MCP connections** — MCPClient only connects when the first tool call is needed (saves resources)
- **NotionClient for bulk reads** — direct SDK for workspace scans (faster than MCP for pagination)
- **MCPClient for writes** — all mutations go through MCP tools for safety and sandboxing

---

## Project Structure

```
noterunway/
├── app/
│   ├── page.tsx                        # Landing page
│   ├── layout.tsx                      # Root layout (dark mode, fonts)
│   ├── globals.css                     # Tailwind + custom styles
│   ├── dashboard/
│   │   └── page.tsx                    # Workspace health dashboard
│   ├── settings/
│   │   └── page.tsx                    # Notion OAuth + AI provider config
│   ├── ask/
│   │   └── page.tsx                    # Semantic Ask chat UI
│   ├── graph/
│   │   └── page.tsx                    # Dependency graph visualization
│   ├── doctor/
│   │   ├── duplicates/page.tsx         # Duplicate detection
│   │   ├── garbage/page.tsx            # Garbage collector
│   │   ├── deadlinks/page.tsx          # Dead link detector
│   │   └── sensitive/page.tsx          # Sensitive data finder
│   └── api/
│       ├── notion/
│       │   ├── auth/route.ts           # OAuth initiation
│       │   ├── callback/route.ts       # OAuth callback + token exchange
│       │   ├── status/route.ts         # Connection status check
│       │   └── disconnect/route.ts     # Disconnect workspace
│       ├── workspace/
│       │   ├── stats/route.ts          # Workspace metrics
│       │   ├── empty-pages/route.ts    # Empty page count
│       │   └── link-density/route.ts   # Link density score
│       ├── duplicates/route.ts         # Duplicate detection (GET scan, POST archive)
│       ├── garbage/route.ts            # Garbage collector (GET scan, POST archive)
│       ├── deadlinks/route.ts          # Dead link scan
│       ├── sensitive/route.ts          # Sensitive data scan + AI deep scan
│       ├── graph/route.ts              # Workspace graph data
│       └── ask/
│           ├── route.ts                # Agentic chat (streaming SSE)
│           └── execute/route.ts        # Execute approved actions
├── lib/
│   ├── models.ts                       # AI provider/model registry
│   ├── utils.ts                        # Utility functions (cn)
│   ├── hooks/
│   │   └── useSettings.ts              # Client-side settings hook
│   ├── notion/
│   │   └── NotionClient.ts             # Notion API wrapper (~1280 lines)
│   ├── mcp/
│   │   └── MCPClient.ts                # MCP client wrapper
│   └── ai/
│       ├── PromptBuilder.ts            # Abstract prompt template
│       └── DuplicateDetectionPromptBuilder.ts
├── components/
│   ├── ui/                             # shadcn/ui primitives (button, input, label, select)
│   ├── Navbar.tsx                      # Top navigation bar
│   ├── CyberLoader.tsx                 # Animated loading spinner
│   └── Landing/
│       ├── NetworkBackground.tsx       # Animated particle canvas
│       ├── TerminalDemo.tsx            # Interactive terminal animation
│       ├── FeatureCard.tsx             # Feature showcase cards
│       └── InfoLinks.tsx               # Footer links modal
├── scripts/
│   └── seed-test-workspace.ts          # Test data seeder for Notion
├── public/
│   └── images/                         # Static assets
├── next.config.ts                      # Security headers
├── tsconfig.json                       # TypeScript config
├── postcss.config.mjs                  # PostCSS (Tailwind)
├── eslint.config.mjs                   # ESLint config
├── components.json                     # shadcn/ui config
└── package.json                        # Dependencies & scripts
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20.9.0
- **npm** (comes with Node.js)
- A **Notion workspace** you have admin access to
- A **Notion OAuth integration** (see below)
- An **AI API key** from any supported provider

### 1. Clone & Install

```bash
git clone https://github.com/your-username/noterunway.git
cd noterunway
npm install
```

### 2. Create a Notion OAuth Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"New integration"**
3. Set the integration type to **Public**
4. Under **OAuth Domain & URIs**, add your redirect URI:
   - Development: `http://localhost:3000/api/notion/callback`
   - Production: `https://your-domain.com/api/notion/callback`
5. Copy the **OAuth client ID** and **OAuth client secret**

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
# Notion OAuth (required)
NOTION_OAUTH_CLIENT_ID=your_client_id
NOTION_OAUTH_CLIENT_SECRET=your_client_secret
NOTION_OAUTH_REDIRECT_URI=http://localhost:3000/api/notion/callback
```

> **Note:** AI API keys are entered in the browser settings page and stored in localStorage. They are never stored in environment variables or on the server.

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Connect Your Workspace

1. Navigate to **Settings** (`/settings`)
2. Click **"Connect Notion"** — you'll be redirected to Notion's OAuth authorization page
3. Select the pages you want NoteRunway to access (or select all)
4. After authorization, you'll be redirected back to Settings
5. Select your **AI provider** and paste your **API key**
6. Go to **Dashboard** — you're ready!

---

## AI Provider Support

NoteRunway supports 4 AI providers with 13 models across two tiers:

| Provider       | Smart Models (Best Reasoning)      | Fast Models (Bulk Scans)   |
| -------------- | ---------------------------------- | -------------------------- |
| **OpenAI**     | GPT-5.4, GPT-4.1                   | GPT-5 Mini, GPT-4.1 Mini   |
| **Anthropic**  | Claude Opus 4.6, Claude Sonnet 4.6 | Claude Haiku 4.5           |
| **xAI (Grok)** | Grok 4, Grok 3                     | Grok 4.1 Fast, Grok 3 Mini |
| **Google**     | Gemini 2.5 Pro                     | Gemini 2.5 Flash           |

### BYOK (Bring Your Own Key)

- Keys are stored in **browser localStorage** only
- Sent to the server per-request via the `x-ai-key` header
- Server creates a provider instance with your key, makes the API call, and discards it
- NoteRunway's server **never persists or logs your keys**

---

## MCP Integration

NoteRunway uses the [Notion MCP Server](https://github.com/notionhq/notion-mcp-server) for all workspace write operations.

### How It Works

```
MCPClient → StdioClientTransport → notion-mcp-server (subprocess)
                                        ↓
                                   Notion API
```

1. When a tool call is needed, `MCPClient.connect()` spawns a subprocess running `@notionhq/notion-mcp-server`
2. Communication happens over **stdio** using JSON-RPC 2.0
3. The user's Notion OAuth token is passed as the `NOTION_TOKEN` environment variable
4. Tool results are parsed from MCP content blocks and returned as structured JSON
5. On disconnect, the subprocess is killed to prevent orphaned processes

### Destructive Tool Safety

Tools that modify workspace data require an `approved: true` flag before execution. Keywords that trigger this gate:

`patch`, `post-page`, `delete-a-block`, `move-page`, `update-a-data-source`, `create-a-data-source`

Read-only tools (`search`, `get`) always execute without approval.

> **⚠️ Deployment Note:** MCP stdio transport spawns child processes, which is incompatible with serverless platforms like Vercel. Deploy to **Railway**, **Render**, **Docker**, or a **VPS** for full MCP functionality.

---

## Archive System

Every destructive action in NoteRunway creates an audit trail in a dedicated archive structure.

### Archive Structure

```
NoteRunway Archive/                       ← Root page (auto-created)
├── Duplicates/                           ← Feature subfolder
│   └── [Audit Stub] Original Title
├── Garbage Collection/                   ← Feature subfolder
│   └── [Audit Stub] Stale Page Name
└── Semantic Ask/                         ← Feature subfolder
    └── [Audit Stub] Archived via Chat
```

### Archive Process

For each page being archived:

1. **Discover children** — find all nested child pages
2. **Create audit stub** — new page in the feature subfolder containing:
   - Callout: *"Archived by NoteRunway · [date]"*
   - Reason (if provided)
   - Kept version title (for duplicates)
   - Divider + original content blocks (faithfully copied)
3. **Recursively archive children** — each child gets its own audit stub, preserving hierarchy
4. **Soft-archive original** — sends the original page to Notion Trash

### Block Copying

The following block types are preserved in audit stubs:

`paragraph` · `heading_1` · `heading_2` · `heading_3` · `bulleted_list_item` · `numbered_list_item` · `to_do` · `quote` · `callout` · `toggle` · `code` · `divider` · `image` · `bookmark` · `embed`

Unsupported types (`child_page`, `synced_block`, `file`) are safely skipped.

---

## Security

### Authentication

- **Notion:** OAuth 2.0 flow with CSRF state validation. Token stored in an `httpOnly`, `Secure` cookie (30-day expiry).
- **AI Providers:** BYOK model — keys stored in browser `localStorage`, sent per-request via `x-ai-key` header, never persisted server-side.

### HTTP Security Headers

Applied globally via `next.config.ts`:

| Header                   | Value                                      | Purpose                           |
| ------------------------ | ------------------------------------------ | --------------------------------- |
| `X-Content-Type-Options` | `nosniff`                                  | Prevents MIME sniffing            |
| `X-Frame-Options`        | `DENY`                                     | Prevents clickjacking             |
| `Referrer-Policy`        | `strict-origin-when-cross-origin`          | Controls referrer leakage         |
| `Permissions-Policy`     | `camera=(), microphone=(), geolocation=()` | Disables unnecessary browser APIs |

### Input Validation

All POST endpoints use **Zod schemas** for runtime body validation (`/api/duplicates`, `/api/garbage`, `/api/ask/execute`).

### Sensitive Data Redaction

Sensitive findings are always displayed as `[N chars redacted]` — full values are **never** exposed in the UI or API responses.

---

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start development server             |
| `npm run build` | Production build                     |
| `npm run start` | Start production server              |
| `npm run lint`  | Run ESLint                           |
| `npm run seed`  | Seed Notion workspace with test data |

---

## Author

**Giorgi Kobaidze** (Pilotronica)

[![GitHub](https://img.shields.io/badge/GitHub-@georgekobaidze-181717?logo=github)](https://github.com/georgekobaidze)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-giorgikobaidze-0A66C2?logo=linkedin)](https://linkedin.com/in/giorgikobaidze)
[![Twitter](https://img.shields.io/badge/X-@georgekobaidze-000?logo=x)](https://x.com/georgekobaidze)
[![DEV.to](https://img.shields.io/badge/DEV.to-georgekobaidze-0A0A0A?logo=devdotto)](https://dev.to/georgekobaidze)

---

## Acknowledgements

- [Notion](https://www.notion.so/) — for the API and MCP server that makes this project possible
- [Notion MCP Server](https://github.com/notionhq/notion-mcp-server) — official Model Context Protocol server for Notion
- [Vercel AI SDK](https://sdk.vercel.ai/) — unified streaming, tool calling, and structured output across providers
- [React Flow](https://reactflow.dev/) — interactive graph visualization library
- [shadcn/ui](https://ui.shadcn.com/) — accessible, customizable component primitives
- [Lucide](https://lucide.dev/) — beautiful open-source icons
- Built for the [DEV × Notion Challenge 2025](https://dev.to/challenges/notion-2026-03-04)

---

## License

This project is licensed under the [MIT License](LICENSE).