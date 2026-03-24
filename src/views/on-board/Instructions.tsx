/**
 *
 * Copyright 2023-present InspectorRAGet Team
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
import { Button, ButtonSkeleton, UnorderedList, ListItem } from '@carbon/react';
import { ArrowRight } from '@carbon/icons-react';

import classes from './Instructions.module.scss';

interface Props {
  loading?: boolean;
  onClick: Function;
}

export default memo(function InstructionsView({
  loading = false,
  onClick,
}: Props) {
  return (
    <div className={classes.root}>
      <div className={classes.instructionsContainer}>
        <h4>Instructions</h4>
        <p>
          Use InspectorRAGet to visualize and analyze LLM evaluation results.
          Your evaluation data is expected to contain:
        </p>
        <UnorderedList>
          <ListItem>
            A set of tasks, each with one or more model results. All models must
            have a result for every task, and all metrics must have scores on
            every model result. Including more than 5 models may result in
            noticeable slowdowns due to the volume of data being processed and
            rendered.
          </ListItem>
          <ListItem>
            Scores on one or more metrics per model result. Metrics may be
            categorical (e.g., yes/no, Likert scale) or numeric. Mixing metric
            types within a single experiment is supported.
          </ListItem>
          <ListItem>
            At least one annotator or evaluator (human, algorithmic, or
            LLM-based). Multiple annotators per experiment are supported.
          </ListItem>
        </UnorderedList>
        <p>Supported task types:</p>
        <UnorderedList>
          <ListItem>RAG</ListItem>
          <ListItem>Text generation</ListItem>
          <ListItem>Tool calling</ListItem>
          <ListItem>Agentic traces</ListItem>
        </UnorderedList>
        <p>
          The next page includes a full schema example. If your file does not
          match the expected format, you will see a validation error.
        </p>
      </div>

      <div className={classes.proceedButton}>
        {loading ? (
          <ButtonSkeleton />
        ) : (
          <Button className={classes.proceedButtonContent} onClick={onClick}>
            <span>Get started</span>
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
});
