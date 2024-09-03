/**
 *
 * Copyright 2023-2024 InspectorRAGet Team
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

export interface DocumentAnnotation {
  text: string;
  authors: string[];
  color?: string;
}

export interface Document {
  documentId: string;
  text: string;
  formattedText?: string;
  url?: string;
  title?: string;
  score?: number;
  query?: {};
  annotations?: DocumentAnnotation[];
}

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

// FIXME: `question_answering` and `conversation` task types are deprecated and will be removed in future release.
export interface Task {
  readonly taskId: string;
  readonly taskType:
    | 'question_answering'
    | 'conversation'
    | 'rag'
    | 'text_generation'
    | 'json_generation';
  readonly contexts: { readonly documentId: string }[];
  readonly input: { text: string; speaker: string }[] | string;
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
  readonly contexts?: Document[];
  [key: string]: any;
}

export interface RawData {
  readonly name?: string;
  readonly models: Model[];
  readonly metrics: Metric[];
  readonly filters?: string[];
  readonly documents?: Document[];
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

export interface Data extends TileData {
  readonly documents?: Document[];
  readonly filters?: string[];
  tasks: Task[];
  readonly evaluations: TaskEvaluation[];
}
