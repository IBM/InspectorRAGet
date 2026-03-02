# InspectorRAGet — Architecture

> Living document. Captures the current state of the codebase. Update as architecture evolves.

## Overview

InspectorRAGet is a client-side introspection platform for LLM evaluation. Users upload JSON files containing evaluation data (models, metrics, tasks, evaluations) and explore results through aggregate and instance-level visualizations. The platform does not execute experiments — it is purely analytical.

Built with Next.js 14 (App Router), React 18, TypeScript, and IBM Carbon Design System.

## High-Level Data Flow

```
                              ┌─────────────────────┐
                              │   JSON Input File    │
                              │  (user upload or     │
                              │   data/ directory)   │
                              └─────────┬───────────┘
                                        │
                              ┌─────────▼───────────┐
                              │   validators.ts      │
                              │  Schema validation   │
                              └─────────┬───────────┘
                                        │
                              ┌─────────▼───────────┐
                              │   processor.ts       │
                              │  Qualify/disqualify  │
                              │  tasks by metric     │
                              │  completeness        │
                              └─────────┬───────────┘
                                        │
                              ┌─────────▼───────────┐
                              │   DataStore context  │
                              │  (store.tsx)         │
                              │  Data + taskMap      │
                              └─────────┬───────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
            ┌───────▼──────┐   ┌───────▼──────┐   ┌───────▼──────┐
            │  Aggregate   │   │  Instance    │   │  Annotator   │
            │  Views       │   │  Views       │   │  Views       │
            │  (overview,  │   │  (task       │   │  (agreement, │
            │   model,     │   │   detail,    │   │   behavior)  │
            │   metric)    │   │   chat, RAG) │   │              │
            └──────────────┘   └──────────────┘   └──────────────┘
```

## Directory Structure

```
InspectorRAGet/
├── src/
│   ├── app/                    # Next.js App Router — thin page shells
│   │   ├── layout.tsx          # Root: ThemeProvider → NotificationProvider → DataStoreProvider
│   │   ├── page.tsx            # / — Home landing page
│   │   ├── visualize/          # /visualize — Upload and analyze
│   │   ├── examples/           # /examples — Browse pre-loaded datasets
│   │   │   └── [example_id]/   # /examples/:id — Specific dataset analysis
│   │   ├── documentation/      # /documentation (placeholder)
│   │   └── cookbooks/          # /cookbooks (placeholder)
│   │
│   ├── views/                  # Page-level container components
│   │   ├── home/               # Landing page cards
│   │   ├── on-board/           # Multi-step upload wizard (instructions → upload → verify)
│   │   ├── example/            # Main analysis hub — 7-tab interface
│   │   ├── examples/           # Grid of dataset tiles
│   │   ├── visualization/      # Onboard → Example router
│   │   ├── task/               # Instance-level task viewer (modal overlay)
│   │   │   ├── Task.tsx        # Routes to type-specific component
│   │   │   ├── RAGTask.tsx     # RAG: input + contexts + response + overlap
│   │   │   ├── ChatTask.tsx    # Chat: conversation + model responses + steps
│   │   │   └── TextGenerationTask.tsx  # Text: input + response + overlap
│   │   ├── performance-overview/   # Aggregate metric tables + charts
│   │   ├── model-behavior/     # Per-metric distribution analysis
│   │   ├── metric-behavior/    # Cross-metric correlation
│   │   ├── model-comparator/   # Head-to-head model comparison
│   │   ├── data-characteristics/   # Dataset statistics
│   │   ├── annotator-behavior/ # Inter-annotator agreement
│   │   ├── predictions-table/  # Filterable evaluation table
│   │   ├── tasks-table/        # Task listing with filters
│   │   ├── annotations-table/  # Per-task metric scores
│   │   └── document/           # Document viewer
│   │
│   ├── components/             # Reusable UI components
│   │   ├── header/             # App header with nav and theme toggle
│   │   ├── filters/            # Generic filter controls
│   │   ├── expression-builder/ # Advanced filter expression builder
│   │   ├── selectors/          # Model, Metric, Aggregator selectors
│   │   ├── chatline/           # Single chat message renderer
│   │   ├── steps/              # Execution steps visualization (WIP on feat_visualize_steps)
│   │   ├── comments/           # Task commenting system
│   │   ├── notification/       # Toast notifications (context provider)
│   │   ├── avatar/             # User/agent avatars
│   │   ├── task-copier/        # Copy task data to clipboard
│   │   ├── task-tile/          # Task summary card
│   │   ├── example-tile/       # Dataset summary card
│   │   ├── documents-viewer/   # Document panel with highlighting
│   │   └── disabled/           # Disabled feature placeholder
│   │
│   ├── hooks/
│   │   ├── useBackButton.ts    # Browser back navigation
│   │   ├── useStorage.ts       # localStorage persistence
│   │   └── usePrevious.ts      # Previous render value
│   │
│   ├── utilities/
│   │   ├── strings.ts          # Hashing, truncation, search matching
│   │   ├── colors.ts           # Color scale generation
│   │   ├── objects.ts          # camelCase/snakeCase key conversion
│   │   ├── aggregators.ts      # Mean, median, majority, weighted aggregators
│   │   ├── metrics.ts          # Metric helper functions
│   │   ├── selectors.ts        # Selection logic
│   │   ├── expressions.ts      # Expression evaluation for advanced filters
│   │   ├── correlation.ts      # Statistical correlation
│   │   ├── significance.ts     # Statistical significance tests
│   │   ├── highlighter.ts      # Text overlap highlighting
│   │   └── time.ts             # Duration calculation
│   │
│   ├── workers/
│   │   └── filter.ts           # Web Worker for background data filtering
│   │
│   ├── types.ts                # All TypeScript interfaces
│   ├── store.tsx               # DataStoreProvider (React Context)
│   ├── processor.ts            # Data qualification pipeline
│   ├── validators.ts           # Input schema validation
│   ├── dataloader.ts           # Server-side data/ directory loader
│   └── theme.tsx               # ThemeProvider (Carbon g10/g90)
│
├── data/                       # Pre-loaded example datasets (JSON)
├── notebooks/                  # Integration notebooks (Ragas, LM Eval, HuggingFace, BFCL)
├── public/                     # Static assets (favicon, license)
└── docs/                       # Documentation (this file)
```

## Core Data Model

Defined in `src/types.ts`. The input JSON has this structure:

```
RawData
├── name: string
├── models: Model[]                    # LLMs being evaluated
│   └── { modelId, name, owner, ... }
├── metrics: Metric[]                  # Evaluation criteria
│   └── { name, type: numerical|categorical|text, author: human|algorithm, ... }
├── documents?: RetrievedDocument[]    # Corpus documents (RAG tasks)
│   └── { documentId, text, title?, url?, score? }
├── filters?: string[]                 # Task fields available for filtering
├── tasks: Task[]                      # Individual evaluation instances
│   └── { taskId, taskType: rag|text_generation|json_generation|chat, input, targets?, contexts? }
└── evaluations: TaskEvaluation[]      # Model outputs + metric scores
    └── { taskId, modelId, modelResponse, annotations: { [metric]: { [annotator]: { value } } } }
```

After processing (`processor.ts`), tasks are qualified or disqualified based on:

1. Whether all plottable metrics have annotations
2. Whether evaluations exist for all specified models
3. Whether annotation values are non-empty

The qualified data becomes the `Data` interface (extends `TileData`), stored in `DataStore` context.

## State Management

**Global state** is React Context, not Redux:

- `DataStoreProvider` (`store.tsx`): holds `Data` and a `taskMap` (Map<taskId, Task>)
- `ThemeProvider` (`theme.tsx`): Carbon theme toggle (light g10 / dark g90)
- `NotificationProvider` (`components/notification/`): toast messages

**Local state**: each view manages its own filters, selections, and UI state via `useState`.

**Web Workers**: `ModelBehavior` view spawns a filter worker for expensive filtering operations to avoid blocking the UI thread.

## Routing

| Route            | Server/Client | What it does                             |
| ---------------- | ------------- | ---------------------------------------- |
| `/`              | Server        | Renders Home with navigation cards       |
| `/visualize`     | Client        | Upload wizard → analysis view            |
| `/examples`      | Server        | Loads `data/` dir, renders dataset grid  |
| `/examples/[id]` | Server        | Loads specific dataset, renders analysis |
| `/documentation` | —             | Placeholder                              |
| `/cookbooks`     | —             | Placeholder                              |

The analysis hub (`Example` view) provides 7 tabs:

1. **Data Characteristics** — dataset statistics, distributions
2. **Predictions Table** — filterable evaluation records
3. **Annotator Behavior** — inter-annotator agreement heatmap
4. **Performance Overview** — aggregate metrics with rankings
5. **Model Behavior** — per-metric distribution analysis
6. **Model Comparator** — head-to-head comparison
7. **Metric Behavior** — cross-metric correlation

Clicking a task in any table opens a **Task modal overlay** that routes to `RAGTask`, `ChatTask`, or `TextGenerationTask` based on `taskType`.

## Key Technical Details

### Data Processing Pipeline

`processor.ts` → `processData(RawData)` returns `[Data, DisqualifiedTasks, Notification[]]`

- Validates every evaluation has annotations for all plottable metrics
- Ensures every task has evaluations from all specified models
- Sorts categorical metric values
- Computes metric ranges

### Input Validation

`validators.ts` → `validateInputData(data)` returns `{ valid, reasons[] }`

- Checks required fields on models, metrics, tasks, evaluations
- Validates metric type constraints (categorical needs values, numerical can't use majority)
- RAG tasks must reference documents

### JSON Key Convention

Input files use `snake_case`. The app converts to `camelCase` on load (`camelCaseKeys` in `objects.ts`) and back to `snake_case` on export (`snakeCaseKeys`).

### Styling

- SCSS Modules: one `.module.scss` per component, co-located
- Carbon Design tokens for spacing, colors, typography
- Global styles in `src/app/global.scss`
- Theme: Carbon `g10` (light) and `g90` (dark), toggled via header

### Deployment

- Dockerfile for containerized deployment
- `next.config.js` sets `output: 'standalone'` for minimal Docker images
- Security headers configured (CSP, HSTS, X-Frame-Options)
- Can also deploy on HuggingFace Spaces

## Known Technical Debt

1. **State management**: `store.tsx` `updateTask` mutates Map in-place — could cause stale renders
2. **Comment style**: many files use `// Step N` numbered comments — being migrated to descriptive comments
3. **No test infrastructure**: no unit or integration tests exist yet
4. **processor.ts**: large file (~450 lines) handling both qualification and export — could be split
5. **Type safety**: some `any` types in Task.input, MessageStep.input/output, and trainer details
