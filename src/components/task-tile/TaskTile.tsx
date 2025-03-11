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

import Link from 'next/link';
import { useMemo, memo } from 'react';
import {
  ExpandableTile,
  TileAboveTheFoldContent,
  TileBelowTheFoldContent,
  Tag,
  DefinitionTooltip,
  Tooltip,
  Toggletip,
  ToggletipButton,
  ToggletipContent,
  ToggletipActions,
  UnorderedList,
  ListItem,
  Button,
} from '@carbon/react';
import {
  Task as TaskIcon,
  Information,
  Flag,
  FlagFilled,
  Chat,
  Copy,
} from '@carbon/icons-react';

import { Task, TaskEvaluation } from '@/src/types';
import { MetricDefinitions } from '@/src/utilities/metrics';
import { castDurationToString } from '@/src/utilities/time';

import classes from './TaskTile.module.scss';

interface Props {
  task: Task;
  evaluations: TaskEvaluation[];
  expanded?: boolean;
  onClickFlagIcon: Function;
  onClickCommentsIcon: Function;
  onClickCopyToClipboardIcon?: Function;
}
export default memo(function TaskTile({
  task,
  evaluations,
  expanded = true,
  onClickFlagIcon,
  onClickCommentsIcon,
  onClickCopyToClipboardIcon,
}: Props) {
  // Step 1: Extract neccessary information
  const [annotators, metrics, models, duration] = useMemo(() => {
    const annotatorsMap: { [key: string]: number } = {};
    const metricsSet: Set<string> = new Set();
    const modelsSet: Set<string> = new Set();
    evaluations.forEach((evaluation) => {
      // Add model information
      modelsSet.add(evaluation.modelId);
      for (const metric in evaluation.annotations) {
        // Add metric information
        metricsSet.add(metric);
        for (const annotator in evaluation.annotations[metric]) {
          // Add annotator information
          annotatorsMap[annotator] =
            evaluation.annotations[metric][annotator].duration || 0;
        }
      }
    });

    // Calcuate average time taken by annotators
    const avgDuration: number = Math.floor(
      Object.values(annotatorsMap).reduce((a, b) => a + b, 0) /
        Object.keys(annotatorsMap).length,
    );

    return [annotatorsMap, metricsSet, modelsSet, avgDuration];
  }, [evaluations]);

  const [
    durationInDays,
    durationInHours,
    durationInMinutes,
    durationInSeconds,
  ] = useMemo(() => castDurationToString(duration), [duration]);

  return (
    <ExpandableTile expanded={expanded}>
      <TileAboveTheFoldContent>
        <div className={classes.heading}>
          <TaskIcon className={classes.icon} />
          <span className={classes.title}>{task.taskId}</span>
          <div className={classes.actions}>
            <Button
              key={`${task.taskId}__flag-btn`}
              className={classes.flagTaskBtn}
              kind={'ghost'}
              renderIcon={task.flagged ? FlagFilled : Flag}
              hasIconOnly={true}
              iconDescription={'Flag to review later'}
              tooltipAlignment={'end'}
              tooltipPosition={'right'}
              onClick={onClickFlagIcon}
            />
            <Tooltip align={'right'} label={'Click to show / hide comments'}>
              <Button
                id="comment"
                className={classes.commentsIndicator}
                kind={'ghost'}
                onClick={onClickCommentsIcon}
                disabled={
                  task.comments === undefined || task.comments.length === 0
                }
              >
                <Chat />
                {task.comments ? task.comments.length : 0}
              </Button>
            </Tooltip>
            {onClickCopyToClipboardIcon && (
              <Button
                key={`${task.taskId}__copyToClipboard-btn`}
                className={classes.copyToClipboardBtn}
                kind={'ghost'}
                renderIcon={Copy}
                hasIconOnly={true}
                iconDescription={'Copy task details to clipboard'}
                tooltipAlignment={'end'}
                tooltipPosition={'right'}
                onClick={onClickCopyToClipboardIcon}
              />
            )}
          </div>
        </div>
      </TileAboveTheFoldContent>
      <TileBelowTheFoldContent>
        <div className={classes.block}>
          <div className={classes.information}>
            <div className={classes.artifactEvaluations}>
              <div className={classes.artifactTitle}>
                <span># of evaluations</span>
              </div>
              <div className={classes.artifactValue}>
                <span>{evaluations.length}</span>
              </div>
            </div>
            <div className={classes.artifactAnnotators}>
              <div className={classes.artifactTitle}>
                <span># of annotators</span>
              </div>
              <div className={classes.artifactValue}>
                <span>{Object.keys(annotators).length}</span>
              </div>
            </div>
            <div className={classes.artifactMetrics}>
              <div className={classes.artifactHeader}>
                <div className={classes.artifactTitle}>
                  <span>Metrics</span>
                </div>
                <Toggletip>
                  <ToggletipButton label="Additional information">
                    <Information />
                  </ToggletipButton>
                  <ToggletipContent>
                    <p>Analytics platform supports three kind of metrics</p>
                    <UnorderedList>
                      <ListItem className={classes.listItem}>
                        Go vs No-Go Rubric
                      </ListItem>
                      <ListItem className={classes.listItem}>
                        Intuitive Rubric
                      </ListItem>
                      <ListItem className={classes.listItem}>
                        Detailed Rubric
                      </ListItem>
                    </UnorderedList>
                    <ToggletipActions>
                      <Link target="_blank" rel="noopener noreferrer" href="">
                        Reference
                      </Link>
                    </ToggletipActions>
                  </ToggletipContent>
                </Toggletip>
              </div>
              <div className={classes.artifactValue}>
                {Array.from(metrics).map((metric, idx) => {
                  return (
                    <Tag type={'cool-gray'} key={'metric-' + idx}>
                      <DefinitionTooltip
                        key={'tooltip--metric-' + idx}
                        definition={MetricDefinitions[metric]}
                        align={'bottom'}
                        openOnHover={true}
                      >
                        {metric}
                      </DefinitionTooltip>
                    </Tag>
                  );
                })}
              </div>
            </div>
            <div className={classes.artifactModels}>
              <div className={classes.artifactTitle}>
                <span>Models</span>
              </div>
              <div className={classes.artifactValue}>
                {Array.from(models).map((model, idx) => {
                  return (
                    <Tag type={'cool-gray'} key={'model-' + idx}>
                      {model}
                    </Tag>
                  );
                })}
              </div>
            </div>
            {durationInDays ||
            durationInHours ||
            durationInMinutes ||
            durationInSeconds ? (
              <div className={classes.artifactDuration}>
                <div className={classes.artifactTitle}>
                  <span>Duration</span>
                </div>
                <div className={classes.artifactValue}>
                  <DefinitionTooltip
                    definition={Object.keys(annotators).map(
                      (annotator, idx) => {
                        // Step 1: Convert duration to string
                        const [
                          durationInDaysForAnnotator,
                          durationInHoursForAnnotator,
                          durationInMinutesForAnnotator,
                          durationInSecondsForAnnotator,
                        ] = castDurationToString(annotators[annotator]);

                        return (
                          <>
                            <span key={'annotator-' + idx}>
                              {annotator}:&nbsp;
                              {durationInDaysForAnnotator
                                ? durationInDaysForAnnotator + ' days '
                                : ''}
                              {durationInHoursForAnnotator
                                ? durationInHoursForAnnotator + ' hours '
                                : ''}
                              {durationInMinutesForAnnotator
                                ? durationInMinutesForAnnotator + ' mins '
                                : ''}
                              {durationInSecondsForAnnotator} sec
                            </span>
                            <br />
                          </>
                        );
                      },
                    )}
                    align={'bottom'}
                    openOnHover={true}
                  >
                    <span>
                      {durationInDays ? durationInDays + ' days ' : ''}
                      {durationInHours ? durationInHours + ' hours ' : ''}
                      {durationInMinutes ? durationInMinutes + ' mins ' : ''}
                      {durationInSeconds} sec
                    </span>
                  </DefinitionTooltip>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </TileBelowTheFoldContent>
    </ExpandableTile>
  );
});
