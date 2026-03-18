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

import { Model, TaskCommentProvenance } from '@/src/types';

export interface ProvenanceTagResult {
  // Primary pill: always present — encodes the broad location (model name, "Input", etc.)
  primary: [label: string, type: string];
  // Detail pills: only set for score cells — [metric, annotator] as separate pills.
  // Kept separate so callers can lay them out differently (inline vs. stacked).
  detail?: [metric: string, annotator: string];
}

/**
 * Derives display pills from a comment provenance component string.
 *
 *   input / messages        → primary: "Input"    (purple)
 *   document_{id}           → primary: "Contexts" (cyan)
 *   {modelId}::evaluation::scores::{metric}::{annotator}
 *                           → primary: "{model}"  (green)  +  detail: [metric, annotator]
 *   {modelId}::evaluation:: → primary: "{model}"  (green)
 *   {modelId}::steps::{stepId}
 *                           → primary: "{model}"  (green)  +  detail: ["step", stepId]
 *   target                  → primary: "Target"   (teal)
 *   undefined / other       → primary: "Generic"  (gray)
 */
export function provenanceTag(
  provenance: TaskCommentProvenance | undefined,
  models: Map<string, Model> | undefined,
): ProvenanceTagResult {
  if (!provenance) return { primary: ['Generic', 'gray'] };

  const c = provenance.component;

  if (c.includes('input') || c.includes('messages')) {
    return { primary: ['Input', 'purple'] };
  }

  if (c.includes('document_')) {
    return { primary: ['Contexts', 'cyan'] };
  }

  if (c.includes('::evaluation::')) {
    const parts = c.split('::');
    const modelName = models?.get(parts[0])?.name || parts[0];
    // Fully-qualified score cell: modelId::evaluation::scores::metricName::annotator
    if (parts[2] === 'scores' && parts[3] && parts[4]) {
      return {
        primary: [modelName, 'green'],
        detail: [parts[3], parts[4]],
      };
    }
    return { primary: [modelName, 'green'] };
  }

  if (c.includes('::steps::')) {
    const parts = c.split('::');
    const modelName = models?.get(parts[0])?.name || parts[0];
    return { primary: [modelName, 'green'], detail: ['step', parts[2]] };
  }

  if (c === 'target') {
    return { primary: ['Target', 'teal'] };
  }

  return { primary: ['Generic', 'gray'] };
}
