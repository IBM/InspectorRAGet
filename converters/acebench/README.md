# ACEBench Converter

Converts [ACEBench](https://github.com/chenchen0103/ACEBench) evaluation run output into InspectorRAGet JSON files.

---

## Quick Start

```bash
# 1. Download the dataset once (into converters/acebench/dataset/).
./download_dataset.sh

# 2. Convert one experiment — tool_calling categories (default):
python convert.py \
    --runs-dir runs/my_experiment \
    --dataset-dir dataset/

# 3. Convert agentic categories:
python convert.py \
    --runs-dir runs/my_experiment \
    --dataset-dir dataset/ \
    --task-type agentic

# 4. Convert both task types in one invocation:
python convert.py \
    --runs-dir runs/my_experiment \
    --dataset-dir dataset/ \
    --task-type all \
    --name "My ACEBench Experiment"
```

Output defaults to `acebench_<task_type>.json` inside `--runs-dir`. With `--task-type all`, two files are written: `acebench_tool_calling.json` and `acebench_agentic.json`.

### All Options

| Flag            | Required | Default                                         | Description                                                                                     |
| --------------- | -------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `--runs-dir`    | Yes      |                                                 | Experiment directory containing `result/`, `score/`, `dialogue_history/`                        |
| `--dataset-dir` | Yes      |                                                 | Dataset directory produced by `download_dataset.sh`                                             |
| `--task-type`   | No       | `tool_calling`                                  | `tool_calling`, `agentic`, or `all`                                                             |
| `--name`        | No       | `ACEBench Evaluation`                           | Display name shown in InspectorRAGet                                                            |
| `--output`      | No       | `acebench_<task_type>.json` inside `--runs-dir` | Output file path (used as stem for `--task-type all`)                                           |
| `--validate`    | No       | off                                             | Cross-check computed per-category accuracy against score file headers and print a summary table |

---

## What Is ACEBench?

ACEBench is a function-calling and agentic evaluation benchmark that tests language models across 17 task categories, ranging from atomic single-turn API calls to multi-turn goal-directed agent tasks. Tasks are structured around realistic API simulations with well-defined ground truth.

The benchmark is split into two task types used by this converter:

| Task Type                                   | Categories                                       | InspectorRAGet Type |
| ------------------------------------------- | ------------------------------------------------ | ------------------- |
| Single-turn and short multi-turn tool calls | `data_normal_*`, `data_special_*` (15 total)     | `tool_calling`      |
| Goal-directed multi-step agent execution    | `data_agent_multi_step`, `data_agent_multi_turn` | `agentic`           |

---

## Dataset Download

Unlike BFCL, ACEBench run output does not embed task definitions or ground truth. You must download the dataset separately before running the converter.

`download_dataset.sh` fetches all 17 task definition files and their corresponding ground truth files from the ACEBench GitHub repository into `converters/acebench/dataset/`:

```bash
./download_dataset.sh
# → dataset/data_normal_atom_bool.json
# → dataset/possible_answer/data_normal_atom_bool.json
# → ... (34 files total)
```

The script is idempotent: already-downloaded files are skipped. Pass `--dataset-dir dataset/` to the converter once the download is complete.

---

## Run Directory Layout

Each experiment is a self-contained directory. `--runs-dir` points directly to one experiment; run the converter once per experiment.

```
runs/
├── my_experiment/               ← pass this as --runs-dir
│   ├── result/
│   │   ├── model_a/
│   │   │   ├── data_normal_atom_bool_result.json
│   │   │   ├── ...
│   │   │   ├── data_agent_multi_step_result.json
│   │   │   └── data_agent_multi_turn_result.json
│   │   └── model_b/
│   │       └── ...
│   ├── score/
│   │   ├── model_a/
│   │   │   ├── data_normal_atom_bool_score.json
│   │   │   ├── ...
│   │   │   ├── data_agent_multi_step_score.json
│   │   │   ├── data_agent_multi_step_process.json
│   │   │   ├── data_agent_multi_turn_score.json
│   │   │   └── data_agent_multi_turn_process.json
│   │   └── model_b/
│   │       └── ...
│   └── dialogue_history/
│       ├── model_a/
│       │   ├── multi_step/
│       │   │   └── <N>_dialogue_history.txt
│       │   └── multi_turn/
│       │       └── <N>_dialogue_history.txt
│       └── model_b/
│           └── ...
└── another_experiment/
    └── ...
```

Each subdirectory under `result/` is one model configuration and becomes a distinct model entry in the output. The converter strips the longest common prefix and suffix shared across all config names to produce shorter display names (e.g., `exp_modelA_run1` and `exp_modelB_run1` → `modelA` and `modelB`).

`converters/acebench/runs/` is gitignored and is a convenient local scratch space.

---

## Task Categories

### Tool-Calling (15 categories)

| File Stem                                   | Description                                            |
| ------------------------------------------- | ------------------------------------------------------ |
| `data_normal_atom_bool`                     | Single API call, boolean parameter                     |
| `data_normal_atom_enum`                     | Single API call, enum parameter                        |
| `data_normal_atom_list`                     | Single API call, list parameter                        |
| `data_normal_atom_number`                   | Single API call, numeric parameter                     |
| `data_normal_atom_object_short`             | Single API call, shallow object parameter              |
| `data_normal_atom_object_deep`              | Single API call, deeply nested object parameter        |
| `data_normal_single_turn_single_function`   | Single turn, one relevant function among distractors   |
| `data_normal_single_turn_parallel_function` | Single turn, multiple parallel function calls required |
| `data_normal_multi_turn_user_adjust`        | Short multi-turn, user refines an earlier request      |
| `data_normal_multi_turn_user_switch`        | Short multi-turn, user switches to a different task    |
| `data_normal_similar_api`                   | Selection between semantically similar APIs            |
| `data_normal_preference`                    | User expresses stylistic or preference constraints     |
| `data_special_error_param`                  | Input contains an invalid or out-of-range parameter    |
| `data_special_incomplete`                   | User request is underspecified                         |
| `data_special_irrelevant`                   | Request cannot be answered by any available function   |

### Agentic (2 categories)

| File Stem               | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `data_agent_multi_step` | Sequential steps against simulated API services                |
| `data_agent_multi_turn` | Multi-turn user interaction with agent over multiple exchanges |

---

## Metrics

### Tool-Calling Metrics

| Metric               | Type        | Aggregator | Description                                                  |
| -------------------- | ----------- | ---------- | ------------------------------------------------------------ |
| `ace_correctness`    | categorical | majority   | Whether the predicted function call matches the ground truth |
| `ace_error_severity` | categorical | majority   | Recoverability-anchored severity category (see scale below)  |
| `ace_error_type`     | text        |            | Raw ACEBench `error_type` string; `"none"` for correct tasks |
| `ace_error`          | text        |            | Human-readable error detail; `"none"` for correct tasks      |

### Agentic Metrics

Includes all tool-calling metrics plus:

| Metric                 | Type      | Aggregator | Description                                             |
| ---------------------- | --------- | ---------- | ------------------------------------------------------- |
| `ace_process_accuracy` | numerical | mean       | Fraction of milestones correctly completed (0.0 to 1.0) |

The `ace_correctness` description changes for agentic: it reflects end-to-end state match rather than next-call prediction.

### Error Severity Scale

Severity is a recoverability-anchored categorical scale. The anchor question is: how hard would this error be to fix?

| Score | Value               | Display Name      | Meaning                                                            |
| ----- | ------------------- | ----------------- | ------------------------------------------------------------------ |
| 0.00  | `correct`           | Correct           | Output matches ground truth                                        |
| 0.25  | `extra_arguments`   | Extra Arguments   | Right function, extra parameters included                          |
| 0.25  | `missing_arguments` | Missing Arguments | Right function, required parameters omitted                        |
| 0.25  | `wrong_arguments`   | Wrong Arguments   | Right function, wrong parameter types or values                    |
| 0.50  | `wrong_function`    | Wrong Function    | Wrong function called, wrong count, or wrong final state structure |
| 0.75  | `irrelevance_error` | Irrelevance Error | Model called a function when none was appropriate                  |
| 1.00  | `malformed_output`  | Malformed Output  | Output could not be parsed as a function call                      |

### Error Type to Severity Mapping

| `error_type` (raw)                | Severity Value      | Score |
| --------------------------------- | ------------------- | ----- |
| `addition_args`                   | `extra_arguments`   | 0.25  |
| `lack_args`                       | `missing_arguments` | 0.25  |
| `type_error`                      | `wrong_arguments`   | 0.25  |
| `value_error`                     | `wrong_arguments`   | 0.25  |
| `value_error:string`              | `wrong_arguments`   | 0.25  |
| `value_error:list/tuple`          | `wrong_arguments`   | 0.25  |
| `value_error:list_dict_count`     | `wrong_arguments`   | 0.25  |
| `class attributes wrong`          | `wrong_arguments`   | 0.25  |
| `function_mismatch`               | `wrong_function`    | 0.50  |
| `wrong functions number`          | `wrong_function`    | 0.50  |
| `simple_function_checker:unclear` | `wrong_function`    | 0.50  |
| `wrong number of class`           | `wrong_function`    | 0.50  |
| `error_detection`                 | `irrelevance_error` | 0.75  |
| `wrong_output_format`             | `malformed_output`  | 1.00  |

Unrecognised error types are assigned `unknown` at score 0.5 (same level as `wrong_function`).

---

## Data Mapping

This section describes how each ACEBench source field maps to the InspectorRAGet schema.

### Task: `tool_calling`

| InspectorRAGet Field | Source                                      | Notes                                                                                                                              |
| -------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `task_id`            | `id` from dataset file                      | e.g., `"normal_atom_bool_0"`                                                                                                       |
| `task_type`          | hardcoded                                   | `"tool_calling"`                                                                                                                   |
| `input`              | `question` from dataset file                | Parsed into `Message[]` (see Question Parsing below)                                                                               |
| `tools`              | `function` array from dataset file          | Normalized (see Tool Normalization below)                                                                                          |
| `targets`            | `possible_answer` from possible-answer file | One `TaskTarget` with `type: "tool_calls"` for normal categories; `type: "text"` for special categories (see Target Formats below) |
| `ace_category`       | filename stem                               | e.g., `"normal_atom_bool"`, `"special_irrelevant"`                                                                                 |

### ModelResult: `tool_calling`

| InspectorRAGet Field        | Source                                | Notes                                                                          |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `model_id`                  | config directory name under `result/` | Full name used as ID; display name shortened by stripping common prefix/suffix |
| `output`                    | `result` from result file             | Single `Message` with `role: "assistant"`                                      |
| `scores.ace_correctness`    | absence/presence in score file        | Absent = passing (`"true"`); present = failing (`"false"`)                     |
| `scores.ace_error_severity` | derived from `error_type`             | `"correct"` / `0.0` for passing tasks                                          |
| `scores.ace_error_type`     | `error_type` from score file          | `"none"` for passing tasks                                                     |
| `scores.ace_error`          | `error` from score file               | Flattened to string; `"none"` for passing tasks                                |

### Task: `agentic`

| InspectorRAGet Field | Source                                                  | Notes                                                                                                                                              |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task_id`            | `id` from dataset file                                  | e.g., `"agent_multi_step_0"`                                                                                                                       |
| `task_type`          | hardcoded                                               | `"agentic"`                                                                                                                                        |
| `input`              | `question` from dataset file                            | Single `Message` with `role: "user"` (plain string, no embedded turns)                                                                             |
| `contexts`           | `initial_config` from dataset file                      | Serialized as a JSON string with `title: "Initial State"`                                                                                          |
| `tools`              | `function` array from dataset file                      | Same normalization as tool-calling                                                                                                                 |
| `targets`            | `ground_truth` + `mile_stone` from possible-answer file | `ground_truth` → `type: "state"` (expected final API state object); `mile_stone` → `type: "text"` (expected execution sequence, one call per line) |
| `ace_category`       | filename stem                                           | `"agent_multi_step"` or `"agent_multi_turn"`                                                                                                       |

### ModelResult: `agentic`

| InspectorRAGet Field          | Source                                | Notes                                                                                                                |
| ----------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `model_id`                    | config directory name under `result/` | Same shortening logic as tool-calling                                                                                |
| `output`                      | dialogue history file                 | Full execution thread as `Message[]`; falls back to `process` array from result file when no history file is present |
| `scores.ace_correctness`      | absence/presence in score file        | Absent = passing; present = failing                                                                                  |
| `scores.ace_process_accuracy` | `process_accuracy` from process file  | `1.0` for passing tasks                                                                                              |
| `scores.ace_error_severity`   | derived from `error_type`             | `"correct"` / `0.0` for passing tasks                                                                                |
| `scores.ace_error_type`       | `error_type` from score file          | `"none"` for passing tasks                                                                                           |
| `scores.ace_error`            | `error` from score file               | Nested state-diff arrays flattened to a single string; `"none"` for passing tasks                                    |

---

## Transformation Details

### Question Parsing

The `question` field in dataset files is a single string. Tool-calling tasks embed multiple turns using role prefixes:

```
"user: I'm looking for a list of high protein meals for dinner.\nsystem: Could you specify your preferred cuisine?\nuser: Asian cuisine, please.\n"
```

The converter splits on newlines, strips the `user:` / `system:` prefix, and emits each segment as a `Message`. `user:` maps to `role: "user"` and `system:` maps to `role: "assistant"` (it represents a prior model response in context).

Agentic questions are plain strings with no prefix and become a single `role: "user"` message.

### Tool Definition Normalization

ACEBench tool definitions use `arguments` and `parameters` inconsistently as the property key within the same record. The converter normalizes both to `parameters` and replaces `"type": "dict"` with `"type": "object"` throughout, producing valid JSON Schema.

### Target Formats by Category

| Category Type                    | Ground Truth Shape                | Target Type  | Notes                                            |
| -------------------------------- | --------------------------------- | ------------ | ------------------------------------------------ |
| Normal tool-calling              | `{"func": {"arg": value}}`        | `tool_calls` | One call per function name key                   |
| Special irrelevant               | `"explanation string"`            | `text`       | Model should detect the error                    |
| Special incomplete / error_param | `{"func": ["missing_param"]}`     | `text`       | JSON-serialized; no valid call exists            |
| Agentic                          | list of `{"ServiceClass": {...}}` | `state`      | Parsed object, not a JSON string                 |
| Agentic milestones               | list of call strings              | `text`       | One line per step; nested lists joined with `OR` |

### Dialogue History as Execution Thread

For agentic tasks, `<N>_dialogue_history.txt` (where `N` is the task's integer index) is a tab-separated markdown table with columns: `message_index`, `sender`, `recipient`, `content`. Each row becomes one `Message`:

| `sender` value | InspectorRAGet `role` |
| -------------- | --------------------- |
| `user`         | `user`                |
| `agent`        | `assistant`           |
| `execution`    | `tool`                |

Content that wraps across multiple table rows is rejoined automatically. When no dialogue history file exists, the converter falls back to the `process` array from the result file, emitting each entry as an `assistant` message.

### Score File Structure

Score files record only failures. A passing task is identified by its absence from the score file. The first line of every score file is an aggregate header (accuracy summary); task records begin on the second line.

Agentic score records use integer IDs while task IDs in dataset and result files are strings. The converter derives the integer index from the task ID suffix (e.g., `"agent_multi_step_3"` → `3`) for score and process file lookups.

### Model Display Names

Config directory names are used as `model_id`. The `name` field (shown in the UI) is shortened by stripping the longest common prefix and common suffix shared across all config names in the experiment. If stripping would produce an empty name for any config, all configs fall back to their full names.

---

## Message Status Badges

Each assistant and tool message in the execution thread carries two metadata fields stamped by the converter:

- `metadata.status` — one of `pass`, `warn`, or `fail`; InspectorRAGet renders this as a coloured badge.
- `metadata.statusDefinition` — a human-readable explanation shown as a hover tooltip on the badge.

| Status | Colour | Meaning                                                                                                                                   |
| ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pass` | Green  | Model produced accepted output in a single step.                                                                                          |
| `warn` | Yellow | Model required one or more intermediate steps before producing accepted output. Open the Trace tab to inspect the intermediate reasoning. |
| `fail` | Red    | Turn did not complete. The ACEBench runner terminated this turn before an accepted output was reached.                                    |

### How status is derived for assistant messages

**No trace (tool-calling tasks and process-array fallback):**

- Message has `tool_calls` or `content`: `pass`.

**Trace present (agentic tasks with dialogue history):**

The trace records intermediate attempts (NL responses rejected by the coercion loop, tool-call steps preceding the accepted output). The accepted output itself lives on the message as `tool_calls` or `content`.

- Trace ends on `tool_execution` or `observation`, and the message has `tool_calls` or `content`: `warn`. The model eventually produced an accepted output; the trace shows what happened before it.
- Trace ends on `invocation` or `observation`, and the message has **no** `tool_calls` or `content`: `fail`. The runner terminated the turn before any accepted output was reached. The tooltip gives a specific cause:

| Observation content contains | Tooltip                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `"budget exhausted"`         | Runner exhausted the 20-invocation budget before an accepted output was reached.                              |
| `"NL response"`              | Model produced only natural-language text when a tool call was expected, and the runner budget was exhausted. |
| (anything else)              | Runner terminated this turn before an accepted output was reached.                                            |

### How status is derived for tool messages

- Content contains `"status: False"`: `fail` (ACEBench environment reported a tool execution failure).
- Otherwise: `pass`.
