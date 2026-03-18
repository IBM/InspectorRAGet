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

import { useMemo } from 'react';
import { HeatmapChart } from '@carbon/charts-react';

import { ModelResult } from '@/src/types';

import ConfusionMatrix from './ConfusionMatrix.ts';
import { ColorLegendType, ScaleTypes } from '@carbon/charts';

function prepareHeatMapData(agreementMap: {
  [key: string]: { [key: string]: ConfusionMatrix };
}): { annotator1: string; annotator2: string; value: number | string }[] {
  const temp: {
    annotator1: string;
    annotator2: string;
    value: number | string;
  }[] = [];
  for (const [worker1, values] of Object.entries(agreementMap)) {
    for (const [worker2, value] of Object.entries(values)) {
      temp.push({
        annotator1: worker1,
        annotator2: worker2,
        // Self-agreement is always 1; off-diagonal may return undefined if not enough data
        value:
          worker1 === worker2
            ? 1.0
            : (value.cohenKappaScore()?.toFixed(2) ?? 0),
      });
    }
  }
  return temp;
}

/** Build pairwise confusion matrices for all annotators from the given metric results. */
function populateTable(results: ModelResult[], metric: string) {
  // Collect unique annotators and metric values from all results
  const workers: Set<string> = new Set<string>();
  const values: Set<string | number> = new Set<string>();

  results.forEach((evaluation) => {
    for (const worker in evaluation[metric]) {
      workers.add(worker);
      values.add(evaluation[metric][worker].value);
    }
  });

  // Build a confusion matrix for each annotator pair
  const confusionMatrices: {
    [key: string]: { [key: string]: ConfusionMatrix };
  } = {};
  workers.forEach((worker1) => {
    confusionMatrices[worker1] = {};
    workers.forEach(
      (worker2) =>
        (confusionMatrices[worker1][worker2] = new ConfusionMatrix(
          Array.from(values),
        )),
    );
  });

  // Populate confusion matrices with pairwise annotation comparisons
  results.forEach((evaluation) => {
    for (const annotator1 of Object.keys(evaluation[metric])) {
      for (const annotator2 of Object.keys(evaluation[metric])) {
        if (annotator1 !== annotator2) {
          confusionMatrices[annotator1][annotator2].addToElement(
            evaluation[metric][annotator1].value,
            evaluation[metric][annotator2].value,
          );
        }
      }
    }
  });

  return confusionMatrices;
}

export default function InterAnnotatorAgreementTable({
  results,
  metric,
  theme,
}: {
  results: ModelResult[];
  metric: string;
  theme?: string;
}) {
  const agreementData = useMemo(
    () => populateTable(results, metric),
    [results, metric],
  );
  return (
    <HeatmapChart
      data={prepareHeatMapData(agreementData)}
      options={{
        // @ts-ignore
        axes: {
          bottom: {
            title: 'annotator',
            mapsTo: 'annotator1',
            scaleType: ScaleTypes.LABELS,
          },
          left: {
            title: 'annotator',
            mapsTo: 'annotator2',
            scaleType: ScaleTypes.LABELS,
          },
        },
        heatmap: {
          colorLegend: {
            type: ColorLegendType.QUANTIZE,
          },
        },
        experimental: false,
        width: '500px',
        height: '500px',
        toolbar: {
          enabled: false,
        },
        theme: theme,
      }}
    ></HeatmapChart>
  );
}
