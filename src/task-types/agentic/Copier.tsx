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

import { Metric, Model, Task, ModelResult, ToolCallRecord } from '@/src/types';
import { Message } from '@/src/task-types/rag/types';

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

function formatMessage(msg: Message): string {
  const role = msg.role.toUpperCase();
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const calls = msg.tool_calls
      .map((c: ToolCallRecord) => `  ${c.name}(${JSON.stringify(c.arguments)})`)
      .join('\n');
    return `[${role}]\n${calls}`;
  }
  return `[${role}] ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`;
}

function prepareText(
  models: Model[],
  task: Task,
  results: ModelResult[],
): string {
  const sep = '=======================================================\n';
  const subsep = '-------------------------------------------------------\n';

  let text = `${sep}Goal\n${sep}`;
  if (Array.isArray(task.input) && task.input.length > 0) {
    const last = task.input[task.input.length - 1];
    text += `${typeof last.content === 'string' ? last.content : JSON.stringify(last.content)}\n`;
  }

  if (task.targets && task.targets.length > 0) {
    text += `\n${sep}Target State\n${sep}`;
    task.targets.forEach((target, i) => {
      if (target.type === 'text') {
        text += `Target ${i + 1}: ${target.value}\n`;
      } else if (target.type === 'state') {
        text += `Target ${i + 1} (state):\n${JSON.stringify(target.value, null, 2)}\n`;
      } else if (target.type === 'tool_calls') {
        text += `Target ${i + 1} (calls):\n`;
        target.calls.forEach((c: ToolCallRecord) => {
          text += `  ${c.name}(${JSON.stringify(c.arguments)})\n`;
        });
      }
    });
  }

  if (results && results.length > 0) {
    text += `\n${sep}Execution Traces\n${sep}`;
    results.forEach((result) => {
      const model = models.find((m) => m.modelId === result.modelId);
      text += `${model?.name ?? result.modelId}\n${subsep}`;
      result.output.forEach((msg) => {
        text += `${formatMessage(msg as Message)}\n`;
      });
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
      goal: task.input,
      contexts: task.contexts ?? [],
      targets: task.targets ?? [],
      tools: task.tools ?? [],
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

export default function AgenticCopier({
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
            id="agentic-formatSelector--text"
            value="Text"
            checked={format === 'Text'}
            onClick={() => setFormat('Text')}
          >
            Text
          </RadioTile>
          <RadioTile
            id="agentic-formatSelector--json"
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
