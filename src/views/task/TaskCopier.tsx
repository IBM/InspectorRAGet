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

'use client';

import { useState, useMemo } from 'react';
import { Modal, RadioTile, CodeSnippet } from '@carbon/react';

import { Metric, Model, Task, Document, TaskEvaluation } from '@/src/types';
import { WarningAlt } from '@carbon/icons-react';

import classes from './TaskCopier.module.scss';

interface Props {
  models: Model[];
  metrics: Metric[];
  task: Task;
  evaluations: TaskEvaluation[];
  onClose: Function;
  open: boolean;
  documents?: Document[];
}

function prepareText(
  models: Model[],
  metrics: Metric[],
  task: Task,
  evaluations: TaskEvaluation[],
  documents?: Document[],
): string {
  const separator = '=======================================================\n';
  let input, context, responses;

  // Step 1: Prepare input
  if (task.taskType === 'text_generation' && typeof task.input === 'string') {
    input = `${separator}Input\n${separator}${task.input.trim()}`;
  } else if (task.taskType === 'rag') {
    if (typeof task.input === 'string') {
      input = `${separator}Question: ${task.input.trim()}`;
    } else if (Array.isArray(task.input)) {
      if (task.input.length == 1) {
        input = `${separator}Question: ${task.input[0]['text'].trim()}`;
      } else {
        input = `${separator}Conversation\n${separator}`;
        task.input.map(
          (utterance) =>
            (input += `${
              utterance.speaker.charAt(0).toUpperCase() +
              utterance.speaker.slice(1).toLowerCase()
            }: ${utterance.text.trim()}\n`),
        );
      }
    }
  }

  // Step 2: Prepare context
  if (documents && documents.length) {
    context = `${separator}Contexts\n${separator}`;
    if (documents.length > 1) {
      documents.forEach((document, documentIdx) => {
        context += `Passage ${documentIdx + 1}: ${document.text.trim()}\n`;
      });
    } else {
      context += `Passage: ${documents[0].text.trim()}\n`;
    }
  }

  // Step 3: Prepare responses
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

  return `${input.trim()}\n${context ? context.trim() + '\n' : ''}${responses ? responses : ''}`;
}

function prepareLaTEXT(
  models: Model[],
  metrics: Metric[],
  task: Task,
  evaluations: TaskEvaluation[],
  documents?: Document[],
): string {
  let input, context, responses;

  // Step 1: Prepare input
  if (task.taskType === 'text_generation' && typeof task.input === 'string') {
    input = `\\multicolumn{1}{|c|}{\\textbf{Input}} \\\\ \n\t\\toprule \n\t${task.input.trim()}  \\\\ \n\t`;
  } else if (task.taskType === 'rag') {
    if (typeof task.input === 'string') {
      input = `\\textbf{Question:} ${task.input.trim()} \\\\ \n\t`;
    } else if (Array.isArray(task.input)) {
      if (task.input.length == 1) {
        input = `\\textbf{Question:} ${task.input[0]['text'].trim()} \\\\ \n\t`;
      } else {
        input =
          '\\multicolumn{1}{|c|}{\\textbf{Conversation}} \\\\ \n\t\\toprule \n\t';
        {
          task.input.map(
            (utterance) =>
              (input += `\\textbf{${
                utterance.speaker.charAt(0).toUpperCase() +
                utterance.speaker.slice(1).toLowerCase()
              }}: ${utterance.text.trim()} \\\\ \n\t`),
          );
        }
      }
    }
  }

  // Step 2: Prepare context
  if (documents && documents.length) {
    if (documents.length > 1) {
      context =
        '\\toprule \n\t\\multicolumn{1}{|c|}{\\textbf{Passages}} \\\\ \n\t';
      documents.forEach((document, documentIdx) => {
        context += `\\toprule \n\t\\textbf{Passage ${documentIdx + 1}} \\\\ \n\t\\midrule \n\t${document.text.trim()} \\\\ \n\t`;
      });
    } else {
      context = `\\toprule \n\t\\multicolumn{1}{|c|}{\\textbf{Passage}} \\\\ \n\t\\toprule \\\\ \n\t${documents[0].text.trim()} \\\\ \n\t`;
    }
  }

  // Step 3: Prepare responses
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

  return `\\begin{table*}\n\\small\n\t\\begin{tabular}{p{15.5cm}}\n\t\\toprule\n\t${input}${context ? context : ''}${responses ? responses : ''}\\end{tabular}\n\\end{table*}`;
}

function prepareJSON(
  models: Model[],
  metrics: Metric[],
  task: Task,
  evaluations: TaskEvaluation[],
  documents?: Document[],
): string {
  return JSON.stringify(
    {
      input: task.input,
      ...(documents && { passages: documents }),
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

export default function TaskCopierModal({
  models,
  metrics,
  task,
  evaluations,
  onClose,
  open = false,
  documents,
}: Props) {
  const [format, setFormat] = useState<'Text' | 'JSON' | 'LaTEX'>('Text');

  const textToCopy = useMemo(() => {
    let text;
    if (format === 'Text') {
      text = prepareText(models, metrics, task, evaluations, documents);
    } else if (format === 'LaTEX') {
      text = prepareLaTEXT(models, metrics, task, evaluations, documents);
    } else {
      text = prepareJSON(models, metrics, task, evaluations, documents);
    }

    return text;
  }, [models, metrics, task, evaluations, documents, format]);

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
          multi
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
