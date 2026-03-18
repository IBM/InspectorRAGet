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
  InlineNotification,
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
import EvaluationsPanel from '@/src/components/evaluations/EvaluationsPanel';
import StepGroup from '@/src/components/steps/StepGroup';
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
        <div className={classes.layout}>
          <div className={classes.inputContainer}>
            {typeof task.input === 'string' ? (
              <div className={classes.questionSection}>
                <ContainedList label="Question" kind="on-page">
                  <ContainedListItem>
                    <div
                      className={classes.scrollableContent}
                      onMouseDown={() => updateCommentProvenance('input')}
                      onMouseUp={() => updateCommentProvenance('input')}
                    >
                      {task.input}
                    </div>
                  </ContainedListItem>
                </ContainedList>
              </div>
            ) : Array.isArray(task.input) ? (
              <div className={classes.conversationSection}>
                <ContainedList label="Conversation" kind="on-page">
                  <ContainedListItem>
                    <div
                      className={classes.scrollableContent}
                      onMouseDown={() => updateCommentProvenance('input')}
                      onMouseUp={() => updateCommentProvenance('input')}
                    >
                      {task.input.map((utterance, idx) => (
                        <span key={`utterance-${idx}`}>
                          <strong>
                            {utterance.speaker.charAt(0).toUpperCase() +
                              utterance.speaker.slice(1).toLowerCase()}
                          </strong>
                          : {utterance.text}
                        </span>
                      ))}
                    </div>
                  </ContainedListItem>
                </ContainedList>
              </div>
            ) : null}

            {documentsPerResult && (
              <>
                <hr className={classes.inputDivider} />
                <div className={classes.contextSection}>
                  {/* Header-only ContainedList — no items, so Carbon renders just the label + action row */}
                  <ContainedList
                    label="Contexts"
                    kind="on-page"
                    action={
                      <div className={classes.contextActions}>
                        <Button
                          id="text-highlight"
                          renderIcon={TextHighlight}
                          kind="ghost"
                          hasIconOnly
                          iconDescription="Highlight text common in context and response"
                          tooltipAlignment="end"
                          tooltipPosition="bottom"
                          onClick={() => setShowOverlap(!showOverlap)}
                        />
                      </div>
                    }
                  />
                  {showOverlap && (
                    <div className={classes.contextOverlapDisclaimer}>
                      <div className={classes.legendCopiedText}>&#9632;</div>
                      <span>
                        &nbsp;marks text assumed to be copied from context into
                        model response
                      </span>
                    </div>
                  )}
                  {isEmpty(documentsPerResult[selectedResultIndex]) ? (
                    <div className={classes.contextUnavailableWarning}>
                      <WarningAlt size={24} /> No context is available
                    </div>
                  ) : (
                    <DocumentPanel
                      key={`result--${selectedResultIndex}__documents`}
                      className={classes.contextDocumentPanel}
                      documents={documentsPerResult[selectedResultIndex].map(
                        (document, documentIdx) => ({
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
                        }),
                      )}
                      onMouseDown={(provenance: string) =>
                        updateCommentProvenance(provenance)
                      }
                      onMouseUp={(provenance: string) =>
                        updateCommentProvenance(provenance)
                      }
                      notify={(documentIndex: number) =>
                        setActiveDocumentIndex(documentIndex)
                      }
                    />
                  )}
                </div>
              </>
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
              <TabList aria-label="Models tab" contained fullWidth>
                {results.map((result) => (
                  <Tab key={`model-${result.modelId}`}>
                    {truncate(
                      models.get(result.modelId)?.name || result.modelId,
                      15,
                    )}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {results.map((result, resultIdx) => (
                  <TabPanel key={`model-${result.modelId}-panel`}>
                    <div className={classes.tabContainer}>
                      <ContainedList label="Response" kind="on-page">
                        <ContainedListItem>
                          <div
                            className={classes.responseContainer}
                            onMouseDown={() =>
                              updateCommentProvenance(
                                `${result.modelId}::evaluation::response`,
                              )
                            }
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

                      <ContainedList label="Target" kind="on-page">
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
                            <ContainedListItem key="target--0">
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

                      <hr className={classes.sectionDivider} />

                      <Tabs>
                        <TabList
                          aria-label="Result details"
                          contained
                          fullWidth
                        >
                          <Tab>Evaluations</Tab>
                          <Tab
                            disabled={
                              !(
                                Array.isArray(result.output[0]?.steps) &&
                                result.output[0].steps!.length > 0
                              )
                            }
                          >
                            Steps
                          </Tab>
                        </TabList>
                        <TabPanels>
                          <TabPanel className={classes.flushTabPanel}>
                            <EvaluationsPanel
                              scores={result.scores}
                              hMetrics={hMetrics}
                              aMetrics={aMetrics}
                              onCellMouseDown={(metricName, annotator) =>
                                updateCommentProvenance(
                                  `${result.modelId}::evaluation::scores::${metricName}::${annotator}`,
                                )
                              }
                            />
                          </TabPanel>
                          <TabPanel className={classes.flushTabPanel}>
                            {Array.isArray(result.output[0]?.steps) &&
                              result.output[0].steps!.length > 0 && (
                                <>
                                  {!result.output[0].steps!.some(
                                    (s) => s.startTimestamp !== undefined,
                                  ) && (
                                    <InlineNotification
                                      kind="info"
                                      title="Auto-constructed steps"
                                      subtitle="These steps were derived from the message thread and may not reflect actual execution order."
                                      lowContrast
                                      hideCloseButton
                                    />
                                  )}
                                  <StepGroup
                                    steps={result.output[0].steps!}
                                    onStepMouseDown={(stepId) =>
                                      updateCommentProvenance(
                                        `${result.modelId}::steps::${stepId}`,
                                      )
                                    }
                                  />
                                </>
                              )}
                          </TabPanel>
                        </TabPanels>
                      </Tabs>
                    </div>
                  </TabPanel>
                ))}
              </TabPanels>
            </Tabs>
          </div>
        </div>
      )}
    </>
  );
}
