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
import {
  Button,
  FileUploader,
  CodeSnippet,
  UnorderedList,
  ListItem,
} from '@carbon/react';
import { ArrowLeft, ArrowRight } from '@carbon/icons-react';

import { RawData } from '@/src/types';
import { migrateData } from '@/src/migrator';
import { camelCaseKeys } from '@/src/utilities/objects';
import { validateInputData } from '@/src/validators';
import { useNotification } from '@/src/components/notification/Notification';

import classes from './DataUploader.module.scss';

interface Props {
  onNext: Function;
  onPrev: Function;
}

export default function DataUploaderView({ onNext, onPrev }: Props) {
  const [data, setData] = useState<RawData | undefined>(undefined);
  const [migrated, setMigrated] = useState<boolean>(false);

  const { createNotification } = useNotification();

  return (
    <div className={classes.root}>
      <FileUploader
        labelTitle="Upload file"
        labelDescription="Max file size is 5mb. Only .json files are supported."
        buttonLabel="Add file"
        buttonKind="primary"
        size="md"
        filenameStatus="edit"
        accept={['.json']}
        multiple={false}
        disabled={false}
        iconDescription="Delete file"
        name=""
        onChange={async (event) => {
          const fileReader = new FileReader();
          fileReader.onload = (e) => {
            if (
              e.target &&
              e.target.result &&
              typeof e.target.result === 'string'
            ) {
              try {
                const { data: migratedRaw, migrated: wasMigrated } =
                  migrateData(JSON.parse(e.target.result));
                const fileData = camelCaseKeys(migratedRaw);
                const status = validateInputData(fileData);

                if (status.valid) {
                  createNotification(
                    {
                      kind: 'info',
                      title: 'Upload successful.',
                      subtitle: 'Please process to data verification step.',
                    },
                    2000,
                  );

                  setData(fileData);
                  setMigrated(wasMigrated);
                } else {
                  status.reasons.forEach((reason) => {
                    createNotification({
                      kind: 'error',
                      title: 'Failed to upload file.',
                      subtitle: reason,
                    });
                  }, 10000);

                  setData(undefined);
                }
              } catch (error) {
                createNotification(
                  {
                    kind: 'error',
                    title: 'Failed to upload file.',
                    subtitle:
                      "Please make sure you are uploading a valid JSON file in a 'sample.json' format.",
                  },
                  10000,
                );
                setData(undefined);
              }
            }

            return undefined;
          };

          fileReader.readAsText(event.target.files[0]);
        }}
      />
      <div>
        <h4>Data format</h4>
        <UnorderedList className={classes.schemaNotes}>
          <ListItem>
            <code>documents</code> is required only when tasks include the{' '}
            <code>rag</code> task type.
          </ListItem>
          <ListItem>
            <code>filters</code> is optional, but including it enables filter
            controls in the analysis views.
          </ListItem>
        </UnorderedList>
        <CodeSnippet
          className={classes.dataFormat}
          type="multi"
          feedback="Copied to clipboard"
          maxCollapsedNumberOfRows={30}
        >
          {`{
  "schema_version": 2,
  "name": "Example",
  "models": [
    {
      "model_id": "model_a",
      "name": "Model A",
      "owner": "xyz@company.com"
    },
    {
      "model_id": "model_b",
      "name": "Model B",
      "owner": "abc@company.com"
    }
  ],
  "metrics": [
    {
      "name": "faithfulness",
      "display_name": "Faithfulness",
      "author": "human",
      "type": "categorical",
      "aggregator": "majority",
      "values": [
        { "value": "no", "display_value": "No", "numeric_value": 1 },
        { "value": "mostly no", "display_value": "Mostly No", "numeric_value": 2 },
        { "value": "mostly yes", "display_value": "Mostly Yes", "numeric_value": 3 },
        { "value": "yes", "display_value": "Yes", "numeric_value": 4 }
      ]
    },
    {
      "name": "f1",
      "display_name": "F1 (word level)",
      "author": "algorithm",
      "type": "numerical",
      "range": [0, 100, 10]
    },
    {
      "name": "comments",
      "display_name": "Comments",
      "author": "human",
      "type": "text"
    }
  ],
  "filters": ["category", "ncf_classes"],
  "documents": [
    {
      "document_id": "document_1",
      "text": "Document 1\nThis is a first sample document.",
      "formatted_text": "#Document 1\nThis is a first sample document."
    },
    {
      "document_id": "document_2",
      "text": "Document 2\nThis is a second sample document.",
      "formatted_text": "#Document 2\nThis is a second sample document."
    }
  ],
  "tasks": [
    {
      "task_id": "task_1",
      "task_type": "rag",
      "category": "grounded",
      "ncf_classes": ["answer"],
      "contexts": [{ "document_id": "document_1" }],
      "input": [{ "role": "user", "content": "What is the document number?" }],
      "targets": [{ "type": "text", "value": "The document number is 1." }]
    },
    {
      "task_id": "task_2",
      "task_type": "rag",
      "category": "random",
      "ncf_classes": ["chit-chat"],
      "contexts": [{ "document_id": "document_2" }],
      "input": [{ "role": "user", "content": "Hello" }],
      "targets": [{ "type": "text", "value": "How can I help you?" }]
    }
  ],
  "results": [
    {
      "task_id": "task_1",
      "model_id": "model_a",
      "output": [{ "role": "assistant", "content": "Document number is 1." }],
      "scores": {
        "faithfulness": {
          "annotator_a": { "timestamp": 1694615234, "duration": 102, "value": "yes" },
          "annotator_b": { "timestamp": 1694557952, "duration": 840, "value": "yes" },
          "annotator_c": { "timestamp": 1694551445, "duration": 54, "value": "mostly yes" }
        },
        "f1": {
          "system": { "value": 82.5, "duration": 0 }
        },
        "comments": {
          "annotator_b": { "timestamp": 1694615234, "duration": 102, "value": "Almost identical answer." }
        }
      }
    },
    {
      "task_id": "task_1",
      "model_id": "model_b",
      "output": [{ "role": "assistant", "content": "This is document number 2." }],
      "scores": {
        "faithfulness": {
          "annotator_a": { "timestamp": 1694615234, "duration": 102, "value": "no" },
          "annotator_b": { "timestamp": 1694557952, "duration": 840, "value": "no" },
          "annotator_c": { "timestamp": 1694551445, "duration": 54, "value": "no" }
        },
        "f1": {
          "system": { "value": 67.12, "duration": 0 }
        }
      }
    }
  ]
}`}
        </CodeSnippet>
      </div>
      <div className={classes.navigationButtons}>
        <Button
          kind="secondary"
          renderIcon={ArrowLeft}
          iconDescription="Return to instructions"
          onClick={() => {
            onPrev(data);
          }}
        >
          Return to instructions
        </Button>
        <Button
          disabled={!data}
          renderIcon={ArrowRight}
          iconDescription="Verify data"
          onClick={() => {
            onNext(data, migrated);
          }}
        >
          Verify data
        </Button>
      </div>
    </div>
  );
}
