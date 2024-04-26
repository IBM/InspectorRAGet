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
          Use the Analytics platform to examine and analyze LLM evaluation
          experiments. The experiments are assumed to comprise:
        </p>
        <UnorderedList>
          <ListItem>
            A dataset of tasks, where each task has at least one triplet of
            context, grounding document and response. There may be multiple
            responses, if multiple models are being evaluated simultaneously (at
            most 5 models are allowed).
          </ListItem>
          <ListItem>
            Each response is evaluated on at least one metric. A metric may be
            categorical (yes/no, Likert scale) or numeric. One experiment may
            include any number of categorical or numeric metrics, though we
            strongly caution against including too many as this makes the
            instance-level analysis challenging.
          </ListItem>
          <ListItem>
            There is at least one annotator / evaluator. The annotator may be
            human or algorithm (whether a defined quanititative metric, or an
            LLM). One experiment may include any number of human or algorithmic
            annotators.
          </ListItem>
        </UnorderedList>
        <p>
          Upload your experiment data on the following page, which contains a
          detailed example of the expected schema. You will need to provide
          sufficient metadata about the tasks, metrics, and annotators. If the
          uploaded document is not well-formed, you will see a verification
          error.
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
