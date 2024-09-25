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
  StringMatchObject,
  TaskEvaluation,
  Document,
  Task,
  Metric,
  DocumentAnnotation,
} from '@/src/types';
import { useDataStore } from '@/src/store';
import { truncate, overlaps } from '@/src/utilities/strings';
import { mark } from '@/src/utilities/highlighter';

import DocumentPanel from '@/src/views/document/DocumentPanel';
import AnnotationsTable from '@/src/views/annotations-table/AnnotationsTable';
import TaskCopierModal from '@/src/views/task/TaskCopier';

import classes from './RAGTask.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  task: Task;
  models: Map<string, Model>;
  metrics: Metric[];
  taskCopierModalOpen: boolean;
  setTaskCopierModalOpen: Function;
  updateCommentProvenance: Function;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function RAGTask({
  task,
  models,
  metrics,
  taskCopierModalOpen,
  setTaskCopierModalOpen,
  updateCommentProvenance,
}: Props) {
  // Step 1: Initialize state and necessary variables
  const [selectedEvaluationIndex, setSelectedEvaluationIndex] =
    useState<number>(0);
  const [showOverlap, setShowOverlap] = useState<boolean>(false);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState<number>(0);

  // Step 2: Run effects
  // Step 2.a: Fetch data from data store
  const { item: data } = useDataStore();

  // Step 2.b: Fetch documents and evaluations
  const [documentsPerEvaluation, evaluations] = useMemo(() => {
    // Step 2.b.i: Initialize necessary variables
    const contextsPerEvaluation: Document[][] = [];

    // Step 2.b.i: Fetch evaluations
    let taskEvaluations: TaskEvaluation[] | undefined = undefined;
    if (data) {
      taskEvaluations = data.evaluations.filter(
        (evaluation) => evaluation.taskId === task.taskId,
      );

      // Step 2.b.i.*: Identify context document for each evaluation and compute context-response overlap and add to evaluation object
      taskEvaluations.forEach((evaluation) => {
        const contextDocuments: Document[] = [];
        const contexts = evaluation.contexts
          ? evaluation.contexts
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
                // Step 2.b.i.*: Fetch context relevant annotations, if present
                if (
                  task?.annotations &&
                  task.annotations.hasOwnProperty('context_relevance')
                ) {
                  const documentAnnotation: DocumentAnnotation = {
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

        // Compute context-response overlap and add to evaluation object
        const textOverlaps: StringMatchObject[][] = [];
        contextDocuments.forEach((contextDocument) => {
          textOverlaps.push(
            overlaps(evaluation.modelResponse, contextDocument.text),
          );
        });

        evaluation.overlaps = textOverlaps;

        // Add context documents
        contextsPerEvaluation.push(contextDocuments);
      });
    }

    return [contextsPerEvaluation, taskEvaluations];
  }, [task.taskId, task.contexts, data]);

  // Step 2.c: Build human & algorithmic metric maps
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

  // Step 3: Render
  return (
    <>
      {models && metrics && task && evaluations && (
        <TaskCopierModal
          open={taskCopierModalOpen}
          models={Array.from(models.values())}
          metrics={metrics}
          task={task}
          evaluations={evaluations}
          documents={documentsPerEvaluation[selectedEvaluationIndex]}
          onClose={() => {
            setTaskCopierModalOpen(false);
          }}
        ></TaskCopierModal>
      )}

      {task && models && evaluations && (
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
            {documentsPerEvaluation && (
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
                {isEmpty(documentsPerEvaluation[selectedEvaluationIndex]) ? (
                  <div className={classes.contextUnavailableWarning}>
                    <WarningAlt size={24} /> No context is available
                  </div>
                ) : (
                  <DocumentPanel
                    key={`evaluation--${selectedEvaluationIndex}__documents`}
                    documents={documentsPerEvaluation[
                      selectedEvaluationIndex
                    ].map((document, documentIdx) => {
                      return {
                        documentId: document.documentId,
                        text: showOverlap
                          ? mark(
                              document.text,
                              evaluations[selectedEvaluationIndex].overlaps[
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
                    })}
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

          <div className={classes.evaluationsContainer}>
            <Tabs
              onChange={(e) => {
                setSelectedEvaluationIndex(e.selectedIndex);
                setActiveDocumentIndex(0);
              }}
            >
              <TabList
                className={classes.tabList}
                aria-label="Models tab"
                contained
              >
                {evaluations.map((evaluation) => (
                  <Tab key={'model-' + evaluation.modelId}>
                    {truncate(
                      models.get(evaluation.modelId)?.name ||
                        evaluation.modelId,
                      15,
                    )}
                  </Tab>
                ))}
              </TabList>
              <TabPanels>
                {evaluations.map((evaluation, evaluationIdx) => (
                  <TabPanel key={'model-' + evaluation.modelId + '-panel'}>
                    <div className={classes.tabContainer}>
                      <div className={classes.tabContentHeader}>
                        <h5>Model:</h5>
                        <span>
                          {models.get(evaluation.modelId)?.name ||
                            evaluation.modelId}
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
                                `${evaluation.modelId}::evaluation::response`,
                              );
                            }}
                            onMouseUp={() =>
                              updateCommentProvenance(
                                `${evaluation.modelId}::evaluation::response`,
                              )
                            }
                          >
                            {parse(
                              DOMPurify.sanitize(
                                showOverlap &&
                                  evaluationIdx === selectedEvaluationIndex
                                  ? mark(
                                      evaluation.modelResponse,
                                      evaluation.overlaps[activeDocumentIndex],
                                      'source',
                                    )
                                  : evaluation.modelResponse,
                              ),
                            )}
                          </div>
                        </ContainedListItem>
                      </ContainedList>

                      {task.targets && !isEmpty(task.targets) ? (
                        <ContainedList
                          label="Targets"
                          kind="disclosed"
                          size="sm"
                        >
                          {task.targets.length > 1 ? (
                            task.targets.map((target, targetIdx) =>
                              target.text ? (
                                <ContainedListItem key={`target--${targetIdx}`}>
                                  <span>
                                    Target {targetIdx + 1}: {target.text}
                                  </span>
                                </ContainedListItem>
                              ) : null,
                            )
                          ) : (
                            <ContainedListItem key={`target--0`}>
                              <span>{task.targets[0].text}</span>
                            </ContainedListItem>
                          )}
                        </ContainedList>
                      ) : null}
                      {evaluation.annotations && hMetrics.size ? (
                        <>
                          <h5>Human Evaluations:</h5>
                          <AnnotationsTable
                            annotations={evaluation.annotations}
                            metrics={[...hMetrics.values()]}
                          ></AnnotationsTable>
                        </>
                      ) : null}
                      {evaluation.annotations && aMetrics.size ? (
                        <>
                          <h5>Algorithmic Evaluations:</h5>
                          <AnnotationsTable
                            annotations={evaluation.annotations}
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
