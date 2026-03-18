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

import { Step } from '@/src/types';
import StepItem from './StepItem';

import classes from './StepGroup.module.scss';

// --- Types ---

interface Props {
  steps: Step[];
  onStepMouseDown?: (stepId: string) => void;
}

interface StepNode {
  step: Step;
  responses: Step[];
}

// --- Helpers ---

// Pair each tool_call with its tool_responses by matching toolCallId.
// All other step types pass through as standalone nodes.
// Temporal order is preserved throughout.
function groupSteps(steps: Step[]): StepNode[] {
  const nodes: StepNode[] = [];
  const callIndex = new Map<string, StepNode>();

  for (const step of steps) {
    if (step.type === 'tool_call') {
      const node: StepNode = { step, responses: [] };
      nodes.push(node);
      callIndex.set(step.toolCallId, node);
    } else if (step.type === 'tool_response') {
      const parent = callIndex.get(step.toolCallId);
      if (parent) {
        parent.responses.push(step);
      } else {
        nodes.push({ step, responses: [] });
      }
    } else {
      nodes.push({ step, responses: [] });
    }
  }

  return nodes;
}

// --- Main component ---

export default function StepGroup({ steps, onStepMouseDown }: Props) {
  const nodes = groupSteps(steps);

  return (
    // .spine wraps all root nodes and draws the continuous vertical line on the left.
    <div className={classes.spine}>
      {nodes.map((node, nodeIdx) => {
        const isLast = nodeIdx === nodes.length - 1;

        if (node.responses.length === 0) {
          return (
            <div
              key={node.step.id}
              className={`${classes.rootNode} ${isLast ? classes.rootNodeLast : ''}`}
            >
              <StepItem
                step={node.step}
                onMouseDown={
                  onStepMouseDown
                    ? () => onStepMouseDown(node.step.id)
                    : undefined
                }
              />
            </div>
          );
        }

        return (
          <div
            key={node.step.id}
            className={`${classes.rootNode} ${isLast ? classes.rootNodeLast : ''}`}
          >
            <StepItem
              step={node.step}
              onMouseDown={
                onStepMouseDown
                  ? () => onStepMouseDown(node.step.id)
                  : undefined
              }
            />
            <div className={classes.children}>
              {node.responses.map((r, rIdx) => (
                <div
                  key={r.id}
                  className={`${classes.childNode} ${rIdx === node.responses.length - 1 ? classes.childNodeLast : ''}`}
                >
                  <StepItem
                    step={r}
                    onMouseDown={
                      onStepMouseDown ? () => onStepMouseDown(r.id) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
