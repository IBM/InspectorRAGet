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

import { memo } from 'react';
import { Bulldozer } from '@carbon/pictograms-react';

import { TileData } from '@/src/types';
import ExampleTile from '@/src/components/example-tile/ExampleTile';

import classes from './Examples.module.scss';

interface Props {
  examples: TileData[];
}

export default memo(function ExamplesView({ examples }: Props) {
  return (
    <div className={classes.root}>
      {examples && examples.length > 0 ? (
        <>
          <h2 className={classes.title}>Examples</h2>
          <div className={classes.experimentList}>
            {examples.map((example) => (
              <ExampleTile
                key={'example-' + example.exampleId}
                data={example}
              />
            ))}
          </div>
        </>
      ) : (
        <div className={classes.emptyExperimentList}>
          <Bulldozer className={classes.emptyExperimentListIcon}></Bulldozer>
          <div className={classes.emptyExperimentListMessage}>
            <h3>We are working hard to find some interesting examples</h3>
            <span>Please check back soon.</span>
          </div>
        </div>
      )}
    </div>
  );
});
