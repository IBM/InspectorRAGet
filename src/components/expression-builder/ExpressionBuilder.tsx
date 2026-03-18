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

'use client';

import { isEmpty } from 'lodash';
import { useState } from 'react';
import {
  TextArea,
  Button,
  Toggletip,
  ToggletipButton,
  ToggletipContent,
  UnorderedList,
  ListItem,
} from '@carbon/react';
import { WarningAlt, Information } from '@carbon/icons-react';

import { Model, Metric } from '@/src/types';
import {
  PLACEHOLDER_EXPRESSION_TEXT,
  validate,
} from '@/src/utilities/expressions';

import classes from './ExpressionBuilder.module.scss';

// ===================================================================================
//                                TYPES
// ===================================================================================
interface Props {
  expression?: object;
  models?: Model[];
  metric?: Metric;
  setExpression?: Function;
}

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function ExpressionBuilder({
  expression,
  models,
  metric,
  setExpression,
}: Props) {
  const [updatedExpressionText, setUpdatedExpressionText] = useState<string>(
    expression ? JSON.stringify(expression) : PLACEHOLDER_EXPRESSION_TEXT,
  );

  // Derive validation error directly during render — no need for separate state
  const errorMessage = (() => {
    try {
      return validate(
        JSON.parse(updatedExpressionText),
        models?.map((model) => model.modelId),
      );
    } catch {
      return 'Invalid JSON';
    }
  })();

  return (
    <div className={classes.page}>
      <TextArea
        labelText={
          <div className={classes.labelWithTooltip}>
            <span>Expression</span>
            <Toggletip align={'bottom-left'}>
              <ToggletipButton label="Syntax reference">
                <Information />
              </ToggletipButton>
              <ToggletipContent className={classes.syntaxReference}>
                <p>
                  <strong>Operators</strong>
                </p>
                <p>
                  Comparison: $eq &nbsp;$neq &nbsp;$gt &nbsp;$gte &nbsp;$lt
                  &nbsp;$lte
                </p>
                <p>Logical: $and &nbsp;$or</p>
                <p>
                  <strong>Examples</strong>
                </p>
                <UnorderedList>
                  <ListItem>
                    Single model: {`{ "model-id": { "$gt": 0.8 } }`}
                  </ListItem>
                  <ListItem>
                    Multi-model:{' '}
                    {`{ "model-a": { "$gte": 3 }, "model-b": { "$lt": 2 } }`}
                  </ListItem>
                  <ListItem>
                    AND:{' '}
                    {`{ "$and": [{ "model-a": { "$gt": 0.8 } }, { "model-b": { "$gt": 0.7 } }] }`}
                  </ListItem>
                  <ListItem>
                    OR:{' '}
                    {`{ "$or": [{ "model-a": { "$eq": "good" } }, { "model-b": { "$eq": "good" } }] }`}
                  </ListItem>
                </UnorderedList>
                {models && (
                  <p>
                    <strong>Available model IDs: </strong>
                    {models.map((m) => m.modelId).join(', ')}
                  </p>
                )}
              </ToggletipContent>
            </Toggletip>
          </div>
        }
        placeholder={JSON.stringify(expression)}
        value={updatedExpressionText}
        disabled={
          models === undefined ||
          metric === undefined ||
          setExpression === undefined
        }
        invalid={errorMessage !== undefined}
        invalidText={errorMessage}
        onChange={(event) => {
          setUpdatedExpressionText(event.target.value);
        }}
        helperText="Please make sure you select correct model ids and values"
        rows={4}
        id="text-area__expression"
      />
      <div className={classes.actionButtons}>
        <Button
          kind="primary"
          disabled={
            errorMessage !== undefined ||
            models === undefined ||
            metric === undefined ||
            setExpression === undefined
          }
          onClick={() =>
            setExpression
              ? setExpression(JSON.parse(updatedExpressionText))
              : () => {}
          }
        >
          Run
        </Button>
        <Button
          kind="secondary"
          disabled={expression === undefined || isEmpty(expression)}
          onClick={() => {
            setUpdatedExpressionText('{}');
            if (setExpression) {
              setExpression({});
            }
          }}
        >
          Clear
        </Button>
      </div>

      {models === undefined || metric === undefined ? (
        <div className={classes.containerWarning}>
          <WarningAlt />
          <span>You must select a metric before proceeding.</span>
        </div>
      ) : null}
    </div>
  );
}
