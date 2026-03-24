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

// Schema version release history.
// Freeze a migration once its target version ships to production.
// Until released, you may fold additional changes into the pending migration.
// | Version | Released   | Notes                                                     |
// |---------|------------|-----------------------------------------------------------|
// | 1       | (implicit) | Initial schema — all files without schema_version field   |
// | 2       | (pending)  | Task type rename: rag→qa/rag, text_generation/            |
// |         |            | json_generation→generation, chat→rag.                     |
// |         |            | Evaluation renames: annotations→scores,                   |
// |         |            | modelResponse→output:[{role:'assistant',content:value}].  |
// |         |            | Task targets: {text}→{type:'text',value}.                 |
// |         |            | Top-level key rename: evaluations→results.                |
export const CURRENT_SCHEMA_VERSION = 2;

// --- Migration functions ---

function migrateV1toV2(raw: Record<string, any>): Record<string, any> {
  const result = JSON.parse(JSON.stringify(raw));

  // Rename task types to the v2 taxonomy.
  // Old single-turn 'rag' (string input or speaker-utterance array) → 'qa'.
  // Old multi-turn 'rag' (OpenAI message array with 'role' field) → 'rag'.
  // 'text_generation' and 'json_generation' collapse into 'generation'.
  // 'chat' (OpenAI message format) → 'rag'.
  for (const task of result.tasks ?? []) {
    if (task.task_type === 'rag') {
      const input = task.input;
      const isMultiTurn =
        Array.isArray(input) &&
        input.length > 0 &&
        typeof input[0] === 'object' &&
        'role' in input[0];
      task.task_type = isMultiTurn ? 'rag' : 'qa';
    } else if (
      task.task_type === 'text_generation' ||
      task.task_type === 'json_generation'
    ) {
      task.task_type = 'generation';
    } else if (task.task_type === 'chat') {
      task.task_type = 'rag';
    }

    // Wrap legacy flat targets ({text}) into the TaskTarget discriminated union.
    if (Array.isArray(task.targets)) {
      task.targets = task.targets.map((t: Record<string, any>) => {
        // Already migrated or authored in v2 format — leave as-is.
        if (t.type !== undefined) return t;
        return { type: 'text', value: t.text ?? '' };
      });
    }
  }

  // Rename evaluation fields.
  // annotations → scores (the old name conflated metric scores with annotation activity).
  // modelResponse → output:[{role:'assistant', content:value}] (Message array).
  // Rename top-level evaluations array to results.
  if (result.evaluations !== undefined && result.results === undefined) {
    result.results = result.evaluations;
    delete result.evaluations;
  }

  for (const evaluation of result.results ?? []) {
    if (
      evaluation.annotations !== undefined &&
      evaluation.scores === undefined
    ) {
      evaluation.scores = evaluation.annotations;
      delete evaluation.annotations;
    }

    if (
      evaluation.model_response !== undefined &&
      evaluation.output === undefined
    ) {
      evaluation.output = [
        { role: 'assistant', content: evaluation.model_response },
      ];
      delete evaluation.model_response;
    }
  }

  // Rename steps → trace on all messages and strip old step type variants.
  // The old 'thinking', 'tool_call', 'tool_response', 'retrieval', 'generation'
  // step types were only ever written by the BFCL single-turn converter (now removed).
  // Any message with a 'steps' field gets it renamed to 'trace', and entries with
  // unrecognised types are stripped so the UI never sees the old shape.
  const VALID_TRACE_TYPES = new Set([
    'invocation',
    'tool_execution',
    'observation',
  ]);

  function migrateMessageSteps(msg: Record<string, any>) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.steps !== undefined && msg.trace === undefined) {
      const filtered = Array.isArray(msg.steps)
        ? msg.steps.filter((s: any) => VALID_TRACE_TYPES.has(s?.type))
        : [];
      if (filtered.length > 0) {
        msg.trace = filtered;
      }
      delete msg.steps;
    }
  }

  for (const task of result.tasks ?? []) {
    if (Array.isArray(task.input)) {
      for (const msg of task.input) migrateMessageSteps(msg);
    }
  }

  for (const evaluation of result.results ?? []) {
    if (Array.isArray(evaluation.output)) {
      for (const msg of evaluation.output) migrateMessageSteps(msg);
    }
  }

  result.schema_version = 2;
  return result;
}

// [fromVersion, toVersion, transformFn] — append a new row for each future version.
const MIGRATIONS: [
  number,
  number,
  (raw: Record<string, any>) => Record<string, any>,
][] = [[1, 2, migrateV1toV2]];

// --- Exported function ---

export function migrateData(raw: Record<string, any>): {
  data: Record<string, any>;
  migrated: boolean;
} {
  const version: number = raw.schema_version ?? 1;

  if (version >= CURRENT_SCHEMA_VERSION) {
    return { data: raw, migrated: false };
  }

  let data = raw;
  for (const [from, , transform] of MIGRATIONS) {
    if ((data.schema_version ?? 1) === from) {
      data = transform(data);
    }
  }

  return { data, migrated: true };
}
