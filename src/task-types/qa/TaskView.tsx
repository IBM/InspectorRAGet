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

import { isEmpty } from 'lodash';
import DOMPurify from 'dompurify';
import parse from 'html-react-parser';
import { useMemo, useState } from 'react';
import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Button,
  ContainedList,
  ContainedListItem,
} from '@carbon/react';
import { TextHighlight, WarningAlt } from '@carbon/icons-react';

import {
  Model,
  ModelResult,
  StringMatchObject,
  Task,
  Metric,
  outputAsText,
} from '@/src/types';
import {
  RetrievedDocument,
  RetrievedDocumentAnnotation,
} from '@/src/task-types/qa/types';
import { useDataStore } from '@/src/store';
import { truncate, overlaps } from '@/src/utilities/strings';
import { mark } from '@/src/utilities/highlighter';

import DocumentPanel from '@/src/views/document/DocumentPanel';
import AnnotationsTable from '@/src/views/annotations-table/AnnotationsTable';
import QACopier from '@/src/task-types/qa/Copier';

import classes from './TaskView.module.scss';

// --- Types ---

interface Props {
  task: Task;
  models: Map<string, Model>;
  metrics: Metric[];
  taskCopierModalOpen: boolean;
  setTaskCopierModalOpen: Function;
  updateCommentProvenance: Function;
}

// --- Main component ---

export default function QATaskView({
  task,
  models,
  metrics,
  taskCopierModalOpen,
  setTaskCopierModalOpen,
  updateCommentProvenance,
}: Props) {
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);
  const [showOverlap, setShowOverlap] = useState<boolean>(false);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState<number>(0);

  const { item: data } = useDataStore();

  const [documentsPerResult, results] = useMemo(() => {
    const contextsPerResult: RetrievedDocument[][] = [];

    let taskResults: ModelResult[] | undefined = undefined;
    if (data) {
      taskResults = data.results.filter(
        (result) => result.taskId === task.taskId,
      );

      // Identify context documents for each result and compute context-response overlaps
      taskResults.forEach((result) => {
        const contextDocuments: RetrievedDocument[] = [];
        const contexts = result.contexts
          ? result.contexts
          : task.contexts
            ? task.contexts
            : [];
        if (!isEmpty(contexts)) {
          contexts.forEach((context, contextIdx) => {
            if (data.documents) {
              const referenceDocument = data.documents.find(
                (document) => document.documentId === context.documentId,
              );
              if (referenceDocument) {
                // Attach context-relevance annotations when present
                if (
                  task?.annotations &&
                  task.annotations.hasOwnProperty('context_relevance')
                ) {
                  const documentAnnotation: RetrievedDocumentAnnotation = {
                    text: 'Relevant',
                    authors: [],
                    color: 'green',
                  };
                  for (const [annotator, annotations] of Object.entries(
                    task.annotations.context_relevance,
                  )) {
                    if (
                      Array.isArray(annotations) &&
                      annotations.includes(contextIdx)
                    ) {
                      documentAnnotation.authors.push(annotator);
                    }
                  }
                  if (!isEmpty(documentAnnotation.authors)) {
                    referenceDocument.annotations = [documentAnnotation];
                  }
                }

                contextDocuments.push(referenceDocument);
              } else {
                contextDocuments.push({
                  documentId: context.documentId,
                  text: 'Missing document text',
                });
              }
            } else {
              contextDocuments.push({
                documentId: context.documentId,
                text: 'Missing document text',
              });
            }
          });
        }

        // Compute context-response overlap and attach to result for highlight support
        const textOverlaps: StringMatchObject[][] = [];
        contextDocuments.forEach((contextDocument) => {
          textOverlaps.push(
            overlaps(outputAsText(result.output), contextDocument.text),
          );
        });

        result.overlaps = textOverlaps;

        contextsPerResult.push(contextDocuments);
      });
    }

    return [contextsPerResult, taskResults];
  }, [task.taskId, task.contexts, task.annotations, data]);

  const [hMetrics, aMetrics] = useMemo(() => {
    const humanMetrics = new Map(
      metrics
        ?.filter((metric) => metric.author === 'human')
        .map((metric) => [metric.name, metric]),
    );
    const algorithmicMetrics = new Map(
      metrics
        ?.filter((metric) => metric.author === 'algorithm')
        .map((metric) => [metric.name, metric]),
    );

    return [humanMetrics, algorithmicMetrics];
  }, [metrics]);

  return (
    <>
      {models && metrics && task && results && (
        <QACopier
          open={taskCopierModalOpen}
          models={Array.from(models.values())}
          metrics={metrics}
          task={task}
          results={results}
          documents={documentsPerResult[selectedResultIndex]}
          onClose={() => {
            setTaskCopierModalOpen(false);
          }}
        ></QACopier>
      )}

      {task && models && results && (
        <>
          <div className={classes.inputContainer}>
            <div
              className={
                Array.isArray(task.input) && task.input.length > 1
                  ? classes.conversationContainer
                  : classes.questionContainer
              }
            >
              {typeof task.input === 'string' ? (
                <>
                  <div className={classes.header}>
                    <h4>Question</h4>
                  </div>
                  <div
                    className={classes.questionTextContainer}
                    onMouseDown={() => {
                      updateCommentProvenance('input');
                    }}
                    onMouseUp={() => updateCommentProvenance('input')}
                  >
                    {task.input}
                  </div>
                </>
              ) : Array.isArray(task.input) ? (
                <>
                  <div className={classes.header}>
                    <h4>Conversation</h4>
                  </div>
                  <div
                    className={classes.conversationUtteranceContainer}
                    onMouseDown={() => {
                      updateCommentProvenance('input');
                    }}
                    onMouseUp={() => updateCommentProvenance('input')}
                  >
                    {task.input.map((utterance, idx) => (
                      <span key={'uttereance-' + idx}>
                        <strong>
                          {utterance.speaker.charAt(0).toUpperCase() +
                            utterance.speaker.slice(1).toLowerCase()}
                        </strong>
                        : {utterance.text}
                      </span>
                    ))}
                  </div>
                </>
              ) : typeof task.input === 'string' ? (
                <>
                  <div className={classes.header}>
                    <h4>Input</h4>
                  </div>
                  <div
                    className={classes.inputTextContainer}
                    onMouseDown={() => {
                      updateCommentProvenance('input');
                    }}
                    onMouseUp={() => updateCommentProvenance('input')}
                  >
                    {task.input}
                  </div>
                </>
              ) : null}
            </div>
            {documentsPerResult && (
              <div className={classes.contextContainer}>
                <div className={classes.header}>
                  <h4>Contexts</h4>
                  <div className={classes.headerActions}>
                    <Button
                      id="text-highlight"
                      renderIcon={TextHighlight}
                      kind={'ghost'}
                      hasIconOnly={true}
                      iconDescription={
                        'Click to highlight text common in context and response'
                      }
                      tooltipAlignment={'end'}
                      tooltipPosition={'bottom'}
                      onClick={() => {
                        setShowOverlap(!showOverlap);
                      }}
                    />
                  </div>
                </div>
                <div className={classes.contextDisclaimers}>
                  {showOverlap && (
                    <div className={classes.contextOverlapDisclaimer}>
                      <div className={classes.legendCopiedText}>&#9632;</div>
                      <span>
                        &nbsp;marks text assumed to be copied from context into
                        model response
                      </span>
                    </div>
                  )}
                </div>
                {isEmpty(documentsPerResult[selectedResultIndex]) ? (
                  <div className={classes.contextUnavailableWarning}>
                    <WarningAlt size={24} /> No context is available
                  </div>
                ) : (
                  <DocumentPanel
                    key={`result--${selectedResultIndex}__documents`}
                    documents={documentsPerResult[selectedResultIndex].map(
                      (document, documentIdx) => {
                        return {
                          documentId: document.documentId,
                          text: showOverlap
                            ? mark(
                                document.text,
                                results[selectedResultIndex].overlaps[
                                  documentIdx
                                ],
                                'target',
                              )
                            : document.text,
                          ...(document.title && { title: document.title }),
                          ...(document.url && { url: document.url }),
                          ...(document.annotations && {
                            annotations: document.annotations,
                          }),
                        };
                      },
                    )}
                    onMouseDown={(provenance: string) => {
                      updateCommentProvenance(provenance);
                    }}
                    onMouseUp={(provenance: string) =>
                      updateCommentProvenance(provenance)
                    }
                    notify={(documentIndex: number) => {
                      setActiveDocumentIndex(documentIndex);
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <div className={classes.separator} />

          <div className={classes.resultsContainer}>
            <Tabs
              onChange={(e) => {
                setSelectedResultIndex(e.selectedIndex);
                setActiveDocumentIndex(0);
              }}
            >
              <TabList
                className={classes.tabList}
                aria-label="Models tab"
                contained
              >
                {results.map((result) => (
                  <Tab key={'model-' + result.modelId}>
                    {truncate(
                      models.get(result.modelId)?.name || result.modelId,
                      15,
                    )}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {results.map((result, resultIdx) => (
                  <TabPanel key={'model-' + result.modelId + '-panel'}>
                    <div className={classes.tabContainer}>
                      <div className={classes.tabContentHeader}>
                        <h5>Model:</h5>
                        <span>
                          {models.get(result.modelId)?.name || result.modelId}
                        </span>
                      </div>
                      <ContainedList
                        size="sm"
                        label="Response"
                        kind="disclosed"
                      >
                        <ContainedListItem>
                          <div
                            className={classes.responseContainer}
                            onMouseDown={() => {
                              updateCommentProvenance(
                                `${result.modelId}::evaluation::response`,
                              );
                            }}
                            onMouseUp={() =>
                              updateCommentProvenance(
                                `${result.modelId}::evaluation::response`,
                              )
                            }
                          >
                            {parse(
                              DOMPurify.sanitize(
                                showOverlap && resultIdx === selectedResultIndex
                                  ? mark(
                                      outputAsText(result.output),
                                      result.overlaps[activeDocumentIndex],
                                      'source',
                                    )
                                  : outputAsText(result.output),
                              ),
                            )}
                          </div>
                        </ContainedListItem>
                      </ContainedList>

                      <ContainedList label="Targets" kind="disclosed" size="sm">
                        {task.targets && !isEmpty(task.targets) ? (
                          task.targets.length > 1 ? (
                            task.targets.map((target, targetIdx) =>
                              target.type === 'text' ? (
                                <ContainedListItem key={`target--${targetIdx}`}>
                                  <span>
                                    Target {targetIdx + 1}: {target.value}
                                  </span>
                                </ContainedListItem>
                              ) : null,
                            )
                          ) : task.targets[0].type === 'text' ? (
                            <ContainedListItem key={`target--0`}>
                              <span>{task.targets[0].value}</span>
                            </ContainedListItem>
                          ) : null
                        ) : (
                          <ContainedListItem>
                            <span className={classes.notProvided}>
                              Not provided
                            </span>
                          </ContainedListItem>
                        )}
                      </ContainedList>
                      {result.scores && hMetrics.size ? (
                        <>
                          <h5>Human Evaluations:</h5>
                          <AnnotationsTable
                            annotations={result.scores}
                            metrics={[...hMetrics.values()]}
                          ></AnnotationsTable>
                        </>
                      ) : null}
                      {result.scores && aMetrics.size ? (
                        <>
                          <h5>Algorithmic Evaluations:</h5>
                          <AnnotationsTable
                            annotations={result.scores}
                            metrics={[...aMetrics.values()]}
                          ></AnnotationsTable>
                        </>
                      ) : null}
                    </div>
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </div>
        </>
      )}
    </>
  );
}
