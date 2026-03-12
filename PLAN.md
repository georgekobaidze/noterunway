# NoteRunway — Project Plan

## 1. Overview

NoteRunway is an AI-powered workspace management tool for Notion, available as both
a web UI and a CLI. It helps developers and power users clean, organize, and query
their Notion workspace using a combination of deterministic operations and
AI-powered intelligence via Notion MCP.

Submitted to: [DEV Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04)
Deadline: March 29, 2026

---

## 2. Core Features

| Feature                 | Description                                                                                           | Route                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
| **Workspace Health**    | Overview: total pages, orphans, duplicate candidates, link density                                    | `/dashboard`         |
| **Duplicate Detection** | Semantically detects duplicate/near-duplicate notes, shows side-by-side diff, confirms before merging | `/doctor/duplicates` |
| **Garbage Collector**   | Finds orphaned, empty, or stale pages. Dry-run mode shows what would be deleted before acting         | `/doctor/garbage`    |
| **Dependency Graph**    | Interactive graph of linked notes/tasks using React Flow                                              | `/graph`             |
| **SQL Query**           | Query notes with SQL-like syntax. Scoped to SELECT + basic WHERE operators for reliability            | `/query`             |
| **Semantic Ask**        | Free-form natural language instruction: "archive everything older than 6 months with no links"        | `/ask`               |

---

## 3. Tech Stack

| Layer               | Choice                        | Notes                                         |
| ------------------- | ----------------------------- | --------------------------------------------- |
| Framework           | Next.js 15 (App Router)       | Full-stack in one project                     |
| Language            | TypeScript                    | Throughout frontend and backend               |
| Styling             | Tailwind CSS + shadcn/ui      | Fast, polished UI                             |
| AI                  | Vercel AI SDK                 | Unified interface for multiple providers      |
| AI Providers        | OpenAI, Anthropic, xAI (Grok) | User selects provider + pastes own key (BYOK) |
| MCP Client          | `@modelcontextprotocol/sdk`   | Runs server-side in Next.js API routes        |
| Notion SDK          | `@notionhq/client`            | Official SDK                                  |
| Graph Visualization | React Flow                    | Interactive, draggable, zoomable graph        |
| CLI Framework       | Commander.js                  | Node.js CLI for scripting/automation          |
| Deployment          | Railway                       | Existing subscription, no timeout limits      |

---

## 4. Architecture

```
Browser (React UI)          CLI (Commander.js)
        │                           │
        │  HTTP / streaming         │  direct Node.js calls
        ▼                           ▼
Next.js API Routes  ────────  Core Services (shared)
        │
        ├── PromptBuilder        → constructs system + user prompts per feature
        ├── AIClient             → Vercel AI SDK (model-agnostic)
        │         └── OpenAI / Anthropic / Grok
        ├── MCPClient            → @modelcontextprotocol/sdk (SSE transport)
        │         └── Notion's hosted MCP Server (api.notion.com/mcp)
        │                   └── Notion API → Notion Workspace
        └── NotionClient         → @notionhq/client (direct API for non-AI reads)
```

### Key principles
- All core logic (PromptBuilders, MCPClient, NotionClient) lives in `lib/` and is shared
  between the web UI (Next.js API routes) and the CLI.
- **AI-driven actions** (merge, archive, ask) go through the real Notion MCP server.
- **Non-AI operations** (fetching pages for dashboard, graph, token validation) use NotionClient directly.
- NotionClient's write methods (archivePage, updatePageTitle) exist for utility/CLI use only — never called as a result of AI decisions.

---

## 5. User Authentication & Keys

### Notion — OAuth (Web UI)
- Handled by **NextAuth.js** — the OAuth flow runs entirely server-side
- Token stored in an `httpOnly` secure cookie (never accessible to JavaScript)
- User clicks "Connect Notion" → Notion OAuth page → clicks Allow → redirected back
- No manual token copying, no XSS risk

### Notion — Token (CLI)
- User runs `noterunway init` → prompted for Notion integration token
- Token stored in local `.env` file (never committed)

### AI API Key — BYOK (both)
- User provides their own OpenAI / Anthropic / Grok key
- Web UI: stored in localStorage (user-owned key, acceptable risk for a demo tool)
- CLI: stored in `.env` file

### Onboarding flow (Web)
```
1. User opens NoteRunway
2. Settings screen: paste Notion token, select AI provider, paste AI key
3. App fetches workspace pages → ready
```

### Onboarding flow (CLI)
```
1. noterunway init   ← interactive prompt to set up .env
2. noterunway doctor --duplicates
```

---

## 6. AI / MCP Layer Design

### PromptBuilder (per feature)
Each feature has a dedicated PromptBuilder class:
- `DuplicateDetectionPromptBuilder`
- `GarbageCollectionPromptBuilder`
- `GraphPromptBuilder`
- `SQLQueryPromptBuilder`
- `AskPromptBuilder`

Each builder produces:
- A **system prompt** defining the AI's role, available MCP tools, and output format
- A **user prompt** containing relevant workspace data

All AI responses return **structured JSON** describing actions for the MCP client to execute.

### MCP Tools (Notion MCP)
| Tool                             | Description                |
| -------------------------------- | -------------------------- |
| `search_pages(query)`            | Find pages in workspace    |
| `get_page(pageId)`               | Get page content           |
| `update_page(pageId, content)`   | Update a page              |
| `create_page(parentId, content)` | Create a new page          |
| `archive_page(pageId)`           | Archive/soft-delete a page |
| `merge_pages(pageAId, pageBId)`  | Merge duplicate pages      |

### Human-in-the-loop
Before any destructive MCP action (merge, archive, delete), the UI shows a confirmation step:
- Side-by-side diff for merges
- List of pages to be archived/deleted with reason
- User confirms or skips each action individually

---

## 7. Feature Details

### 7.1 Workspace Health (`/dashboard`)
- Total page count
- Orphan page count
- Estimated duplicate candidates
- Graph link density score
- "Run full scan" CTA

### 7.2 Duplicate Detection (`/doctor/duplicates`)
1. Fetch all pages from Notion
2. Smart chunking: embedding-based pre-filter to find candidates (cheap pass)
3. LLM analyzes candidate pairs for semantic similarity
4. UI shows side-by-side diff with similarity score
5. User confirms/skips each merge → MCP executes

### 7.3 Garbage Collector (`/doctor/garbage`)
- Finds: empty pages, orphaned pages (no inbound links), stale pages (not edited in N days, configurable)
- **Dry-run toggle** (default ON) — shows what would be removed without doing it
- User reviews list → confirms → MCP archives pages

### 7.4 Dependency Graph (`/graph`)
- Fetches all pages and their linked references
- AI can infer implicit dependencies from content semantically
- Renders as interactive React Flow graph
- Click a node → opens page preview panel
- Filter by tag, date, or page type

### 7.5 SQL Query (`/query`)
- User types SQL-like query: `SELECT * FROM notes WHERE tag = 'bug'`
- Supported: SELECT, WHERE, ORDER BY, LIMIT
- AI translates to Notion API filter/sort parameters
- Results displayed as a sortable table
- Scoped intentionally — no INSERT/DELETE via SQL (use other features for mutations)

### 7.6 Semantic Ask (`/ask`)
- Free-form instruction: `"Archive all meeting notes older than 3 months"`
- AI decomposes instruction into MCP tool calls
- Shows proposed actions before executing (human-in-the-loop)
- Most powerful and impressive feature — anchor of the demo video

---

## 8. Multi-Model AI Support

```typescript
const models = {
  'gpt-4o':              openai('gpt-4o'),
  'gpt-4o-mini':         openai('gpt-4o-mini'),
  'claude-3-5-sonnet':   anthropic('claude-3-5-sonnet-20241022'),
  'claude-3-haiku':      anthropic('claude-3-haiku-20240307'),
  'grok-2':              xai('grok-2-1212'),
}
```

- User selects model in settings
- Use cheaper models (gpt-4o-mini, claude-haiku) for bulk scanning
- Use smarter models (gpt-4o, claude-sonnet) for `ask` and refactoring
- PromptBuilder logic is model-agnostic — no changes needed per model

---

## 9. Project Structure

```
noterunway/
├── app/                              # Next.js web UI
│   ├── page.tsx                      # Landing / onboarding
│   ├── dashboard/page.tsx            # Workspace health
│   ├── doctor/
│   │   ├── duplicates/page.tsx
│   │   └── garbage/page.tsx
│   ├── graph/page.tsx
│   ├── query/page.tsx
│   ├── ask/page.tsx
│   └── api/                          # Next.js API routes (backend)
│       ├── notion/
│       ├── duplicates/route.ts
│       ├── garbage/route.ts
│       ├── graph/route.ts
│       ├── query/route.ts
│       └── ask/route.ts
├── cli/                              # CLI (Commander.js)
│   ├── index.ts                      # Entry point / command registration
│   └── commands/
│       ├── init.ts                   # noterunway init
│       ├── doctor.ts                 # noterunway doctor --duplicates / --garbage
│       ├── graph.ts                  # noterunway graph
│       ├── query.ts                  # noterunway query "<SQL>"
│       └── ask.ts                    # noterunway ask "<instruction>"
├── lib/                              # Shared core logic (used by both UI and CLI)
│   ├── ai/
│   │   ├── PromptBuilder.ts
│   │   ├── DuplicateDetectionPromptBuilder.ts
│   │   ├── GarbageCollectionPromptBuilder.ts
│   │   ├── GraphPromptBuilder.ts
│   │   ├── SQLQueryPromptBuilder.ts
│   │   └── AskPromptBuilder.ts
│   ├── mcp/
│   │   └── MCPClient.ts
│   ├── notion/
│   │   └── NotionClient.ts
│   └── models.ts
├── components/                       # React components (web UI only)
│   ├── ui/                           # shadcn/ui components
│   ├── Graph/                        # React Flow graph
│   ├── DiffView/                     # Side-by-side diff for merges
│   ├── ConfirmActionList/            # Human-in-the-loop confirmation
│   └── Settings/                     # API key + model selection
└── ...config files
```

---

## 10. Implementation Milestones

1. Project scaffold (Next.js + Tailwind + shadcn/ui + Commander.js)
2. Shared core: NotionClient, MCPClient, PromptBuilder base class, model registry
3. Settings UI + key storage (localStorage) + CLI `init` command
4. Workspace Health dashboard
5. Duplicate Detection (PromptBuilder + web UI + CLI command)
6. Garbage Collector (web UI + CLI command)
7. Dependency Graph (React Flow web UI + CLI output)
8. SQL Query (web UI + CLI command)
9. Semantic Ask (web UI + CLI command)
10. Multi-model support (OpenAI + Anthropic + Grok)
11. Polish UI, loading states, error handling
12. Deploy to Railway
13. Record demo video + write DEV submission post

---

## 11. DEV Submission Highlights

- **Notion MCP as core** — all workspace mutations go through MCP tools
- **Human-in-the-loop** — no destructive action without user confirmation (matches challenge brief language)
- **Multi-model AI** — OpenAI, Anthropic, Grok via unified Vercel AI SDK interface
- **BYOK** — user owns their keys, NoteRunway never stores them
- **Dual interface** — web UI for interactive use + CLI for scripting/automation
- **Developer-centric UX** — SQL query, dependency graph, dry-run mode, `noterunway ask`
