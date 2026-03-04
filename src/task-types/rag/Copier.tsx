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

import { useState, useMemo } from 'react';
import { Modal, RadioTile, CodeSnippet } from '@carbon/react';

import { Metric, Model, Task, ModelResult, outputAsText } from '@/src/types';
import { Message } from '@/src/task-types/rag/types';
import { WarningAlt } from '@carbon/icons-react';

import classes from './Copier.module.scss';

interface Props {
  models: Model[];
  metrics: Metric[];
  task: Task;
  results: ModelResult[];
  onClose: Function;
  open: boolean;
}

function prepareTextForMessage(message: Message) {
  let text = '';

  if (message.role === 'tool') {
    text += JSON.stringify({
      tool_call_id: message['tool_call_id'],
      content: message.content,
    });
  } else if (
    message.role === 'assistant' &&
    message.hasOwnProperty('tool_calls')
  ) {
    text += JSON.stringify(message['tool_calls']);
  } else {
    text +=
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
  }

  return text;
}

function prepareText(
  models: Model[],
  metrics: Metric[],
  task: Task,
  results: ModelResult[],
): string {
  const separator = '=======================================================\n';
  let input, responses;

  input = `${separator}Input\n${separator}`;
  if (Array.isArray(task.input)) {
    task.input.map(
      (message) =>
        (input += `${message.role}: ${prepareTextForMessage(message)}\n`),
    );
  }

  if (results && results.length) {
    responses = `${separator}Responses\n${separator}`;
    const responseSeparator =
      '\n-------------------------------------------------------\n';
    results.forEach((evaluation) => {
      const model = models.find(
        (entry) => entry.modelId === evaluation.modelId,
      );
      responses += `${model ? model.name.trim() : evaluation.modelId.trim()}${responseSeparator}${outputAsText(evaluation.output)}\n${separator}`;
    });
  }

  return `${input.trim()}\n${responses ? responses : ''}`;
}

function prepareLaTEXT(
  models: Model[],
  metrics: Metric[],
  task: Task,
  results: ModelResult[],
): string {
  let input, responses;

  input =
    '\\multicolumn{1}{|c|}{\\textbf{Conversation}} \\\\ \n\t\\toprule \n\t';
  if (Array.isArray(task.input)) {
    task.input.map(
      (message) =>
        (input += `\\textbf{${
          message.role
        }}: ${prepareTextForMessage(message)} \\\\ \n\t`),
    );
  }

  if (results && results.length) {
    responses =
      '\\toprule \n\t\\multicolumn{1}{|c|}{\\textbf{Responses}} \\\\ \n\t';
    results.forEach((evaluation) => {
      const model = models.find(
        (entry) => entry.modelId === evaluation.modelId,
      );
      responses += `\\toprule \n\t\\textbf{${model ? model.name.trim() : evaluation.modelId.trim()}} \\\\ \n\t\\midrule \n\t${outputAsText(evaluation.output)} \\\\ \n\t`;
    });
    responses += '\\bottomrule \n\t';
  }

  return `\\begin{table*}\n\\small\n\t\\begin{tabular}{p{15.5cm}}\n\t\\toprule\n\t${input}${responses ? responses : ''}\\end{tabular}\n\\end{table*}`;
}

function prepareJSON(
  models: Model[],
  metrics: Metric[],
  task: Task,
  results: ModelResult[],
): string {
  return JSON.stringify(
    {
      input: task.input,
      responses: results.map((evaluation) => {
        const model = models.find(
          (entry) => entry.modelId === evaluation.modelId,
        );
        return {
          model: model ? model.name : evaluation.modelId,
          response: evaluation.output,
        };
      }),
    },
    null,
    2,
  );
}

export default function RAGCopierModal({
  models,
  metrics,
  task,
  results,
  onClose,
  open = false,
}: Props) {
  const [format, setFormat] = useState<'Text' | 'JSON' | 'LaTEX'>('Text');

  const textToCopy = useMemo(() => {
    let text;
    if (format === 'Text') {
      text = prepareText(models, metrics, task, results);
    } else if (format === 'LaTEX') {
      text = prepareLaTEXT(models, metrics, task, results);
    } else {
      text = prepareJSON(models, metrics, task, results);
    }

    return text;
  }, [models, metrics, task, results, format]);

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
            id={'formatSelector--text'}
            value={'Text'}
            checked={format === 'Text'}
            onClick={() => {
              setFormat('Text');
            }}
          >
            Text
          </RadioTile>
          <RadioTile
            id={'formatSelector--json'}
            value={'JSON'}
            checked={format === 'JSON'}
            onClick={() => {
              setFormat('JSON');
            }}
          >
            JSON
          </RadioTile>
          <RadioTile
            id={'formatSelector--latex'}
            value={'LaTex'}
            checked={format === 'LaTEX'}
            onClick={() => {
              setFormat('LaTEX');
            }}
          >
            LaTex
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
        {format === 'LaTEX' && (
          <div className={classes.warningContainer}>
            <WarningAlt />
            <span>&nbsp;Please make sure you add booktab package via</span>
            <CodeSnippet type={'inline'}>
              {'\\usepackage{booktabs}'}
            </CodeSnippet>
            <span> to your LaTEX project.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
