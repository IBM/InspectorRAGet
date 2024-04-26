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

function isValidMetricValue(mval): boolean {
  if (
    !mval.hasOwnProperty('value') ||
    (typeof mval.value !== 'string' && typeof mval.value !== 'number')
  ) {
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
    !metric.values.every((v) => isValidMetricValue(v))
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

function isValidTask(task): boolean {
  if (!task.hasOwnProperty('taskId')) {
    return false;
  }

  // FIXME: `question_answering` and `conversation` task types are deprecated and will be removed in future release.
  if (
    !task.hasOwnProperty('taskType') ||
    (task.taskType !== 'question_answering' &&
      task.taskType !== 'conversation' &&
      task.taskType !== 'rag' &&
      task.taskType !== 'text_generation' &&
      task.taskType !== 'json_generation')
  ) {
    return false;
  }

  if (!task.hasOwnProperty('contexts')) {
    return false;
  }

  if (!task.hasOwnProperty('input')) {
    return false;
  }

  return true;
}

export function validateInputData(data): { valid: boolean; reasons: string[] } {
  let valid: boolean = true;
  const reasons: string[] = [];

  // Step : Validate models releated requirements
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

  // Step : Validate metrics releated requirements
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

  // Step : Validate documents releated requirements
  if (!data.hasOwnProperty('documents')) {
    valid = false;
    reasons.push("Missing mandatory 'documents' information.");
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

  // Step : Validate tasks releated requirements
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

  // Step : Validate evaluations releated requirements
  if (!data.hasOwnProperty('evaluations')) {
    valid = false;
    reasons.push("Missing mandatory 'evaluations' information.");
  }

  return { valid: valid, reasons: reasons };
}
