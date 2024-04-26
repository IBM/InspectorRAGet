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

import { memo, useState } from 'react';
import { ProgressIndicator, ProgressStep, Modal } from '@carbon/react';
import { WarningAlt } from '@carbon/icons-react';

import InstructionsView from './Instructions';
import DataUploaderView from './DataUploader';
import DataValidation from './DataVerification';

import classes from './Onboard.module.scss';
import { RawData } from '@/src/types';

interface Props {
  onVisualize: Function;
}

export default memo(function OnboardingView({ onVisualize }: Props) {
  const [isWarningModalOpen, setIsWarningModalOpen] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [rawData, setRawData] = useState<RawData>();

  return (
    <div className={classes.root}>
      <Modal
        open={isWarningModalOpen}
        danger
        modalHeading="Are you sure you want to go to previous step?"
        primaryButtonText="Continue"
        secondaryButtonText="Cancel"
        size={'xs'}
        onRequestSubmit={() => {
          // Step 1: Clear loaded data
          setRawData(undefined);

          // Step 2: Move progress indicator to upload data step
          setCurrentStepIndex(
            currentStepIndex !== 0 ? currentStepIndex - 1 : currentStepIndex,
          );

          // Step 3: Close modal
          setIsWarningModalOpen(false);
        }}
        onRequestClose={() => {
          setIsWarningModalOpen(false);
        }}
        onSecondarySubmit={() => {
          setIsWarningModalOpen(false);
        }}
      >
        <div className={classes.warningModalContent}>
          <WarningAlt />
          <span>
            All progress in terms of data upload and validation will be lost.
          </span>
        </div>
      </Modal>
      <h2 className={classes.title}>Welcome</h2>
      <div className={classes.progressTracker}>
        <ProgressIndicator currentIndex={currentStepIndex}>
          <ProgressStep label="1. General"></ProgressStep>
          <ProgressStep label="2. Upload data"></ProgressStep>
          <ProgressStep
            disabled={!rawData}
            label="3. Verify data"
            secondaryLabel="Verify data for any formatting issues"
          ></ProgressStep>
        </ProgressIndicator>
      </div>
      {currentStepIndex === 0 ? (
        <InstructionsView
          onClick={() => {
            setCurrentStepIndex(1);
          }}
        />
      ) : currentStepIndex === 1 ? (
        <DataUploaderView
          onNext={(data) => {
            setRawData(data);
            setCurrentStepIndex(2);
          }}
          onPrev={(data) => {
            if (data || rawData) {
              setIsWarningModalOpen(true);
            } else {
              setCurrentStepIndex(0);
            }
          }}
        />
      ) : rawData && currentStepIndex === 2 ? (
        <DataValidation
          data={rawData}
          onNext={onVisualize}
          onPrev={() => {
            if (rawData) {
              setIsWarningModalOpen(true);
            } else {
              setCurrentStepIndex(currentStepIndex - 1);
            }
          }}
        />
      ) : null}
    </div>
  );
});
