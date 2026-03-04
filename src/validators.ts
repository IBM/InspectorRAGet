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

function isValidModel(model): boolean {
  if (!model.hasOwnProperty('modelId')) {
    return false;
  }
  if (!model.hasOwnProperty('name')) {
    return false;
  }
  if (!model.hasOwnProperty('owner')) {
    return false;
  }

  return true;
}

// categorical is passed as true when validating values on a categorical metric,
// which requires each entry to also carry a numericValue for aggregation/sorting.
function isValidMetricValue(mval, categorical = false): boolean {
  if (
    !mval.hasOwnProperty('value') ||
    (typeof mval.value !== 'string' && typeof mval.value !== 'number')
  ) {
    return false;
  }
  if (categorical && typeof mval.numericValue !== 'number') {
    return false;
  }
  return true;
}

function isValidMetric(metric): boolean {
  if (!metric.hasOwnProperty('name')) {
    return false;
  }
  if (
    !metric.hasOwnProperty('author') ||
    (metric.author !== 'algorithm' && metric.author !== 'human')
  ) {
    return false;
  }
  if (
    !metric.hasOwnProperty('type') ||
    (metric.type !== 'numerical' &&
      metric.type !== 'categorical' &&
      metric.type !== 'text')
  ) {
    return false;
  }

  // Metric with type "numerical" cannot be aggregated with "majority" aggregator
  if (
    metric.type === 'numerical' &&
    metric.hasOwnProperty('aggregator') &&
    metric.aggregator === 'majority'
  ) {
    return false;
  }
  if (
    metric.type == 'categorical' &&
    (!metric.hasOwnProperty('values') || !metric.values.length)
  ) {
    return false;
  }
  if (
    metric.hasOwnProperty('values') &&
    !metric.values.every((v) =>
      isValidMetricValue(v, metric.type === 'categorical'),
    )
  ) {
    return false;
  }

  return true;
}

function isValidDocument(document): boolean {
  if (!document.hasOwnProperty('documentId')) {
    return false;
  }

  return true;
}

// Current task types. Legacy types (rag, text_generation, json_generation, chat)
// are auto-migrated by migrator.ts before validation of loaded data, but we
// still accept them here so files can be validated before migration runs.
const VALID_TASK_TYPES = new Set([
  'qa',
  'generation',
  'rag',
  'tool_calling',
  'agentic',
  // Legacy names — accepted during validation; processor.ts migrates them on load
  'text_generation',
  'json_generation',
  'chat',
]);

// Task types that require a `contexts` field.
// Only 'qa' (single-turn retrieval) requires contexts.
// The new 'rag' type is multi-turn conversation and does not need contexts at the task level.
const CONTEXTS_REQUIRED_TYPES = new Set(['qa']);

function isValidToolDefinition(tool): boolean {
  if (typeof tool.name !== 'string') {
    return false;
  }
  if (
    tool.hasOwnProperty('parameters') &&
    typeof tool.parameters !== 'object'
  ) {
    return false;
  }
  return true;
}

function isValidTask(task): boolean {
  if (!task.hasOwnProperty('taskId')) {
    return false;
  }

  if (
    !task.hasOwnProperty('taskType') ||
    !VALID_TASK_TYPES.has(task.taskType)
  ) {
    return false;
  }

  if (
    CONTEXTS_REQUIRED_TYPES.has(task.taskType) &&
    !task.hasOwnProperty('contexts')
  ) {
    return false;
  }

  if (!task.hasOwnProperty('input')) {
    return false;
  }

  if (
    task.hasOwnProperty('tools') &&
    (!Array.isArray(task.tools) ||
      !task.tools.every((tool) => isValidToolDefinition(tool)))
  ) {
    return false;
  }

  return true;
}

export function validateInputData(data): { valid: boolean; reasons: string[] } {
  let valid: boolean = true;
  const reasons: string[] = [];

  // Validate models
  if (!data.hasOwnProperty('models')) {
    valid = false;
    reasons.push("Missing mandatory 'models' information.");
  }
  if (
    data.hasOwnProperty('models') &&
    !data.models.every((model) => isValidModel(model))
  ) {
    valid = false;
    reasons.push(
      "One or more models are incorrectly specified. Please refer to 'sample.json' on the format for a model.",
    );
  }

  // Validate metrics
  if (!data.hasOwnProperty('metrics')) {
    valid = false;
    reasons.push("Missing mandatory 'metrics' information.");
  }
  if (
    data.hasOwnProperty('metrics') &&
    !data.metrics.every((metric) => isValidMetric(metric))
  ) {
    valid = false;
    reasons.push(
      "One or more metrics are incorrectly specified. Please refer to 'sample.json' on the format for a metric.",
    );
  }

  // Validate tasks
  if (!data.hasOwnProperty('tasks')) {
    valid = false;
    reasons.push("Missing mandatory 'tasks' information.");
  }
  if (
    data.hasOwnProperty('tasks') &&
    !data.tasks.every((task) => isValidTask(task))
  ) {
    valid = false;
    reasons.push(
      "One or more tasks are incorrectly specified. Please refer to 'sample.json' on the format for a task.",
    );
  }

  // Validate documents: required when any task is type 'qa' or legacy 'rag'
  if (
    data.hasOwnProperty('tasks') &&
    data.tasks.some((task) => CONTEXTS_REQUIRED_TYPES.has(task.taskType)) &&
    !data.hasOwnProperty('documents')
  ) {
    valid = false;
    reasons.push(
      "Missing mandatory 'documents' information when `qa` or `rag` type tasks are included.",
    );
  }
  if (
    data.hasOwnProperty('documents') &&
    !data.documents.every((document) => isValidDocument(document))
  ) {
    valid = false;
    reasons.push(
      "One or more documents are incorrectly specified. Please refer to 'sample.json' on the format for a document.",
    );
  }

  // Validate evaluations
  if (!data.hasOwnProperty('evaluations')) {
    valid = false;
    reasons.push("Missing mandatory 'evaluations' information.");
  }

  return { valid: valid, reasons: reasons };
}
