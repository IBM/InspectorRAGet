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
import { useState } from 'react';

import { Data } from '@/src/types';

import Onboard from '@/src/views/on-board/Onboard';
import Example from '@/src/views/example/Example';

export default function VisualizationView() {
  const [onboarding, setOnboarding] = useState<boolean>(true);
  const [data, setData] = useState<Data | undefined>(undefined);

  return (
    <>
      {onboarding ? (
        <Onboard
          onVisualize={(data: Data) => {
            // Step 1: Set data
            setData(data);

            // Step 2: Disable on-boarding flow
            setOnboarding(false);
          }}
        />
      ) : data ? (
        <Example data={data} />
      ) : null}
    </>
  );
}
