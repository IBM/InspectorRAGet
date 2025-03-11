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

import React from 'react';
import { SkeletonText } from '@carbon/react';

import styles from './DocumentPanel.module.scss';

export default function SkeletonDocumentPanel() {
  return (
    <div className={styles.page}>
      <SkeletonText heading />
      <SkeletonText paragraph lineCount={5} />
      <SkeletonText paragraph lineCount={10} />
      <SkeletonText paragraph lineCount={8} />
    </div>
  );
}
