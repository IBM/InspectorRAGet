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

import SkeletonExampleTile from '@/src/components/example-tile/SkeletonExampleTile';

import styles from './Examples.module.scss';

export default function SkeletonOverviewView() {
  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Experiments</h2>
      <div className={styles.experimentList}>
        {[1, 2, 3].map((idx) => (
          <SkeletonExampleTile
            key={'skeleton-experiment-' + idx}
          ></SkeletonExampleTile>
        ))}
      </div>
    </div>
  );
}
