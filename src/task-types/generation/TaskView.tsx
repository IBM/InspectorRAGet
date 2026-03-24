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

import EvaluationsPanel from '@/src/components/evaluations/EvaluationsPanel';
import TraceGroup from '@/src/components/trace/TraceGroup';
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
        <div className={classes.layout}>
          <div className={classes.inputContainer}>
            {typeof task.input === 'string' && (
              <div className={classes.inputSection}>
                <ContainedList
                  label="Input"
                  kind="on-page"
                  action={
                    <Button
                      id="generation-text-highlight"
                      renderIcon={TextHighlight}
                      kind="ghost"
                      hasIconOnly
                      iconDescription="Highlight text common in input and response"
                      tooltipAlignment="end"
                      tooltipPosition="bottom"
                      onClick={() => setShowOverlap(!showOverlap)}
                    />
                  }
                >
                  <ContainedListItem>
                    {showOverlap && (
                      <div className={classes.overlapDisclaimer}>
                        <div className={classes.legendCopiedText}>&#9632;</div>
                        <span>
                          &nbsp;marks text assumed to be copied from input into
                          model response
                        </span>
                      </div>
                    )}
                    <div
                      className={classes.inputContent}
                      onMouseDown={() => updateCommentProvenance('input')}
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
                  </ContainedListItem>
                </ContainedList>
              </div>
            )}
          </div>

          <div className={classes.separator} />

          <div className={classes.resultsContainer}>
            <Tabs onChange={(e) => setSelectedModelIndex(e.selectedIndex)}>
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
                {results.map((result) => (
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

                      <ContainedList label="Target" kind="on-page">
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
                                Array.isArray(result.output[0]?.trace) &&
                                result.output[0].trace!.length > 0
                              )
                            }
                          >
                            Trace
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
                            {Array.isArray(result.output[0]?.trace) &&
                              result.output[0].trace!.length > 0 && (
                                <TraceGroup trace={result.output[0].trace!} />
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
