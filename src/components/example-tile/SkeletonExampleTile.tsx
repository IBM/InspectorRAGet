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
import { Tile, Tag, Button, SkeletonText } from '@carbon/react';
import { Microscope, Download } from '@carbon/icons-react';

import styles from './ExampleTile.module.scss';

export default function SkeletonExampleTile({
  disableNavigation = false,
  disableActions = false,
}: {
  disableNavigation?: boolean;
  disableActions?: boolean;
}) {
  return (
    <Tile className={styles.tile}>
      <div className={styles.heading}>
        <Microscope className={styles.icon} />
        {disableNavigation ? (
          <span className={styles.title}>
            <SkeletonText />
          </span>
        ) : (
          <Link href={`#`}>
            <span className={styles.title}>
              <SkeletonText />
            </span>
          </Link>
        )}
      </div>
      <div className={styles.block}>
        <div className={styles.information}>
          <div className={styles.artifactEvaluations}>
            <div className={styles.artifactTitle}>
              <span># of evaluations</span>
            </div>
            <div className={styles.artifactValue}>
              <SkeletonText />
            </div>
          </div>
          <div className={styles.artifactAnnotators}>
            <div className={styles.artifactTitle}>
              <span># of annotators</span>
            </div>
            <div className={styles.artifactValue}>
              <SkeletonText />
            </div>
          </div>
          <div className={styles.artifactMetrics}>
            <div className={styles.artifactTitle}>
              <span>Metrics</span>
            </div>
            <div className={styles.artifactValue}>
              {['Metric A', 'Metric B', 'Metric C'].map((metric) => {
                return (
                  <Tag type="cool-gray" key={'metric-' + metric}>
                    {metric}
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
              {['Model A', 'Model B'].map((model) => {
                return (
                  <Tag type="cool-gray" key={'model-' + model}>
                    {model}
                  </Tag>
                );
              })}
            </div>
          </div>
          <div className={styles.artifactDuration}>
            <div className={styles.artifactTitle}>
              <span>Duration</span>
            </div>
            <div className={styles.artifactValue}>
              <SkeletonText />
            </div>
          </div>
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
    </Tile>
  );
}
