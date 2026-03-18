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

import { useMemo, useState } from 'react';
import { Modal, RadioTile, CodeSnippet } from '@carbon/react';

import {
  Metric,
  Model,
  Task,
  ModelResult,
  ToolCallRecord,
  ToolDefinition,
} from '@/src/types';

import classes from './Copier.module.scss';

// --- Types ---

interface Props {
  models: Model[];
  metrics: Metric[];
  task: Task;
  results: ModelResult[];
  onClose: Function;
  open: boolean;
}

// --- Helpers ---

// Formats a tool call as a readable function signature: get_weather(city="Boston", unit="fahrenheit")
function formatCallSignature(call: ToolCallRecord): string {
  const args = Object.entries(call.arguments)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  return `${call.name}(${args})`;
}

function formatToolDefinition(tool: ToolDefinition): string {
  const params = tool.parameters?.properties
    ? Object.entries(tool.parameters.properties)
        .map(([name, def]) => {
          const required = tool.parameters?.required?.includes(name) ? '*' : '';
          return `  ${required}${name}: ${def.type ?? 'any'}${def.description ? ` — ${def.description}` : ''}`;
        })
        .join('\n')
    : '  (no parameters)';
  return `${tool.name}${tool.description ? ` — ${tool.description}` : ''}\n${params}`;
}

function prepareText(
  models: Model[],
  task: Task,
  results: ModelResult[],
): string {
  const sep = '=======================================================\n';
  const subsep = '-------------------------------------------------------\n';

  let text = `${sep}Input\n${sep}`;

  if (Array.isArray(task.input)) {
    task.input.forEach((msg) => {
      text += `${msg.role}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}\n`;
    });
  } else if (typeof task.input === 'string') {
    text += `${task.input}\n`;
  }

  if (task.tools && task.tools.length > 0) {
    text += `\n${sep}Available Tools\n${sep}`;
    task.tools.forEach((tool) => {
      text += `${formatToolDefinition(tool)}\n${subsep}`;
    });
  }

  if (task.targets && task.targets.length > 0) {
    text += `\n${sep}Expected Output\n${sep}`;
    task.targets.forEach((target, i) => {
      if (target.type === 'tool_calls') {
        text += `Target ${i + 1}:\n`;
        target.calls.forEach((call) => {
          text += `  ${formatCallSignature(call)}\n`;
          if (call.dependsOn) text += `    (depends on: ${call.dependsOn})\n`;
        });
      } else if (target.type === 'text') {
        text += `Target ${i + 1}: ${target.value}\n`;
      }
    });
  }

  if (results && results.length > 0) {
    text += `\n${sep}Model Outputs\n${sep}`;
    results.forEach((result) => {
      const model = models.find((m) => m.modelId === result.modelId);
      const label = model ? model.name.trim() : result.modelId.trim();
      text += `${label}\n${subsep}`;
      const msg = result.output[0];
      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        msg.tool_calls.forEach((call) => {
          text += `${formatCallSignature(call)}\n`;
          if (call.dependsOn) text += `  (depends on: ${call.dependsOn})\n`;
        });
      } else {
        text += `${msg?.content ?? ''}\n`;
      }
      text += `${sep}`;
    });
  }

  return text.trim();
}

function prepareJSON(
  models: Model[],
  task: Task,
  results: ModelResult[],
): string {
  return JSON.stringify(
    {
      input: task.input,
      tools: task.tools ?? [],
      targets: task.targets ?? [],
      results: results.map((result) => {
        const model = models.find((m) => m.modelId === result.modelId);
        return {
          model: model ? model.name : result.modelId,
          output: result.output,
        };
      }),
    },
    null,
    2,
  );
}

// --- Main component ---

export default function ToolCallingCopier({
  models,
  metrics,
  task,
  results,
  onClose,
  open = false,
}: Props) {
  const [format, setFormat] = useState<'Text' | 'JSON'>('Text');

  const textToCopy = useMemo(() => {
    return format === 'Text'
      ? prepareText(models, task, results)
      : prepareJSON(models, task, results);
  }, [models, task, results, format]);

  return (
    <Modal
      open={open}
      modalLabel="Copy task details to clipboard"
      primaryButtonText="Copy"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        navigator.clipboard.writeText(textToCopy);
        onClose();
      }}
      onRequestClose={() => {
        onClose();
      }}
    >
      <div className={classes.container}>
        <span className={classes.heading}>Select a format</span>
        <div className={classes.copyFormatSelectors}>
          <RadioTile
            id="tc-formatSelector--text"
            value="Text"
            checked={format === 'Text'}
            onClick={() => setFormat('Text')}
          >
            Text
          </RadioTile>
          <RadioTile
            id="tc-formatSelector--json"
            value="JSON"
            checked={format === 'JSON'}
            onClick={() => setFormat('JSON')}
          >
            JSON
          </RadioTile>
        </div>
        <span className={classes.heading}>Preview</span>
        <CodeSnippet
          type="multi"
          hideCopyButton={true}
          wrapText={true}
          className={classes.previewBox}
        >
          {textToCopy}
        </CodeSnippet>
      </div>
    </Modal>
  );
}
