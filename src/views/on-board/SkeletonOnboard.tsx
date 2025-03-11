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

import { memo } from 'react';
import { ProgressIndicator, ProgressStep } from '@carbon/react';

import InstructionsView from './Instructions';

import classes from './Onboard.module.scss';

export default memo(function SkeletonOnboardView() {
  return (
    <div className={classes.root}>
      <h2 className={classes.title}>Welcome</h2>
      <div className={classes.progressTracker}>
        <ProgressIndicator currentIndex={0}>
          <ProgressStep label="1. General"></ProgressStep>
          <ProgressStep label="2. Upload data"></ProgressStep>
          <ProgressStep
            disabled={true}
            label="3. Verify data"
            secondaryLabel="Verify data for any formatting issues"
          ></ProgressStep>
        </ProgressIndicator>
      </div>
      <InstructionsView loading={true} onClick={() => {}} />
    </div>
  );
});
