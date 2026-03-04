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
  SystemMessage,
  DeveloperMessage,
  UserMessage,
  ToolMessageDocument,
  ToolMessage,
  AssistantMessage,
} from '@/src/task-types/rag/types';
export type { ToolDefinition } from '@/src/task-types/tool_calling/types';

import type { RetrievedDocument } from '@/src/task-types/qa/types';
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
  href: string | null;
  actionText: string | null;
  tag: string | null;
  icon: 'CHART_MULTITYPE' | 'MICROSCOPE' | 'NOODLE_BOWL' | 'BOOK';
  openInNewTab: boolean;
  disabled?: boolean;
}

export interface HomePageAttributes {
  title: string;
  subtitle: string;
  greeting: string;
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

// Represents a single tool call made by a model. Used in both TaskOutput
// (what the model actually called) and TaskTarget (ground-truth expected calls).
// dependsOn references another ToolCallRecord.id for nested/compositional calls
// (e.g. f(g(x)) where the outer call depends on the inner result).
export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: object;
  dependsOn?: string;
}

// --- Step ---

// A single observable step in a model's execution trace.
// Discriminated by 'type' so renderers can handle each case without casting.
// tool_response is always paired with a tool_call via toolCallId.
// Timestamps are optional — present when the researcher captured timing.
export type Step =
  | {
      type: 'thinking';
      id: string;
      content: string;
      startTimestamp?: number;
      endTimestamp?: number;
    }
  | {
      type: 'tool_call';
      id: string;
      toolCallId: string;
      name: string;
      arguments: object;
      startTimestamp?: number;
      endTimestamp?: number;
    }
  | {
      type: 'tool_response';
      id: string;
      toolCallId: string;
      content: string | object;
      startTimestamp?: number;
      endTimestamp?: number;
    }
  | {
      type: 'retrieval';
      id: string;
      documents: RetrievedDocument[];
      startTimestamp?: number;
      endTimestamp?: number;
    }
  | {
      type: 'generation';
      id: string;
      content: string;
      startTimestamp?: number;
      endTimestamp?: number;
    };

// --- Task output ---

// Typed union of what a model can produce. 'text' covers RAG, generation, and
// plain chat responses. 'tool_calls' covers tool-calling and agentic turns.
// Array length on tool_calls encodes cardinality: 1 = single call, >1 = parallel.
export type TaskOutput =
  | { type: 'text'; value: string }
  | { type: 'tool_calls'; calls: ToolCallRecord[] };

// Returns the string value of a TaskOutput, trimmed.
// Call sites that render HTML should additionally pass the result through DOMPurify.sanitize().
export function outputAsText(output: TaskOutput | string): string {
  // Guard for legacy string values that slipped past the migrator (e.g. in tests).
  if (typeof output === 'string') return output.trim();
  return output.type === 'text' ? output.value.trim() : '';
}

// --- Task target ---

// Discriminated union of expected outputs. 'text' covers most task types.
// 'tool_calls' is the ground-truth for tool-calling evaluation.
// 'state' and 'image' are reserved for future agentic and multimodal support.
export type TaskTarget =
  | { type: 'text'; value: string }
  | { type: 'tool_calls'; calls: ToolCallRecord[] }
  | { type: 'state'; description: string } // agentic, future
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
  // Typed output union — 'text' for RAG/generation/chat, 'tool_calls' for tool-calling tasks.
  readonly output: TaskOutput;
  // Metric scores keyed by metric name, then by evaluator/annotator id.
  readonly scores: {
    [key: string]: { [key: string]: Annotation };
  };
  readonly contexts?: RetrievedDocument[];
  // Per-model execution trace. Optional — views degrade gracefully when absent.
  // When auto-constructed from a message thread, the UI shows a caveat.
  readonly modelSteps?: Step[];
  // Evaluation-level comments (e.g. noting an acceptable-but-different tool call).
  // Distinct from task.comments which are task-level observations shared across models.
  comments?: TaskComment[];
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
