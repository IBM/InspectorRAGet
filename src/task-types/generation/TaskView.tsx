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
import { TextHighlight } from '@carbon/icons-react';

import { Model, ModelResult, Task, Metric, outputAsText } from '@/src/types';
import { useDataStore } from '@/src/store';
import { truncate, overlaps } from '@/src/utilities/strings';
import { mark } from '@/src/utilities/highlighter';

import AnnotationsTable from '@/src/views/annotations-table/AnnotationsTable';
import GenerationCopier from '@/src/task-types/generation/Copier';

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

export default function GenerationTaskView({
  task,
  models,
  metrics,
  taskCopierModalOpen,
  setTaskCopierModalOpen,
  updateCommentProvenance,
}: Props) {
  const [selectedModelIndex, setSelectedModelIndex] = useState<number>(0);
  const [showOverlap, setShowOverlap] = useState<boolean>(false);

  const { item: data } = useDataStore();

  const results = useMemo(() => {
    let taskResults: ModelResult[] | undefined = undefined;
    if (data) {
      taskResults = data.results.filter(
        (result) => result.taskId === task.taskId,
      );

      // Compute input-response overlap for highlight support
      taskResults.forEach((result) => {
        if (typeof task.input === 'string') {
          result.overlaps = overlaps(outputAsText(result.output), task.input);
        } else {
          result.overlaps = [];
        }
      });
    }

    return taskResults;
  }, [task.taskId, task.input, data]);

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
        <GenerationCopier
          open={taskCopierModalOpen}
          models={Array.from(models.values())}
          metrics={metrics}
          task={task}
          results={results}
          onClose={() => {
            setTaskCopierModalOpen(false);
          }}
        ></GenerationCopier>
      )}

      {task && models && results && (
        <>
          <div className={classes.inputContainer}>
            {typeof task.input === 'string' ? (
              <>
                <div className={classes.header}>
                  <h4>Input</h4>
                  <div className={classes.headerActions}>
                    <Button
                      id="text-highlight"
                      renderIcon={TextHighlight}
                      kind={'ghost'}
                      hasIconOnly={true}
                      iconDescription={
                        'Click to highlight text common in input and response'
                      }
                      tooltipAlignment={'end'}
                      tooltipPosition={'bottom'}
                      onClick={() => {
                        setShowOverlap(!showOverlap);
                      }}
                    />
                  </div>
                </div>
                <div className={classes.disclaimers}>
                  {showOverlap && (
                    <div className={classes.overlapDisclaimer}>
                      <div className={classes.legendCopiedText}>&#9632;</div>
                      <span>
                        &nbsp;marks text assumed to be copied from input into
                        model response
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className={classes.inputTextContainer}
                  onMouseDown={() => {
                    updateCommentProvenance('input');
                  }}
                  onMouseUp={() => updateCommentProvenance('input')}
                >
                  <p>
                    {parse(
                      DOMPurify.sanitize(
                        showOverlap
                          ? mark(
                              task.input,
                              results[selectedModelIndex].overlaps,
                              'target',
                            )
                          : task.input,
                      ),
                    )}
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <div className={classes.separator} />

          <div className={classes.resultsContainer}>
            <Tabs
              onChange={(e) => {
                setSelectedModelIndex(e.selectedIndex);
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
                {results.map((result) => (
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
                                showOverlap
                                  ? mark(
                                      outputAsText(result.output),
                                      result.overlaps,
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
                          task.targets.map((target, targetIdx) =>
                            target.type === 'text' ? (
                              <ContainedListItem key={`target--${targetIdx}`}>
                                <span>
                                  Target {targetIdx + 1}: {target.value}
                                </span>
                              </ContainedListItem>
                            ) : null,
                          )
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
