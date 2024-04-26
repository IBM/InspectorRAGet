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

import Link from 'next/link';
import {
  ExpandableTile,
  TileAboveTheFoldContent,
  TileBelowTheFoldContent,
  Tag,
  Button,
  DefinitionTooltip,
  Toggletip,
  ToggletipButton,
  ToggletipContent,
  ToggletipActions,
  UnorderedList,
  ListItem,
} from '@carbon/react';
import { Microscope, Download, Information } from '@carbon/icons-react';

import { TileData } from '@/src/types';
import {
  MetricDefinitions,
  extractMetricDisplayName,
} from '@/src/utilities/metrics';
import { calculateDuration } from '@/src/utilities/time';

import styles from './ExampleTile.module.scss';

export default function ExperimentTile({
  data,
  disableNavigation = false,
  disableActions = false,
  expanded = true,
}: {
  data: TileData;
  disableNavigation?: boolean;
  disableActions?: boolean;
  expanded?: boolean;
}) {
  const [
    durationInDays,
    durationInHours,
    durationInMinutes,
    durationInSeconds,
  ] = calculateDuration(data.endTimestamp, data.startTimestamp);

  return (
    <ExpandableTile expanded={expanded}>
      <TileAboveTheFoldContent>
        <div className={styles.heading}>
          <Microscope className={styles.icon} />
          {disableNavigation ? (
            <span className={styles.title}>{data.name}</span>
          ) : (
            <Link href={`/examples/${data.exampleId}`}>
              <span className={styles.title}>{data.name}</span>
            </Link>
          )}
        </div>
      </TileAboveTheFoldContent>
      <TileBelowTheFoldContent>
        <div className={styles.block}>
          <div className={styles.information}>
            <div className={styles.artifactEvaluations}>
              <div className={styles.artifactTitle}>
                <span># of tasks</span>
              </div>
              <div className={styles.artifactValue}>
                <span>{data.numTasks}</span>
              </div>
            </div>
            <div className={styles.artifactAnnotators}>
              <div className={styles.artifactTitle}>
                <span># of annotators</span>
              </div>
              <div className={styles.artifactValue}>
                <span>{data.annotators.length}</span>
              </div>
            </div>
            <div className={styles.artifactMetrics}>
              <div className={styles.artifactHeader}>
                <div className={styles.artifactTitle}>
                  <span>Metrics</span>
                </div>
                <Toggletip>
                  <ToggletipButton label="Additional information">
                    <Information />
                  </ToggletipButton>
                  <ToggletipContent>
                    <p>Analytics platform supports three kind of metrics</p>
                    <UnorderedList>
                      <ListItem className={styles.listItem}>
                        Go vs No-Go Rubric
                      </ListItem>
                      <ListItem className={styles.listItem}>
                        Intuitive Rubric
                      </ListItem>
                      <ListItem className={styles.listItem}>
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
              <div className={styles.artifactValue}>
                {[...data.metrics].map((metric) => {
                  return (
                    <Tag type={'cool-gray'} key={'metric-' + metric.name}>
                      <DefinitionTooltip
                        definition={
                          metric.description || MetricDefinitions[metric.name]
                        }
                        align={'bottom'}
                        openOnHover={true}
                      >
                        {extractMetricDisplayName(metric)}
                      </DefinitionTooltip>
                    </Tag>
                  );
                })}
              </div>
            </div>
            <div className={styles.artifactModels}>
              <div className={styles.artifactTitle}>
                <span>Models</span>
              </div>
              <div className={styles.artifactValue}>
                {[...data.models].map((model) => {
                  return (
                    <Tag type={'cool-gray'} key={'model-' + model.modelId}>
                      {model.name}
                    </Tag>
                  );
                })}
              </div>
            </div>
            {durationInDays ||
            durationInHours ||
            durationInMinutes ||
            durationInSeconds ? (
              <div className={styles.artifactDuration}>
                <div className={styles.artifactTitle}>
                  <span>Duration</span>
                </div>
                <div className={styles.artifactValue}>
                  <span>
                    {durationInDays ? durationInDays + ' days ' : ''}
                    {durationInHours ? durationInHours + ' hours ' : ''}
                    {durationInMinutes ? durationInMinutes + ' mins ' : ''}
                    {durationInSeconds} sec
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          {!disableActions && (
            <>
              <div className={styles.divider}></div>
              <div className={styles.actions}>
                <Button
                  id="download-evaluations"
                  renderIcon={Download}
                  kind={'ghost'}
                  iconDescription={'Download evaluations'}
                  tooltipAlignment={'end'}
                  tooltipPosition={'bottom'}
                  disabled
                >
                  Download evaluations
                </Button>
              </div>
            </>
          )}
        </div>
      </TileBelowTheFoldContent>
    </ExpandableTile>
  );
}
