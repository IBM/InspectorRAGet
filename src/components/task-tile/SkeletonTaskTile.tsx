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
  Tile,
  Tag,
  SkeletonText,
  Toggletip,
  ToggletipButton,
  ToggletipContent,
  ToggletipActions,
  UnorderedList,
  ListItem,
} from '@carbon/react';
import { Task as TaskIcon, Information } from '@carbon/icons-react';

import styles from './TaskTile.module.scss';

export default function SkeletonTaskTile() {
  return (
    <Tile className={styles.tile}>
      <div className={styles.heading}>
        <TaskIcon className={styles.icon} />
        <span className={styles.title}>
          <SkeletonText />
        </span>
      </div>
      <div className={styles.block}>
        <div className={styles.information}>
          <div className={styles.artifactEvaluations}>
            <div className={styles.artifactTitle}>
              <span># of evaluations</span>
            </div>
            <div className={styles.artifactValue}>
              <span>
                <SkeletonText />
              </span>
            </div>
          </div>
          <div className={styles.artifactAnnotators}>
            <div className={styles.artifactTitle}>
              <span># of annotators</span>
            </div>
            <div className={styles.artifactValue}>
              <span>
                <SkeletonText />
              </span>
            </div>
          </div>
          <div className={styles.artifactMetrics}>
            <div className={styles.artifactTitle}>
              <span>Metrics</span>
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
              {['faithfulness'].map((metric, idx) => {
                return (
                  <Tag type={'cool-gray'} key={'metric-' + idx}>
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
              {['Model A', 'Model B', 'Model C'].map((model, idx) => {
                return (
                  <Tag type={'cool-gray'} key={'model-' + idx}>
                    {model}
                  </Tag>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Tile>
  );
}
