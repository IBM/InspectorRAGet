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

'use client';

import { useState } from 'react';
import { Select, SelectItem, TextInput, TextArea } from '@carbon/react';

import { Task, ToolDefinition, CommentFinding } from '@/src/types';

// ===================================================================================
//                               TYPES
// ===================================================================================
interface Props {
  taskType?: Task['taskType'];
  tools?: ToolDefinition[];
  value: CommentFinding | undefined;
  onChange: (finding: CommentFinding | undefined) => void;
}

// Finding types available per task type. 'note' is always included.
const FINDING_OPTIONS: Record<string, { id: string; label: string }[]> = {
  tool_calling: [
    { id: 'tool_call', label: 'Tool call' },
    { id: 'note', label: 'Note' },
  ],
  rag: [
    { id: 'query', label: 'Query' },
    { id: 'note', label: 'Note' },
  ],
  qa: [
    { id: 'query', label: 'Query' },
    { id: 'output', label: 'Output' },
    { id: 'note', label: 'Note' },
  ],
  generation: [
    { id: 'output', label: 'Output' },
    { id: 'note', label: 'Note' },
  ],
  agentic: [{ id: 'note', label: 'Note' }],
};

const DEFAULT_OPTIONS = [{ id: 'note', label: 'Note' }];

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function CommentFindingEditor({
  taskType,
  tools,
  value,
  onChange,
}: Props) {
  // Track whether the JSON arguments field contains invalid JSON so we can warn
  // without blocking submission.
  const [argsInvalid, setArgsInvalid] = useState(false);

  const options = taskType
    ? (FINDING_OPTIONS[taskType] ?? DEFAULT_OPTIONS)
    : DEFAULT_OPTIONS;

  function handleTypeChange(selectedType: string) {
    if (!selectedType) {
      onChange(undefined);
      return;
    }
    // Build the minimal valid shape for the chosen finding type.
    if (selectedType === 'tool_call') {
      onChange({ type: 'tool_call', functionName: '' });
    } else if (selectedType === 'query') {
      onChange({ type: 'query', query: '' });
    } else if (selectedType === 'output') {
      onChange({ type: 'output', output: '' });
    } else {
      onChange({ type: 'note', text: '' });
    }
    setArgsInvalid(false);
  }

  return (
    <div>
      <Select
        id="finding-type-select"
        labelText="Finding type"
        value={value?.type ?? ''}
        onChange={(e) => handleTypeChange(e.target.value)}
      >
        <SelectItem value="" text="— none —" />
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id} text={opt.label} />
        ))}
      </Select>

      {value?.type === 'tool_call' && (
        <>
          {tools && tools.length > 0 ? (
            <Select
              id="finding-function-select"
              labelText="Function name"
              value={value.functionName}
              onChange={(e) =>
                onChange({ ...value, functionName: e.target.value })
              }
            >
              <SelectItem value="" text="— select function —" />
              {tools.map((t) => (
                <SelectItem key={t.name} value={t.name} text={t.name} />
              ))}
            </Select>
          ) : (
            <TextInput
              id="finding-function-input"
              labelText="Function name"
              value={value.functionName}
              onChange={(e) =>
                onChange({ ...value, functionName: e.target.value })
              }
            />
          )}
          <TextArea
            id="finding-arguments-input"
            labelText="Arguments (JSON)"
            rows={3}
            value={
              value.arguments ? JSON.stringify(value.arguments, null, 2) : ''
            }
            invalid={argsInvalid}
            invalidText="Invalid JSON — will be ignored on submit"
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                setArgsInvalid(false);
                onChange({ ...value, arguments: undefined });
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                setArgsInvalid(false);
                onChange({ ...value, arguments: parsed });
              } catch {
                setArgsInvalid(true);
                // Keep current valid arguments; don't overwrite with unparseable input
              }
            }}
          />
        </>
      )}

      {value?.type === 'query' && (
        <TextInput
          id="finding-query-input"
          labelText="Query"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
        />
      )}

      {value?.type === 'output' && (
        <>
          <TextArea
            id="finding-output-input"
            labelText="Output"
            rows={3}
            value={value.output}
            onChange={(e) => onChange({ ...value, output: e.target.value })}
          />
          <TextInput
            id="finding-format-input"
            labelText="Format (optional)"
            value={value.format ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                format: e.target.value || undefined,
              })
            }
          />
        </>
      )}

      {value?.type === 'note' && (
        <TextArea
          id="finding-note-input"
          labelText="Note"
          rows={3}
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      )}
    </div>
  );
}
