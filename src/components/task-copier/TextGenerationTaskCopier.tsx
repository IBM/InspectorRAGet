/**
 *
 * Copyright 2023-2025 InspectorRAGet Team
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

import {
  Metric,
  Model,
  Task,
  RetrievedDocument,
  TaskEvaluation,
} from '@/src/types';
import { WarningAlt } from '@carbon/icons-react';

import classes from './TaskCopier.module.scss';

interface Props {
  models: Model[];
  metrics: Metric[];
  task: Task;
  evaluations: TaskEvaluation[];
  onClose: Function;
  open: boolean;
}

function prepareText(
  models: Model[],
  metrics: Metric[],
  task: Task,
  evaluations: TaskEvaluation[],
): string {
  const separator = '=======================================================\n';
  let input, context, responses;

  // Step 1: Prepare input
  if (typeof task.input === 'string') {
    input = `${separator}Input\n${separator}${task.input.trim()}`;
  }

  // Step 2: Prepare responses
  if (evaluations && evaluations.length) {
    responses = `${separator}Responses\n${separator}`;
    const responseSeparator =
      '\n-------------------------------------------------------\n';
    evaluations.forEach((evaluation) => {
      const model = models.find(
        (entry) => entry.modelId === evaluation.modelId,
      );
      responses += `${model ? model.name.trim() : evaluation.modelId.trim()}${responseSeparator}${evaluation.modelResponse.trim()}\n${separator}`;
    });
  }

  return `${input.trim()}\n${responses ? responses : ''}`;
}

function prepareLaTEXT(
  models: Model[],
  metrics: Metric[],
  task: Task,
  evaluations: TaskEvaluation[],
): string {
  let input, context, responses;

  // Step 1: Prepare input
  if (typeof task.input === 'string') {
    input = `\\multicolumn{1}{|c|}{\\textbf{Input}} \\\\ \n\t\\toprule \n\t${task.input.trim()}  \\\\ \n\t`;
  }

  // Step 2: Prepare responses
  if (evaluations && evaluations.length) {
    responses =
      '\\toprule \n\t\\multicolumn{1}{|c|}{\\textbf{Responses}} \\\\ \n\t';
    evaluations.forEach((evaluation) => {
      const model = models.find(
        (entry) => entry.modelId === evaluation.modelId,
      );
      responses += `\\toprule \n\t\\textbf{${model ? model.name.trim() : evaluation.modelId.trim()}} \\\\ \n\t\\midrule \n\t${evaluation.modelResponse.trim()} \\\\ \n\t`;
    });
    responses += '\\bottomrule \n\t';
  }

  return `\\begin{table*}\n\\small\n\t\\begin{tabular}{p{15.5cm}}\n\t\\toprule\n\t${input}${responses ? responses : ''}\\end{tabular}\n\\end{table*}`;
}

function prepareJSON(
  models: Model[],
  metrics: Metric[],
  task: Task,
  evaluations: TaskEvaluation[],
): string {
  return JSON.stringify(
    {
      input: task.input,
      responses: evaluations.map((evaluation) => {
        const model = models.find(
          (entry) => entry.modelId === evaluation.modelId,
        );
        return {
          model: model ? model.name : evaluation.modelId,
          response: evaluation.modelResponse,
        };
      }),
    },
    null,
    2,
  );
}

export default function TextGenerationTaskCopierModal({
  models,
  metrics,
  task,
  evaluations,
  onClose,
  open = false,
}: Props) {
  const [format, setFormat] = useState<'Text' | 'JSON' | 'LaTEX'>('Text');

  const textToCopy = useMemo(() => {
    let text;
    if (format === 'Text') {
      text = prepareText(models, metrics, task, evaluations);
    } else if (format === 'LaTEX') {
      text = prepareLaTEXT(models, metrics, task, evaluations);
    } else {
      text = prepareJSON(models, metrics, task, evaluations);
    }

    return text;
  }, [models, metrics, task, evaluations, format]);

  return (
    <Modal
      open={open}
      modalLabel="Copy task details to clipboard"
      primaryButtonText="Copy"
      secondaryButtonText="Cancel"
      onRequestSubmit={() => {
        //Step 1: Copy to clipboard
        navigator.clipboard.writeText(textToCopy);

        // Step 2: Close model
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
