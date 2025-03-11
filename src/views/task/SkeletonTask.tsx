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

import { SkeletonText, Accordion, AccordionItem } from '@carbon/react';

import SkeletonTaskTile from '@/src/components/task-tile/SkeletonTaskTile';
import SkeletonDocumentPanel from '@/src/views/document/SkeletonDocumentPanel';
import SkeletonAnnotationsTable from '@/src/views/annotations-table/SkeletonAnnotationsTable';

import styles from './Task.module.scss';

export default function SkeletonTask() {
  return (
    <div className={styles.page}>
      <SkeletonTaskTile />
      <div className={styles.taskContainer}>
        <div className={styles.inputContainer}>
          <div className={styles.conversationContainer}>
            <h3>Conversation</h3>
            <div className={styles.conversationUtteranceContainer}>
              <SkeletonText paragraph={true} lineCount={10}></SkeletonText>
            </div>
          </div>
          <div className={styles.contextContainer}>
            <>
              <h3>Contexts</h3>
              <SkeletonDocumentPanel />
            </>
          </div>
        </div>
        <div className={styles.evaluationsContainer}>
          <Accordion>
            {[
              { modelId: 'Model A' },
              { modelId: 'Model B' },
              { modelId: 'Model C' },
            ].map((evaluation) => (
              <AccordionItem
                key={'model-' + evaluation.modelId}
                title={'Model: ' + evaluation.modelId}
                className={styles.evaluationContainer}
                open={true}
              >
                <div className={styles.evaluationHeader}>
                  <h5>Response:</h5>
                  <SkeletonText
                    paragraph={true}
                    lineCount={Math.floor(Math.random() * (3 - 1) + 1)}
                  ></SkeletonText>
                </div>
                <SkeletonAnnotationsTable />
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
