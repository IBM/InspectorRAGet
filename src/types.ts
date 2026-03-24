/**
 *
 * Copyright 2023-present InspectorRAGet Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 **/

// Task-type-specific types live in their respective task-types/ slices.
// Re-exported here so existing consumers don't need to update import paths yet.
export type {
  RetrievedDocument,
  RetrievedDocumentAnnotation,
} from '@/src/task-types/qa/types';
export type {
  Message,
  MessageRetry,
  SystemMessage,
  DeveloperMessage,
  UserMessage,
  ToolMessageDocument,
  ToolMessage,
  AssistantMessage,
} from '@/src/task-types/rag/types';
export type { ToolDefinition } from '@/src/task-types/tool_calling/types';

import type { RetrievedDocument } from '@/src/task-types/qa/types';
import type { Message } from '@/src/task-types/rag/types';
import type { ToolDefinition } from '@/src/task-types/tool_calling/types';

export interface Notification {
  title: string;
  subtitle: string;
  kind:
    | 'error'
    | 'info'
    | 'info-square'
    | 'success'
    | 'warning'
    | 'warning-alt';
  caption?: string;
}

export interface StringMatchObject {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly matchesInTarget: { start: number; end: number }[];
  readonly count: number;
}

export interface ComponentCommonLink {
  content: string;
  href: string;
  openInNewTab: boolean;
}

export interface ComponentHomeCard {
  title: string;
  text: string | null;
  features?: string[];
  href: string | null;
  actionText: string | null;
  tag: string | null;
  icon: 'CHART_MULTITYPE' | 'MICROSCOPE';
  openInNewTab: boolean;
  disabled?: boolean;
}

export interface HomePageAttributes {
  title: string;
  subtitle: string;
  greeting: string | null;
  subtitleLink: ComponentCommonLink | null;
  cards: ComponentHomeCard[];
}

// --- Model ---

export interface Model {
  modelId: string;
  name: string;
  owner: string;
  description?: string;
  baseModel?: string;
  baseModelId?: string;
  releaseDate?: string;
  trainingDetails?: any;
}

// --- Metric ---

export interface MetricValue {
  value: string | number;
  numericValue?: number;
  displayValue?: string;
}

export function isMetricValue(
  val: string | number | MetricValue | undefined,
): boolean {
  return (
    typeof val !== 'undefined' &&
    typeof val !== 'string' &&
    typeof val !== 'number' &&
    val.value !== undefined
  );
}

export interface Metric {
  readonly name: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly author: 'human' | 'algorithm';
  readonly type: 'numerical' | 'categorical' | 'text';
  readonly aggregator?: string;
  values?: MetricValue[];
  range?: number[];
  order?: 'ascending' | 'descending';
  minValue?: number | MetricValue;
  maxValue?: number | MetricValue;
}

export enum AggregationConfidenceLevels {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}
export interface AggregationStatistics {
  value: string | number;
  readonly std: number;
  readonly confidence:
    | AggregationConfidenceLevels.HIGH
    | AggregationConfidenceLevels.MEDIUM
    | AggregationConfidenceLevels.LOW;
  readonly variance?: number;
}
export interface Aggregator {
  readonly name: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly apply: Function;
}

// --- Tool call record ---

// Represents a single tool call made by a model. Used in Message.tool_calls
// (what the model actually called) and TaskTarget (ground-truth expected calls).
// dependsOn references another ToolCallRecord.id for nested/compositional calls
// (e.g. f(g(x)) where the outer call depends on the inner result).
export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: object;
  dependsOn?: string;
}

// --- TraceEvent ---

// A single event in an agentic execution trace. Three variants:
// 'invocation'    — one LLM inference call, carrying the model's output message and
//                   an optional recursive sub-agent trace.
// 'tool_execution'— one tool call result from the environment.
// 'observation'   — feedback injected by the runner/benchmark between invocations:
//                   decode errors, orchestrator notes, user simulator turns, etc.
//                   Signals what the model observed before its next invocation.
// The recursive trace? field on 'invocation' enables multi-level agent hierarchies.
export type TraceEvent =
  | {
      type: 'invocation';
      agent?: string; // optional — most benchmarks do not report agent identity
      thinking?: string; // optional — not all models expose thinking tokens
      output: Message; // LLM output: tool calls or final text
      trace?: TraceEvent[]; // sub-agent trace, recursive
      label?: string; // optional — free-form marker for cross-referencing source data
    }
  | {
      type: 'tool_execution';
      result: Message; // tool response (Message with role 'tool')
      label?: string; // optional — free-form marker for cross-referencing source data
    }
  | {
      type: 'observation';
      content: string; // text injected by runner/benchmark before next invocation
      label?: string; // optional — free-form marker for cross-referencing source data
    };

// --- Output helper ---

// Returns the text content of a model output as a trimmed string.
// For Message[] output (current schema), reads the content of the first message.
// For plain string output (legacy, pre-migration), trims and returns as-is.
// The cast-to-any guard handles v2 files authored before the Message[] migration
// that still carry {type:'text',value} — the migrator skips them because their
// schema_version is already 2, so they arrive here with the old shape at runtime.
// Call sites that render HTML should additionally pass the result through DOMPurify.sanitize().
export function outputAsText(output: Message[] | string): string {
  if (typeof output === 'string') return output.trim();
  // Runtime guard for old v2 {type:'text',value} shape
  const first = output[0] as any;
  if (first?.type === 'text' && typeof first.value === 'string')
    return first.value.trim();
  const content = first?.content;
  if (typeof content === 'string') return content.trim();
  return '';
}

// --- Task target ---

// Discriminated union of expected outputs. 'text' covers most task types.
// 'tool_calls' is the ground-truth for tool-calling evaluation.
// 'state' holds the expected final environment state for agentic tasks (BFCL multi-turn).
// 'image' is reserved for future multimodal support.
//
// For 'tool_calls', the two levels of variance are:
//   - Which function(s) to call: represented as separate TaskTarget entries in
//     the outer targets[] array. Each entry is a complete, self-contained correct
//     answer (AND semantics: all calls in `calls` are required).
//   - How to call a function (argument variance only, same function name): captured
//     in `alternatives`, keyed by ToolCallRecord.id. Each entry is a list of
//     ToolCallRecords with the same function name but different acceptable argument
//     values. `alternatives` does NOT represent different function choices — use a
//     separate TaskTarget for that.
export type TaskTarget =
  | { type: 'text'; value: string }
  | {
      type: 'tool_calls';
      calls: ToolCallRecord[];
      alternatives?: Record<string, ToolCallRecord[]>;
    }
  | { type: 'state'; value: Record<string, unknown> } // agentic: expected final env state
  | { type: 'image'; url: string }; // multimodal, future

// --- Comment finding ---

// Optional structured annotation on a TaskComment that makes the comment
// machine-readable and searchable. One finding per comment.
// 'tool_call' — points to the correct function name/args (tool calling tasks).
// 'query'     — records what the correct retrieval query should have been (RAG).
// 'output'    — records a corrected or reference output (generation tasks).
// 'note'      — free-form structured note for agentic or other task types.
export type CommentFinding =
  | { type: 'tool_call'; functionName: string; arguments?: object }
  | { type: 'query'; query: string }
  | { type: 'output'; output: string; format?: string }
  | { type: 'note'; text: string };

// --- Task ---

export interface TaskCommentProvenance {
  component: string;
  text?: string;
  offsets?: number[];
}
export interface TaskComment {
  comment: string;
  author: string;
  created: number;
  updated: number;
  provenance?: TaskCommentProvenance;
  // Structured finding attached to this comment. Optional — plain-text comments
  // remain valid. When present, enables structured search and export.
  finding?: CommentFinding;
}

export interface Task {
  readonly taskId: string;
  readonly taskType: 'qa' | 'generation' | 'rag' | 'tool_calling' | 'agentic';
  readonly contexts?: { readonly documentId: string }[];
  readonly input: any;
  readonly targets?: TaskTarget[];
  // Available tool definitions for this task (OpenAI format).
  // Only present for tool_calling and agentic tasks.
  readonly tools?: ToolDefinition[];
  flagged?: boolean;
  comments?: TaskComment[];
  // TODO: task.annotations is used in RAG/QA to store per-document context quality
  // scores (e.g. context_relevance). The name 'annotations' is ambiguous — revisit
  // and consider renaming to something like 'contextScores' or 'documentScores'.
  readonly annotations?: {
    [key: string]: { [key: string]: any };
  };
  [key: string]: any;
}

// --- Model result (previously TaskEvaluation) ---

export interface Annotation {
  readonly value: string | number;
  readonly timestamp?: number;
  readonly duration?: number;
}

export interface ModelResult {
  readonly taskId: string;
  readonly modelId: string;
  // Model output as a Message array. For all current task types this is a
  // single-element array; multiple messages are reserved for the agentic task type.
  // The execution trace lives on output[0].trace rather than as a top-level field.
  readonly output: Message[];
  // Metric scores keyed by metric name, then by evaluator/annotator id.
  readonly scores: {
    [key: string]: { [key: string]: Annotation };
  };
  readonly contexts?: RetrievedDocument[];
  // Evaluation-level comments (e.g. noting an acceptable-but-different tool call).
  // Distinct from task.comments which are task-level observations shared across models.
  comments?: TaskComment[];
  // Benchmark-supplied metadata. Keys are benchmark-specific; the UI renders
  // known keys and ignores unknown ones.
  // Known keys: error — { kind: 'text' | 'structured', context: unknown }
  //   Structured diagnostics from benchmarks that surface per-result detail beyond
  //   what fits in flat metric strings (e.g. BFCL multi-turn state diffs).
  metadata?: Record<string, unknown>;
  [key: string]: any;
}

// --- Input file ---

export interface RawData {
  readonly schema_version?: number;
  readonly name?: string;
  readonly models: Model[];
  readonly metrics: Metric[];
  readonly filters?: string[];
  readonly documents?: RetrievedDocument[];
  readonly tasks: Task[];
  readonly results: ModelResult[];
}

export interface DisqualificationReason {
  kind: string;
  data: any;
}

export interface DisqualifiedTasks {
  [Key: string]: {
    reasons: DisqualificationReason[];
    results: ModelResult[];
  };
}

// --- Data tile ---

export interface TileData {
  readonly name: string;
  readonly exampleId: string;
  readonly models: Model[];
  readonly metrics: Metric[];
  readonly annotators: string[];
  readonly numTasks: number;
  readonly startTimestamp?: number;
  readonly endTimestamp?: number;
}

// --- Processed data ---

export interface Data extends TileData {
  readonly documents?: RetrievedDocument[];
  readonly filters?: string[];
  tasks: Task[];
  readonly results: ModelResult[];
  // True when the source file was silently upgraded to the current schema on load.
  // exportData uses this to show a one-time toast informing the researcher.
  readonly migrated?: boolean;
}

// --- Filtration worker ---

export interface FilterationRequest {
  resultsPerMetric: { [key: string]: ModelResult[] };
  filters: { [key: string]: string[] };
  models: Model[];
  expression?: object;
  agreementLevels?: { [key: string]: number | string }[];
  metric?: Metric;
  allowedValues?: string[];
  annotator?: string;
}

export interface FilterationResponse {
  records: {
    taskId: string;
    modelName: string;
    [key: string]: string | number;
  }[];
  results: ModelResult[];
}
