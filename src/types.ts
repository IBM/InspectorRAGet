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
  ToolCall,
  MessageStep,
  Message,
  SystemMessage,
  DeveloperMessage,
  UserMessage,
  ToolMessageDocument,
  ToolMessage,
  AssistantMessage,
} from '@/src/task-types/rag/types';

import type { RetrievedDocument } from '@/src/task-types/qa/types';
import type { MessageStep } from '@/src/task-types/rag/types';

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

// ===================================================================================
//                                  MODEL
// ===================================================================================
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

// ===================================================================================
//                                  METRIC
// ===================================================================================
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

// ===================================================================================
//                                        TASK
// ===================================================================================
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
}

export interface Task {
  readonly taskId: string;
  readonly taskType: 'qa' | 'generation' | 'rag' | 'tool_calling' | 'agentic';
  readonly contexts?: { readonly documentId: string }[];
  readonly input: any;
  readonly targets?: {
    readonly text?: string;
  }[];
  flagged?: boolean;
  comments?: TaskComment[];
  readonly annotations?: {
    [key: string]: { [key: string]: any };
  };
  [key: string]: any;
}

// ===================================================================================
//                                  TASK EVALUATIONS
// ===================================================================================
export interface Annotation {
  readonly value: string | number;
  readonly timestamp?: number;
  readonly duration?: number;
}

export interface TaskEvaluation {
  readonly taskId: string;
  readonly modelId: string;
  readonly modelResponse: string;
  readonly annotations: {
    [key: string]: { [key: string]: Annotation };
  };
  readonly contexts?: RetrievedDocument[];
  readonly steps?: MessageStep[];
  [key: string]: any;
}

// ===================================================================================
//                                  INPUT FILE
// ===================================================================================
export interface RawData {
  readonly schema_version?: number;
  readonly name?: string;
  readonly models: Model[];
  readonly metrics: Metric[];
  readonly filters?: string[];
  readonly documents?: RetrievedDocument[];
  readonly tasks: Task[];
  readonly evaluations: TaskEvaluation[];
}

export interface DisqualificationReason {
  kind: string;
  data: any;
}

export interface DisqualifiedTasks {
  [Key: string]: {
    reasons: DisqualificationReason[];
    evaluations: TaskEvaluation[];
  };
}

// ===================================================================================
//                                  DATA TILE
// ===================================================================================
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

// ===================================================================================
//                                  PROCESSED DATA
// ===================================================================================
export interface Data extends TileData {
  readonly documents?: RetrievedDocument[];
  readonly filters?: string[];
  tasks: Task[];
  readonly evaluations: TaskEvaluation[];
  // True when the source file was silently upgraded to the current schema on load.
  // exportData uses this to show a one-time toast informing the researcher.
  readonly migrated?: boolean;
}

// ===================================================================================
//                          FILTERATION WORKER
// ===================================================================================
export interface FilterationRequest {
  evaluationsPerMetric: { [key: string]: TaskEvaluation[] };
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
  evaluations: TaskEvaluation[];
}
