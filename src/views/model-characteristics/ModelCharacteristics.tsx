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
import cx from 'classnames';
import { useState, useMemo } from 'react';
import {
  Select,
  SelectItem,
  FilterableMultiSelect,
  Tag,
  Toggletip,
  ToggletipButton,
  ToggletipContent,
  TextArea,
  Button,
  UnorderedList,
  ListItem,
} from '@carbon/react';
import { WarningAlt, Information } from '@carbon/icons-react';
import { GroupedBarChart } from '@carbon/charts-react';
import { ScaleTypes } from '@carbon/charts';

import { useTheme } from '@/src/theme';
import { Model, ModelResult } from '@/src/types';
import { getModelColorPalette } from '@/src/utilities/colors';
import {
  validateLabelExpression,
  evaluateLabels,
  PLACEHOLDER_EXPRESSION_TEXT,
} from '@/src/utilities/expressions';
import { areObjectsIntersecting } from '@/src/utilities/objects';
import Filters from '@/src/components/filters/Filters';
import TasksTable from '@/src/views/tasks-table/TasksTable';
import { useDataStore } from '@/src/store';

import '@carbon/charts-react/styles.css';
import classes from './ModelCharacteristics.module.scss';

// --- Types ---

interface Props {
  labelsIndex: Map<string, Map<string, Map<string, string>>>;
  models: Model[];
  filters: { [key: string]: string[] };
  onTaskSelection: (taskId: string) => void;
}

// Maximum number of producer-declared values shown as distinct bars.
// Values beyond this are collapsed into "Other" in the chart and value selector.
const TOP_N = 10;
const NA_VALUE = 'N/A';
const OTHER_VALUE = 'Other';

// --- Helpers ---

// Returns the top-N label values by total occurrence count across all models,
// plus the full sorted tail (values that fall outside the top-N).
function computeTopValues(labelSlice: Map<string, Map<string, string>>): {
  topValues: string[];
  otherValues: string[];
} {
  const counts = new Map<string, number>();

  for (const modelMap of labelSlice.values()) {
    for (const value of modelMap.values()) {
      if (value === NA_VALUE) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const topValues = sorted.slice(0, TOP_N).map(([v]) => v);
  const otherValues = sorted.slice(TOP_N).map(([v]) => v);
  return { topValues, otherValues };
}

// Builds the chart dataset from a label slice, task filter, and display values.
// Returns an array of { group, key, value } entries where value is a percentage.
function buildChartData(
  labelSlice: Map<string, Map<string, string>>,
  filteredTaskIds: Set<string>,
  topValues: string[],
  otherValues: string[],
  models: Model[],
): { group: string; key: string; value: number }[] {
  const counts: Map<string, Map<string, number>> = new Map();
  const totals: Map<string, number> = new Map();

  models.forEach((m) => {
    counts.set(m.modelId, new Map());
    totals.set(m.modelId, 0);
  });

  for (const [taskId, modelMap] of labelSlice) {
    if (!filteredTaskIds.has(taskId)) continue;
    for (const [modelId, value] of modelMap) {
      if (!counts.has(modelId)) continue;
      const bucket = topValues.includes(value)
        ? value
        : value === NA_VALUE
          ? NA_VALUE
          : OTHER_VALUE;
      counts
        .get(modelId)!
        .set(bucket, (counts.get(modelId)!.get(bucket) ?? 0) + 1);
      totals.set(modelId, (totals.get(modelId) ?? 0) + 1);
    }
  }

  // Determine which buckets to render: top values + Other (if any) + N/A (if any)
  const bucketsToShow: string[] = [...topValues];
  const hasOther = otherValues.length > 0;
  const hasNA = models.some(
    (m) => (counts.get(m.modelId)?.get(NA_VALUE) ?? 0) > 0,
  );
  if (hasOther) bucketsToShow.push(OTHER_VALUE);
  if (hasNA) bucketsToShow.push(NA_VALUE);

  const result: { group: string; key: string; value: number }[] = [];
  for (const model of models) {
    const modelCounts = counts.get(model.modelId)!;
    const total = totals.get(model.modelId) ?? 0;
    for (const bucket of bucketsToShow) {
      const count = modelCounts.get(bucket) ?? 0;
      result.push({
        group: model.name,
        key: bucket,
        value:
          total > 0
            ? Math.round(((count / total) * 100 + Number.EPSILON) * 100) / 100
            : 0,
      });
    }
  }
  return result;
}

// --- ExpressionBuilderForLabels ---

// Expression builder scoped to label semantics: only $eq, $neq, $in, $nin,
// $and, $or. Surfaces the full value vocabulary in helper text so the user can
// write expressions against values that are collapsed into "Other" in the chart.

interface ExpressionBuilderForLabelsProps {
  expression: object;
  models: Model[];
  labelKey: string;
  valueOptions: string[];
  disabled: boolean;
  setExpression: (expr: object) => void;
}

function ExpressionBuilderForLabels({
  expression,
  models,
  labelKey,
  valueOptions,
  disabled,
  setExpression,
}: ExpressionBuilderForLabelsProps) {
  const [text, setText] = useState(PLACEHOLDER_EXPRESSION_TEXT);

  // When expression is cleared externally (label key change, value selector used),
  // display the placeholder regardless of what the text buffer holds. The parent-
  // driven clear is an explicit reset — the user's in-progress text is intentionally
  // discarded.
  const displayText = isEmpty(expression) ? PLACEHOLDER_EXPRESSION_TEXT : text;

  const validationError = (() => {
    try {
      const parsed = JSON.parse(displayText);
      return validateLabelExpression(
        parsed,
        models.map((m) => m.modelId),
      );
    } catch {
      return 'Invalid JSON';
    }
  })();

  return (
    <div>
      <TextArea
        labelText={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Expression</span>
            <Toggletip align="bottom-left">
              <ToggletipButton label="Syntax reference">
                <Information />
              </ToggletipButton>
              <ToggletipContent>
                <p>
                  <strong>Operators</strong>
                </p>
                <p>Comparison: $eq &nbsp;$neq</p>
                <p>Set: $in &nbsp;$nin</p>
                <p>Logical: $and &nbsp;$or</p>
                <p>
                  <strong>Examples</strong>
                </p>
                <UnorderedList>
                  <ListItem>
                    {`{ "model-id": { "$eq": "force_terminated" } }`}
                  </ListItem>
                  <ListItem>
                    {`{ "model-a": { "$in": ["force_terminated", "N/A"] } }`}
                  </ListItem>
                  <ListItem>
                    {`{ "$and": [{ "model-a": { "$eq": "foo" } }, { "model-b": { "$neq": "foo" } }] }`}
                  </ListItem>
                </UnorderedList>
                {models.length > 0 && (
                  <p>
                    <strong>Model IDs: </strong>
                    {models.map((m) => m.modelId).join(', ')}
                  </p>
                )}
                {valueOptions.length > 0 && (
                  <p>
                    <strong>All values for {labelKey}: </strong>
                    {valueOptions.join(', ')}
                  </p>
                )}
              </ToggletipContent>
            </Toggletip>
          </div>
        }
        placeholder={PLACEHOLDER_EXPRESSION_TEXT}
        value={displayText}
        disabled={disabled}
        invalid={validationError !== null}
        invalidText={validationError ?? undefined}
        onChange={(e) => setText(e.target.value)}
        helperText="Use model IDs as keys. Ordering operators ($gt, $gte, $lt, $lte) are not valid for labels."
        rows={3}
        id={`text-area__label-expression-${labelKey}`}
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <Button
          kind="primary"
          disabled={disabled || validationError !== null}
          onClick={() => setExpression(JSON.parse(displayText))}
        >
          Run
        </Button>
        <Button
          kind="secondary"
          disabled={isEmpty(expression)}
          onClick={() => {
            setText(PLACEHOLDER_EXPRESSION_TEXT);
            setExpression({});
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

// --- Main component ---

export default function ModelCharacteristics({
  labelsIndex,
  models,
  filters,
  onTaskSelection,
}: Props) {
  const { theme } = useTheme();
  const { item: data, resultsMap } = useDataStore();
  const [modelColors, modelOrder] = getModelColorPalette(models);

  const [selectedModels, setSelectedModels] = useState<Model[]>(models);
  // Empty string = overview (all labels shown); non-empty = focused single-label view
  const [selectedLabelKey, setSelectedLabelKey] = useState<string>('');
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [selectedFilters, setSelectedFilters] = useState<{
    [key: string]: string[];
  }>({});
  const [expression, setExpression] = useState<object>({});

  const labelKeys = useMemo(
    () => [...labelsIndex.keys()].sort(),
    [labelsIndex],
  );

  // The raw slice for the focused label key (undefined when in overview mode)
  const focusedLabelSlice = useMemo(
    () => (selectedLabelKey ? labelsIndex.get(selectedLabelKey) : undefined),
    [labelsIndex, selectedLabelKey],
  );

  // All label slices keyed by label key, filtered to selected tasks, for overview mode.
  // Each entry also carries its pre-computed topValues/otherValues so the chart helper
  // doesn't recompute on every render pass.
  const allLabelData = useMemo(() => {
    return labelKeys.map((key) => {
      const slice = labelsIndex.get(key)!;

      // Apply task-level static filters to this slice
      const filteredTaskIds = new Set<string>();
      for (const [taskId, modelMap] of slice) {
        const task = data?.tasks.find((t) => t.taskId === taskId);
        const taskWithFilters = task
          ? { ...Object.fromEntries(modelMap), ...task }
          : Object.fromEntries(modelMap);
        if (
          isEmpty(selectedFilters) ||
          areObjectsIntersecting(selectedFilters, taskWithFilters)
        ) {
          filteredTaskIds.add(taskId);
        }
      }

      const filteredSlice = new Map(
        [...slice].filter(([taskId]) => filteredTaskIds.has(taskId)),
      );
      const { topValues, otherValues } = computeTopValues(filteredSlice);
      const chartData = buildChartData(
        slice,
        filteredTaskIds,
        topValues,
        otherValues,
        selectedModels,
      );

      return { key, slice, filteredTaskIds, topValues, otherValues, chartData };
    });
  }, [labelKeys, labelsIndex, selectedModels, selectedFilters, data?.tasks]);

  // Focused-label data: task filtering, top values, chart — only computed when a
  // label is selected. Uses the same logic as allLabelData but for one key.
  const focusedFilteredTaskIds = useMemo(() => {
    if (!focusedLabelSlice) return new Set<string>();
    const result = new Set<string>();
    for (const [taskId, modelMap] of focusedLabelSlice) {
      const task = data?.tasks.find((t) => t.taskId === taskId);
      const taskWithFilters = task
        ? { ...Object.fromEntries(modelMap), ...task }
        : Object.fromEntries(modelMap);
      if (
        isEmpty(selectedFilters) ||
        areObjectsIntersecting(selectedFilters, taskWithFilters)
      ) {
        result.add(taskId);
      }
    }
    return result;
  }, [focusedLabelSlice, selectedFilters, data?.tasks]);

  const { topValues: focusedTopValues, otherValues: focusedOtherValues } =
    useMemo(() => {
      if (!focusedLabelSlice) return { topValues: [], otherValues: [] };
      const filteredSlice = new Map(
        [...focusedLabelSlice].filter(([taskId]) =>
          focusedFilteredTaskIds.has(taskId),
        ),
      );
      return computeTopValues(filteredSlice);
    }, [focusedLabelSlice, focusedFilteredTaskIds]);

  // Tasks matching the active expression or value selector, for the task table
  const visibleTaskIds = useMemo(() => {
    if (!focusedLabelSlice) return new Set<string>();

    if (!isEmpty(expression)) {
      const filteredSlice = new Map(
        [...focusedLabelSlice]
          .filter(([taskId]) => focusedFilteredTaskIds.has(taskId))
          .map(([taskId, modelMap]) => [
            taskId,
            new Map(
              [...modelMap].filter(([modelId]) =>
                selectedModels.some((m) => m.modelId === modelId),
              ),
            ),
          ]),
      );
      return evaluateLabels(filteredSlice, expression);
    }

    if (selectedValue) {
      const result = new Set<string>();
      for (const [taskId, modelMap] of focusedLabelSlice) {
        if (!focusedFilteredTaskIds.has(taskId)) continue;
        for (const [modelId, value] of modelMap) {
          if (!selectedModels.some((m) => m.modelId === modelId)) continue;
          const bucket = focusedTopValues.includes(value)
            ? value
            : value === NA_VALUE
              ? NA_VALUE
              : OTHER_VALUE;
          if (bucket === selectedValue) {
            result.add(taskId);
            break;
          }
        }
      }
      return result;
    }

    return new Set<string>();
  }, [
    focusedLabelSlice,
    focusedFilteredTaskIds,
    selectedModels,
    selectedValue,
    expression,
    focusedTopValues,
  ]);

  // Denominator shift: when a value or expression is active, use visibleTaskIds
  const focusedChartTaskIds = useMemo(() => {
    if (selectedValue || !isEmpty(expression)) return visibleTaskIds;
    return focusedFilteredTaskIds;
  }, [selectedValue, expression, visibleTaskIds, focusedFilteredTaskIds]);

  const focusedChartData = useMemo(() => {
    if (!focusedLabelSlice) return [];
    return buildChartData(
      focusedLabelSlice,
      focusedChartTaskIds,
      focusedTopValues,
      focusedOtherValues,
      selectedModels,
    );
  }, [
    focusedLabelSlice,
    focusedChartTaskIds,
    focusedTopValues,
    focusedOtherValues,
    selectedModels,
  ]);

  // Results for the task table
  const visibleResults = useMemo(() => {
    if (!resultsMap || visibleTaskIds.size === 0) return [];
    const results: ModelResult[] = [];
    for (const taskId of visibleTaskIds) {
      for (const model of selectedModels) {
        const result = resultsMap.get(`${taskId}::${model.modelId}`);
        if (result) results.push(result);
      }
    }
    return results;
  }, [resultsMap, visibleTaskIds, selectedModels]);

  // Per-(task, model) label values for the task table columns. Scoped to
  // visibleTaskIds and selectedModels so the table only shows relevant rows.
  const columnValues = useMemo(() => {
    if (!focusedLabelSlice || visibleTaskIds.size === 0) return undefined;
    const map = new Map<string, Map<string, string>>();
    for (const taskId of visibleTaskIds) {
      const modelMap = new Map<string, string>();
      for (const model of selectedModels) {
        modelMap.set(
          model.modelId,
          focusedLabelSlice.get(taskId)?.get(model.modelId) ?? '-',
        );
      }
      map.set(taskId, modelMap);
    }
    return map;
  }, [focusedLabelSlice, visibleTaskIds, selectedModels]);

  // Value selector options for the focused label
  const valueOptions = useMemo(() => {
    const opts = [...focusedTopValues];
    if (focusedOtherValues.length > 0) opts.push(OTHER_VALUE);
    const hasNA =
      focusedLabelSlice &&
      [...focusedFilteredTaskIds].some((taskId) =>
        selectedModels.some(
          (m) => focusedLabelSlice.get(taskId)?.get(m.modelId) === NA_VALUE,
        ),
      );
    if (hasNA) opts.push(NA_VALUE);
    return opts;
  }, [
    focusedTopValues,
    focusedOtherValues,
    focusedLabelSlice,
    focusedFilteredTaskIds,
    selectedModels,
  ]);

  // All vocabulary for the focused label, for expression builder helper text
  const allValueOptions = useMemo(
    () => [...focusedTopValues, ...focusedOtherValues, NA_VALUE],
    [focusedTopValues, focusedOtherValues],
  );

  const showTaskTable =
    visibleTaskIds.size > 0 && (selectedValue !== '' || !isEmpty(expression));

  return (
    <div className={classes.page}>
      <div className={classes.selectors}>
        <div className={classes.modelSelector}>
          <FilterableMultiSelect
            id="model-characteristics-model-selector"
            titleText="Choose models"
            items={models}
            selectedItems={selectedModels}
            itemToString={(item) => (item ? item.name : '')}
            onChange={(e) => setSelectedModels(e.selectedItems)}
            invalid={selectedModels.length === 0}
            invalidText="You must select at least one model."
          />
          <div className={classes.tagList}>
            {selectedModels.map((model) => (
              <Tag type="cool-gray" key={`model-${model.modelId}`}>
                {model.name}
              </Tag>
            ))}
          </div>
        </div>

        <div className={classes.labelSelector}>
          <Select
            id="model-characteristics-label-selector"
            labelText="Choose a label"
            value={selectedLabelKey}
            onChange={(e) => {
              setSelectedLabelKey(e.target.value);
              setSelectedValue('');
              setExpression({});
            }}
          >
            <SelectItem value="" text="All" />
            {labelKeys.map((key) => (
              <SelectItem key={key} value={key} text={key} />
            ))}
          </Select>
        </div>

        {selectedLabelKey && (
          <div className={classes.valueSelector}>
            <Select
              id="model-characteristics-value-selector"
              labelText={
                <div className={classes.valueSelectorLabel}>
                  <span>Choose a value</span>
                  {focusedOtherValues.length > 0 && (
                    <Toggletip align="bottom-left">
                      <ToggletipButton label="Values grouped under Other">
                        <Information size={16} />
                      </ToggletipButton>
                      <ToggletipContent>
                        <p>
                          <strong>
                            {focusedOtherValues.length} value
                            {focusedOtherValues.length !== 1 ? 's' : ''} grouped
                            under Other:
                          </strong>
                        </p>
                        <ul className={classes.otherList}>
                          {focusedOtherValues.map((v) => (
                            <li key={v}>{v}</li>
                          ))}
                        </ul>
                      </ToggletipContent>
                    </Toggletip>
                  )}
                </div>
              }
              value={selectedValue}
              disabled={!isEmpty(expression)}
              onChange={(e) => setSelectedValue(e.target.value)}
            >
              <SelectItem value="" text="All" />
              {valueOptions.map((v) => (
                <SelectItem key={v} value={v} text={v} />
              ))}
            </Select>
          </div>
        )}
      </div>

      <Filters
        keyPrefix="ModelCharacteristics"
        filters={filters}
        selectedFilters={selectedFilters}
        setSelectedFilters={setSelectedFilters}
        models={selectedModels}
        expression={selectedLabelKey ? expression : undefined}
        expressionBuilder={
          selectedLabelKey ? (
            <ExpressionBuilderForLabels
              expression={expression}
              models={selectedModels}
              labelKey={selectedLabelKey}
              valueOptions={allValueOptions}
              disabled={selectedValue !== ''}
              setExpression={(expr: object) => {
                setExpression(expr);
                setSelectedValue('');
              }}
            />
          ) : undefined
        }
      />

      {/* Overview mode: one chart per label key */}
      {!selectedLabelKey && (
        <div className={classes.row}>
          <div
            className={cx(
              labelKeys.length > 3 ? classes.graphsGrid : classes.graphsFlex,
            )}
          >
            {allLabelData.map(({ key, chartData, filteredTaskIds, slice }) => (
              <div key={`label-${key}`} className={classes.graph}>
                <h5 className={classes.graphTitle}>
                  <strong>{key}</strong>
                  <span>{`(${filteredTaskIds.size}/${slice.size})`}</span>
                </h5>
                {chartData.length === 0 ? (
                  <div className={classes.warningContainer}>
                    <WarningAlt
                      height="24px"
                      width="24px"
                      className={classes.warningContainerIcon}
                    />
                    <span className={classes.warningContainerText}>
                      No data.
                    </span>
                  </div>
                ) : (
                  <GroupedBarChart
                    data={chartData}
                    options={{
                      axes: {
                        left: {
                          mapsTo: 'value',
                          ticks: { formatter: (tick) => tick + '%' },
                          domain: [0, 100],
                        },
                        bottom: {
                          scaleType: ScaleTypes.LABELS,
                          mapsTo: 'key',
                        },
                      },
                      width: labelKeys.length === 1 ? '80%' : '500px',
                      height: '500px',
                      toolbar: { enabled: false },
                      color: { scale: modelColors },
                      legend: { order: modelOrder },
                      theme,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Focused mode: single-label chart with value selector and task table */}
      {selectedLabelKey && (
        <>
          {focusedChartData.length === 0 ? (
            <div className={classes.warningContainer}>
              <WarningAlt
                height="32px"
                width="32px"
                className={classes.warningContainerIcon}
              />
              <span className={classes.warningContainerText}>
                No data for the current selection.
                {!isEmpty(selectedFilters)
                  ? ' Try removing one or more filters.'
                  : ''}
              </span>
            </div>
          ) : (
            <div className={classes.row}>
              <div className={classes.graph}>
                <h5 className={classes.graphTitle}>
                  <strong>{selectedLabelKey}</strong>
                  <span>{`(${focusedChartTaskIds.size}/${focusedLabelSlice?.size ?? 0})`}</span>
                </h5>
                <GroupedBarChart
                  data={focusedChartData}
                  options={{
                    axes: {
                      left: {
                        mapsTo: 'value',
                        ticks: { formatter: (tick) => tick + '%' },
                        domain: [0, 100],
                      },
                      bottom: {
                        scaleType: ScaleTypes.LABELS,
                        mapsTo: 'key',
                      },
                    },
                    width: '80%',
                    height: '500px',
                    toolbar: { enabled: false },
                    color: { scale: modelColors },
                    legend: { order: modelOrder },
                    theme,
                  }}
                />
              </div>
            </div>
          )}

          {showTaskTable && data && (
            <div className={classes.row}>
              <h4>Tasks</h4>
              <TasksTable
                metrics={[]}
                results={visibleResults}
                models={selectedModels}
                filters={filters}
                onClick={onTaskSelection}
                columnValues={columnValues}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
