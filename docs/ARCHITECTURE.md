# InspectorRAGet — Architecture

> Living document. Captures the current state of the codebase. Update as architecture evolves.

## Overview

InspectorRAGet is a client-side introspection platform for LLM evaluation. Users upload JSON files containing evaluation data (models, metrics, tasks, and model results) and explore results through aggregate and instance-level visualizations. The platform does not execute experiments — it is purely analytical.

Built with Next.js 16 (App Router), React 18, TypeScript 5.9, and IBM Carbon Design System.

## High-Level Data Flow

```
                              ┌─────────────────────┐
                              │   JSON Input File    │
                              │  (user upload or     │
                              │   data/ directory)   │
                              └─────────┬───────────┘
                                        │
                              ┌─────────▼───────────┐
                              │   migrator.ts        │
                              │  Schema migration    │
                              │  (v1 → v2, etc.)     │
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
                              │       + resultsMap   │
                              └─────────┬───────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
            ┌───────▼──────┐   ┌───────▼──────┐   ┌───────▼──────┐
            │  Aggregate   │   │  Instance    │   │  Annotator   │
            │  Views       │   │  Views       │   │  Views       │
            │  (overview,  │   │  (task       │   │  (agreement, │
            │   model,     │   │   detail,    │   │   behavior)  │
            │   metric)    │   │   per type)  │   │              │
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
│   │   │   └── Task.tsx        # Dispatches to type-specific TaskView via registry
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
│   ├── task-types/             # Vertical slice per evaluation type
│   │   ├── index.ts            # Registry: taskTypeRegistry maps type string → { TaskView, Copier }
│   │   ├── qa/                 # Single-turn QA with retrieved context
│   │   │   ├── types.ts        # RetrievedDocument, RetrievedDocumentAnnotation
│   │   │   ├── TaskView.tsx    # Input + contexts + per-model response + evaluations/steps tabs
│   │   │   └── Copier.tsx
│   │   ├── generation/         # Open-ended text/JSON generation
│   │   │   ├── TaskView.tsx    # Input + per-model response + evaluations/steps tabs
│   │   │   └── Copier.tsx
│   │   ├── rag/                # Multi-turn retrieval conversation
│   │   │   ├── types.ts        # Message union (SystemMessage, UserMessage, AssistantMessage, ToolMessage, …)
│   │   │   ├── TaskView.tsx    # Conversation thread + per-model response + evaluations/steps tabs
│   │   │   ├── Copier.tsx
│   │   │   └── components/
│   │   │       └── ChatLine.tsx    # Renders a single OpenAI-format message
│   │   └── tool_calling/       # Function/tool calling evaluation
│   │       ├── types.ts        # ToolDefinition (OpenAI JSON Schema format)
│   │       ├── TaskView.tsx    # Conversation + available tools panel + prediction/target/evaluations/steps
│   │       └── Copier.tsx
│   │
│   ├── components/             # Reusable UI components
│   │   ├── header/             # App header with nav and theme toggle
│   │   ├── filters/            # Generic filter controls
│   │   ├── expression-builder/ # Advanced filter expression builder
│   │   ├── selectors/          # Model, Metric, Aggregator selectors
│   │   ├── evaluations/        # EvaluationsPanel — shared human + algorithmic score tables
│   │   ├── steps/              # Execution trace: StepGroup (tree) + StepItem (collapsible card)
│   │   ├── comments/           # Task commenting system (see Comment System section below)
│   │   ├── notification/       # Toast notifications (context provider)
│   │   ├── avatar/             # User/agent avatars
│   │   ├── task-tile/          # Task summary card
│   │   ├── example-tile/       # Dataset summary card
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
│   │   ├── selectors.ts        # Mouse selection extraction
│   │   ├── expressions.ts      # Expression evaluation for advanced filters
│   │   ├── correlation.ts      # Statistical correlation
│   │   ├── significance.ts     # Statistical significance tests
│   │   ├── highlighter.ts      # Text overlap highlighting
│   │   └── time.ts             # Duration calculation
│   │
│   ├── workers/
│   │   └── filter.ts           # Web Worker for background data filtering
│   │
│   ├── types.ts                # Core TypeScript interfaces (re-exports task-type-specific types)
│   ├── store.tsx               # DataStoreProvider (React Context)
│   ├── migrator.ts             # Versioned schema migration chain (v1 → v2 → …)
│   ├── processor.ts            # Data qualification pipeline
│   ├── exporter.ts             # Export pipeline (split from processor.ts)
│   ├── validators.ts           # Input schema validation
│   ├── dataloader.ts           # Server-side data/ directory loader
│   └── theme.tsx               # ThemeProvider (Carbon g10/g90)
│
├── converters/                 # Dataset converters
│   └── bfcl/                   # Berkeley Function Calling Leaderboard (single-turn V3/V4)
├── data/                       # Pre-loaded example datasets (JSON, schema v2)
├── notebooks/                  # Integration notebooks (Ragas, LM Eval, HuggingFace, BFCL)
├── public/                     # Static assets (favicon, license)
└── docs/                       # Documentation (this file)
```

## Core Data Model

Defined in `src/types.ts`. The input JSON (schema v2) has this structure:

```
RawData
├── schema_version?: number            # 2 = current; absent or 1 = legacy (auto-migrated)
├── name?: string
├── models: Model[]                    # LLMs being evaluated
│   └── { modelId, name, owner, ... }
├── metrics: Metric[]                  # Evaluation criteria
│   └── { name, type: numerical|categorical|text, author: human|algorithm, ... }
├── documents?: RetrievedDocument[]    # Corpus documents (QA/RAG tasks)
│   └── { documentId, text, title?, url?, score? }
├── filters?: string[]                 # Task fields available for filtering
├── tasks: Task[]                      # Individual evaluation instances
│   └── { taskId, taskType: qa|generation|rag|tool_calling|agentic,
│          input, targets?: TaskTarget[], tools?: ToolDefinition[],
│          flagged?, comments?: TaskComment[], annotations? }
└── results: ModelResult[]             # Model outputs + metric scores
    └── { taskId, modelId, output: Message[], scores: { [metric]: { [annotator]: { value } } },
           contexts?, comments?: TaskComment[] }
```

`output` is always a `Message[]`. For single-inference task types (qa, generation, rag, tool_calling) it is a one-element array. The `agentic` task type will produce a full execution thread. Steps live on `output[0].steps`, not at the result level.

### Key type unions

**`Message`** — OpenAI-compatible message shape:

- `role: 'system' | 'user' | 'assistant' | 'tool'`
- `content?: string` — text response
- `tool_calls?: ToolCallRecord[]` — tool-calling output (on assistant messages)
- `steps?: Step[]` — execution trace attached to the message that produced them
- `retries?: MessageRetry[]` — intermediate retry attempts before final output

**`TaskTarget`** — discriminated on `type`:

- `{ type: 'text'; value: string }` — most task types
- `{ type: 'tool_calls'; calls: ToolCallRecord[] }` — tool-calling ground truth
- `{ type: 'state'; description: string }` — agentic (future)
- `{ type: 'image'; url: string }` — multimodal (future)

**`Step`** — discriminated on `type`:

- `thinking` | `tool_call` | `tool_response` | `retrieval` | `generation`
- Optional `startTimestamp`/`endTimestamp` for latency analysis
- `tool_call` and `tool_response` are paired by `toolCallId`

### Schema migration

`migrator.ts` runs before `validators.ts` on every load. The migration chain is:

- **v1 → v2:** renames legacy task types (`rag` single-turn → `qa`, `rag` multi-turn → `rag`, `text_generation`/`json_generation` → `generation`, `chat` → `rag`); wraps `model_response` string → `output: [{ role: 'assistant', content }]`; renames `annotations` → `scores`; renames `evaluations` array → `results`

Exported files are always stamped with `schema_version: CURRENT_SCHEMA_VERSION`.

After processing (`processor.ts`), tasks are qualified or disqualified based on:

1. Whether all plottable metrics have scores
2. Whether results exist for all specified models
3. Whether score values are non-empty

The qualified data becomes the `Data` interface (extends `TileData`), stored in `DataStore` context.

## State Management

**Global state** is React Context, not Redux:

- `DataStoreProvider` (`store.tsx`): holds `Data`, `taskMap: Map<taskId, Task>`, and `resultsMap: Map<"taskId::modelId", ModelResult>`
  - `updateTask(taskId, update)` — immutable Map update for task-level changes (flags, task comments)
  - `updateResult(taskId, modelId, update)` — immutable Map update for model-result-level changes (model comments)
- `ThemeProvider` (`theme.tsx`): Carbon theme toggle (light g10 / dark g90)
- `NotificationProvider` (`components/notification/`): toast messages

**Local state**: each view manages its own filters, selections, and UI state via `useState`.

**Web Workers**: `ModelBehavior` view spawns a filter worker for expensive filtering operations to avoid blocking the UI thread.

## Task-Type Registry

`src/task-types/index.ts` exports `taskTypeRegistry`:

```typescript
const taskTypeRegistry: Record<
  string,
  { TaskView: ComponentType; Copier: ComponentType }
> = {
  qa: { TaskView: QATaskView, Copier: QACopier },
  generation: { TaskView: GenerationTaskView, Copier: GenerationCopier },
  rag: { TaskView: RAGTaskView, Copier: RAGCopier },
  tool_calling: { TaskView: ToolCallingTaskView, Copier: ToolCallingCopier },
};
```

`Task.tsx` and `TaskCopier.tsx` look up the component via `taskTypeRegistry[task.taskType]` — no if/else chains. Unknown task types degrade gracefully to null.

## Comment System

Comments live at two levels:

- **`task.comments`** — task-level observations shared across all models
- **`result.comments`** — per-model observations (e.g. noting an acceptable-but-different tool call)

`Task.tsx` routes a new comment to the correct level by inspecting the provenance component string: any component containing `::` is model-scoped (written to `updateResult`); others are task-scoped (written to `updateTask`).

### Provenance component string convention

| Component string pattern                               | Meaning                         | Scope |
| ------------------------------------------------------ | ------------------------------- | ----- |
| `input` / `messages`                                   | Input or conversation area      | Task  |
| `document_{id}`                                        | Retrieved context document      | Task  |
| `target`                                               | Ground-truth target area        | Task  |
| `{modelId}::evaluation::response`                      | Model response text             | Model |
| `{modelId}::evaluation::prediction`                    | Model prediction (tool calling) | Model |
| `{modelId}::evaluation::scores::{metric}::{annotator}` | Specific score cell             | Model |
| `{modelId}::steps::{stepId}`                           | Specific execution step         | Model |

### Floating selection button

After any `mouseup` on the `.taskViewWrapper` div, `Task.tsx` captures viewport coordinates. If provenance is also set (text was selected), `SelectionCommentButton` renders as a `position: fixed` button near the cursor. Clicking it opens `AddCommentModal` with provenance pre-filled. Clicking anywhere else clears the coords and dismisses the button.

### `provenanceTag.ts`

Single source of truth for deriving display pills from a provenance component string. Returns `{ primary: [label, carbonType], detail?: [label1, label2] }`. The `detail` pair is only set for score cells (metric + annotator) and step references (\"step\" + stepId). All three comment modals (`AddCommentModal`, `EditCommentModal`, `CommentsViewer`) import from here.

### `CommentFinding`

Optional structured annotation attached to a `TaskComment`. Discriminated on `type`:

- `tool_call` — points to the correct function name/arguments
- `query` — records the correct retrieval query
- `output` — records a corrected reference output
- `note` — free-form structured note

`CommentFindingEditor` renders type-appropriate fields filtered by `task.taskType`. Findings are stored in the comment but editing them post-creation is out of scope (display-only in `EditCommentModal`).

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

Clicking a task in any table opens a **Task modal overlay** (`views/task/Task.tsx`) which dispatches to the type-specific `TaskView` from the registry.

## Key Technical Details

### Data Processing Pipeline

`migrator.ts` → `migrateData(raw)` → `validators.ts` → `validateInputData(data)` → `processor.ts` → `processData(raw)` returns `[Data, DisqualifiedTasks, Notification[]]`

- Migration runs first, before `camelCaseKeys`, so it operates on raw snake_case fields
- Processor validates every result has scores for all plottable metrics, ensures every task has results from all specified models, sorts categorical metric values, computes metric ranges

### Input Validation

`validators.ts` → `validateInputData(data)` returns `{ valid, reasons[] }`

- Checks required fields on models, metrics, tasks, results
- Validates metric type constraints (categorical needs values, numerical can't use majority)
- QA tasks must reference documents
- Every value in a categorical metric must carry a `numeric_value` (camelCase: `numericValue`)

**Why `numeric_value` is required on categorical metric values**

The entire aggregation and sorting pipeline operates on numbers, not label strings. `castToNumber()` in `utilities/metrics.ts` maps a string label to its `numericValue` so that mean, median, and inter-annotator agreement distance can be computed arithmetically. `computeMajority()` uses `Math.abs(castToNumber(a) - castToNumber(b))` to decide whether the top-two annotator choices are "close" (high agreement) or "far apart" (no agreement). `sortMetricValues()` in `processor.ts` sorts the metric's value list by `numericValue` so UI dropdowns, chart axes, and filter ranges reflect the researcher's intended ordering. `compareMetricAggregatedValues()` in `metrics.ts` uses `numericValue` to order chart bars for majority-aggregated metrics.

Without `numericValue`, every one of these paths falls back to `parseFloat(label)`, which returns `NaN` for any non-numeric string. That silently corrupts aggregate statistics, chart orderings, and agreement calculations. The validator rejects files with missing `numericValue` on categorical entries so the problem is surfaced at load time rather than producing incorrect visualizations.

**Convention:** assign `numericValue` so that **higher = better**. `sortMetricValues()` sorts ascending by `numericValue`, so `values[0]` becomes `minValue` (worst) and `values[last]` becomes `maxValue` (best). `PerformanceOverview` normalises scores as `(score - minValue) / (maxValue - minValue)` and ranks models with higher scores first. Example: `{ value: "poor", numeric_value: 0 }`, `{ value: "acceptable", numeric_value: 1 }`, `{ value: "good", numeric_value: 2 }`.

### JSON Key Convention

Input files use `snake_case`. The app converts to `camelCase` on load (`camelCaseKeys` in `objects.ts`) and back to `snake_case` on export (`snakeCaseKeys`). Migration runs before `camelCaseKeys`.

### Styling

- SCSS Modules: one `.module.scss` per component, co-located
- Carbon Design tokens for spacing, colors, typography
- Global styles in `src/app/global.scss`
- Theme: Carbon `g10` (light) and `g90` (dark), toggled via header
- Sass uses `@use` (not `@import`) for Carbon v11 / Turbopack compatibility
- Carbon font-face disabled via `$css--font-face: false` in global.scss (Turbopack can't resolve `~` prefix)

### Carbon Component Gotchas

**TabPanel renders all panels simultaneously (hidden, not unmounted)**

Carbon's `TabPanel` uses the HTML `hidden` attribute to hide inactive panels — it does NOT lazy-mount or unmount them. All tab panels and their full component trees are live in the DOM at all times. Consequences:

- Any component with a non-unique `id` prop will have duplicate DOM IDs across tabs. This silently breaks components that rely on `id` for internal DOM wiring (labels, aria associations, focus management). The browser uses the **first** matching element — clicks on a selector in a later tab quietly target the hidden first tab's element instead.
- **Rule:** every Carbon component that takes an `id` prop and is used in multiple tabs must have a globally unique `id`. Pattern used here: `{view-name}-{component-name}`, e.g. `model-behavior-model-selector`, `metric-behavior-model-selector`.
- Components confirmed affected: `FilterableMultiSelect`, `Toggle`, `Select`. Assume all interactive Carbon components are affected.

**`FilterableMultiSelect` — controlled vs uncontrolled**

- Use `selectedItems` (controlled) rather than `initialSelectedItems` (uncontrolled) when the parent needs to own the selection state (e.g. to filter data). The uncontrolled path fires `onChange` via a `useEffect` guarded by an `isMounted` ref; under React StrictMode's double-invoke behaviour this guard can leave the component unresponsive.
- Always add a null guard to `itemToString`: `(item) => (item ? item.name : '')`. Carbon passes `null` to `itemToString` in some internal code paths (e.g. when clearing the filter input); without the guard this throws and corrupts Downshift's internal state.

**`@carbon/charts-react/styles.css` import**

Import this stylesheet once, at the highest shared layout level (e.g. `app/layout.tsx` or `global.scss`), not per-component. All rules are scoped under `.cds--chart-holder` so there is no global style pollution, but importing it in multiple component files creates redundant CSS bundles.

### Deployment

- Dockerfile for containerized deployment
- `next.config.js` sets `output: 'standalone'` for minimal Docker images
- Security headers configured (CSP, HSTS, X-Frame-Options)
- Can also deploy on HuggingFace Spaces

## Known Technical Debt

1. **Type safety gaps** — `any` types on `Task.input` and `Model.trainingDetails`; `task.annotations` is untyped (context quality scores on RAG/QA documents, distinct from `result.scores` — see TODO comment in `types.ts`)
2. **Pre-existing ESLint warnings** — 19 errors and 15 warnings from `react-hooks/exhaustive-deps`, `react-compiler` rules, and `setState`-in-effect patterns; need case-by-case review
3. **ESLint 10 blocked** — `eslint-plugin-react` (bundled by `eslint-config-next`) uses deprecated `getFilename` API removed in ESLint 10; pinned to v9 until upstream fixes
4. **No client-side component tests** — all tests are pure utility/logic tests; interactive Carbon component bugs are only caught manually
