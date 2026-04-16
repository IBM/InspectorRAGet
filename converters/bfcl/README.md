# BFCL Converter

Converts [Berkeley Function-Calling Leaderboard (BFCL)](https://gorilla.cs.berkeley.edu) output directories into an InspectorRAGet JSON file for instance-level analysis.

---

## Quick Start

```bash
# Single-turn categories (full fidelity — with dataset files).
# Output defaults to bfcl_tool_calling.json inside --bfcl-root:
python convert.py \
    --bfcl-root runs/my_experiment \
    --dataset-dir dataset/v4/ \
    --name "My BFCL Evaluation"

# Single-turn without dataset files (failing tasks only):
python convert.py \
    --bfcl-root runs/my_experiment

# Multi-turn (agentic) categories:
python convert.py \
    --bfcl-root runs/my_experiment \
    --dataset-dir dataset/v4/ \
    --task-type agentic \
    --name "My BFCL Multi-Turn Evaluation"

```

> **Do not write output to `data/`.** The `data/` directory is reserved for pre-loaded examples shipped with the app. BFCL outputs are per-run artifacts: use the default path (inside `--bfcl-root`) or an explicit path outside `data/`.

### All Options

| Flag            | Required | Default                                      | Description                                                |
| --------------- | -------- | -------------------------------------------- | ---------------------------------------------------------- |
| `--bfcl-root`   | Yes      |                                              | Experiment directory containing one subdirectory per model |
| `--dataset-dir` | No       |                                              | Directory with BFCL dataset files for passing-task prompts |
| `--task-type`   | No       | `tool_calling`                               | `tool_calling` or `agentic`                                |
| `--name`        | No       | `BFCL Evaluation`                            | Display name in InspectorRAGet                             |
| `--output`      | No       | `bfcl_<task_type>.json` inside `--bfcl-root` | Output file path                                           |

---

## What Is BFCL?

BFCL has two structurally different evaluation paradigms:

| BFCL Categories                                                                                                                                            | Paradigm                                                                                                                                         | Converter Flag             | Status    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | --------- |
| `simple` (V3), `simple_python` (V4), `multiple`, `parallel`, `parallel_multiple`, `irrelevance`, `live_*`, `java`, `javascript`, `format_sensitivity` (V4) | **Next-response prediction:** input is the conversation history, output is the predicted next tool call(s), ground truth is the expected call(s) | `--task-type tool_calling` | Supported |
| `multi_turn_base`, `multi_turn_miss_func`, `multi_turn_miss_param`, `multi_turn_long_context`, `web_search` (V4), `memory` (V4)                            | **Goal-directed agentic execution:** model drives a stateful virtual environment to a goal; ground truth is the per-turn expected call sequence  | `--task-type agentic`      | Supported |

**Why the split matters:** Papers reporting "BFCL overall accuracy" combine both paradigms. Each converter run produces a separate InspectorRAGet file. Name them clearly (e.g., "BFCL Single-Turn" vs. "BFCL Multi-Turn") since the task type and view layout differ.

**Note on java and javascript categories:** Tool definitions use Java/JavaScript type vocabulary (`HashMap`, `ArrayList`, `Boolean`, etc.) rather than JSON Schema types. InspectorRAGet renders these type names as-is. Model output argument values in these categories are language-syntax strings (e.g., `new ArrayList<String>(Arrays.asList("a", "b"))`) rather than JSON values, which also renders correctly as text in the task view.

---

## Run Directory Layout

Each invocation of `convert.py` converts one experiment. `--bfcl-root` points to the experiment directory (not a parent `runs/` folder). Each model evaluated in that experiment is a subdirectory inside `--bfcl-root`.

A standard BFCL run for a single model produces this layout:

```
<model-name>/
├── result/
│   └── <model-id>/
│       ├── BFCL_v3_simple_result.json
│       ├── BFCL_v3_multiple_result.json
│       └── ... (one file per category)
└── score/
    └── <model-id>/
        ├── BFCL_v3_simple_score.json
        └── ... (one file per category)
```

These two directory levels serve different purposes:

- `<model-name>` is the human-readable display label shown in InspectorRAGet's model selector. It can be anything descriptive (e.g. `gpt-4o`).
- `<model-id>` is the data key used to join result and score records across all tasks and metrics. It must match exactly between `result/` and `score/`. In standard BFCL runs this is typically the versioned model string (e.g. `gpt-4o-2024-11-20`).

Both levels are required. The converter reads `<model-name>` for display and `<model-id>` as the internal key; collapsing them to the same value works fine if you have no need to distinguish the two.

To compare multiple models, place each model's directory as a sibling under a shared experiment root:

```
runs/
├── my_experiment/               ← pass this as --bfcl-root
│   ├── ModelA/                  ← display name
│   │   ├── result/
│   │   │   └── model-a-v1/     ← data key (model-id)
│   │   │       └── *.json
│   │   └── score/
│   │       └── model-a-v1/
│   │           └── *.json
│   └── ModelB/
│       ├── result/
│       │   └── model-b-v1/
│       │       └── *.json
│       └── score/
│           └── model-b-v1/
│               └── *.json
└── another_experiment/
    └── ...
```

`converters/bfcl/runs/` is gitignored and is a convenient local scratch space.

> **Common mistake: pipeline variants or category subdirectories as direct children of `--bfcl-root`.**
> The converter treats every direct child of `--bfcl-root` that contains a `result/` or `score/` subdirectory as a separate model. If your run produces subdirectories by pipeline configuration, category, or any other dimension instead of by model (for example `simple_pipeline/result/my-model/` and `simple_pipeline_clarify/result/my-model/`), the converter will see each subdirectory as its own "model", then discover the same model-id inside each one, and silently overwrite earlier data with later data, leaving only one model in the output.
>
> To fix this, wrap your run in a model-named directory so the layout matches what the converter expects:
>
> ```
> runs/
> └── my_experiment/               ← pass this as --bfcl-root
>     └── my-model/                ← model directory
>         ├── result/
>         │   └── my-model/
>         │       ├── BFCL_v3_multi_turn_base_result.json
>         │       └── ...
>         └── score/
>             └── my-model/
>                 └── ...
> ```

---

## Dataset Files (Recommended)

BFCL dataset files contain the full task definitions — conversation history, tool definitions, and ground-truth answers — for every task regardless of pass/fail outcome.

Without them, passing tasks will have no `input`, `tools`, or `targets` fields, which limits what InspectorRAGet can show for those instances.

### Two File Sets Are Required

| Directory                                      | Content                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `data/BFCL_v3_<category>.json`                 | Task definitions: conversation history and tool definitions. One record per line: `{"id": ..., "question": [[...]], "function": [...]}` |
| `data/possible_answer/BFCL_v3_<category>.json` | Correct function calls for every task. One record per line: `{"id": ..., "ground_truth": [{func_name: {arg: [values]}}]}`               |

Score files embed both the task definition and ground truth inline for failing tasks, so they cover failures without the dataset files. But passing tasks only have their ground truth in the `possible_answer/` files.

### Downloading the Dataset

```bash
# Download v4 (default)
./converters/bfcl/download_dataset.sh

# Download v3
./converters/bfcl/download_dataset.sh v3
```

The script downloads into `dataset/v3/` or `dataset/v4/` respectively and skips files that already exist. Pass the versioned subdirectory to `--dataset-dir`:

```bash
python convert.py --bfcl-root runs/my_experiment --dataset-dir dataset/v4/
python convert.py --bfcl-root runs/my_experiment --dataset-dir dataset/v3/
```

Source URLs:

- **V3:** `github.com/ShishirPatil/gorilla` at commit `cd9429c`, path `berkeley-function-call-leaderboard/bfcl_eval/data/`
- **V4:** `github.com/ShishirPatil/gorilla` at `main`, same path

---

## Metrics

### Tool-Calling Metrics

| Metric                     | Type        | Aggregator | Description                                                                               |
| -------------------------- | ----------- | ---------- | ----------------------------------------------------------------------------------------- |
| `bfcl_correctness`         | categorical | majority   | Binary pass/fail: `correct` (1) or `incorrect` (0)                                        |
| `bfcl_error_severity`      | categorical | majority   | Recoverability-anchored severity score (see scale below)                                  |
| `bfcl_errors`              | text        |            | Full error messages from BFCL, joined as a single string; `"none"` for correct tasks      |
| `bfcl_latency_total_s`     | numerical   | mean       | Wall-clock inference time in seconds                                                      |
| `bfcl_input_tokens_total`  | numerical   | mean       | Total input token count (not directly comparable across models with different tokenizers) |
| `bfcl_output_tokens_total` | numerical   | mean       | Total output token count (same cross-model caveat as input tokens)                        |

### Error Severity Scale

| Value               | Score | Meaning                                                    | BFCL Source                                                                                 |
| ------------------- | ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `correct`           | 0.0   | No error                                                   | `valid: true`                                                                               |
| `wrong_arguments`   | 0.25  | Right function, wrong argument values or types             | `type_error:*`, `value_error:*`, `missing_optional`, `missing_required`, `unexpected_param` |
| `wrong_function`    | 0.5   | Called the wrong function or wrong number of functions     | `wrong_func_name`, `wrong_count`, `cannot_find_match`                                       |
| `unknown`           | 0.5   | Error type not in the known mapping                        | Any `error_type` not listed above                                                           |
| `irrelevance_error` | 0.75  | Called a function when none was appropriate, or vice versa | `irrelevance_error:decoder_success`                                                         |
| `malformed_output`  | 1.0   | Output could not be decoded into any function call         | No `model_result_decoded`; `ast_decoder:*`; `relevance_error:decoder_failed`                |

### Labels

InspectorRAGet labels are per-(task, model) nominal descriptors that characterise output without scoring it. They have no ordering or aggregation semantics and appear in the Model Characteristics tab as grouped bar charts showing distribution across models.

| Label        | Description                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `Error Type` | Categorical error classifier for each result; `"none"` for correct tasks, `"N/A"` if error type is unknown |

`error_type` is a label rather than a metric because it is a categorical classifier with no natural ordering or aggregation. Using it as a metric would imply ordinal meaning that does not exist. As a label it enables distribution analysis across models in Model Characteristics — the question researchers actually want to answer is "which error categories appear most often for this model?" not "what is the average error type?"

For single-turn tasks, `Error Type` values are raw BFCL strings such as `type_error:nested`, `wrong_func_name`, `irrelevance_error:decoder_success`, and `none`. For multi-turn tasks, see the table below.

### Multi-Turn Error Types

For agentic tasks, the `Error Type` label uses the raw BFCL `error_type` string with the `multi_turn:` prefix stripped (e.g., `instance_state_mismatch` instead of `multi_turn:instance_state_mismatch`). The agentic context is implied by the dataset.

| Error Type (label value)      | Severity (`bfcl_error_severity`) | Meaning                                                                                                         |
| ----------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `none`                        | `correct` (0.0)                  | Task completed successfully                                                                                     |
| `execution_response_mismatch` | `wrong_arguments` (0.25)         | Right function(s) but environment responses differed from ground truth                                          |
| `instance_state_mismatch`     | `wrong_function` (0.5)           | Final environment state does not match ground truth                                                             |
| `empty_turn_model_response`   | `malformed_output` (1.0)         | Model produced no tool calls for a turn that required them                                                      |
| `force_terminated`            | `malformed_output` (1.0)         | Runner hit the 20-step budget cap (step budget exhausted across all turns, or too many retries within one turn) |
| `inference_error`             | `malformed_output` (1.0)         | Inference failure (e.g., context overflow, API error) during the run                                            |

---

## Data Mapping

### Source File Schemas

#### Result Files (`result/<model-id>/BFCL_v3_<category>_result.json`)

One JSON object per line. Contains the raw model output and timing for one task:

```json
{
  "id": "simple_0",
  "result": "[get_current_weather(city='Boston')]",
  "inference_log": [...],
  "input_token_count": 384,
  "output_token_count": 13,
  "latency": 0.598
}
```

#### Score Files (`score/<model-id>/BFCL_v3_<category>_score.json`)

One JSON object per line. The **first line** is an aggregate header (skipped by the converter):

```json
{ "accuracy": 0.9575, "correct_count": 383, "total_count": 400 }
```

Subsequent lines are **failures only** (passing tasks are omitted):

```json
{
  "id": "simple_13",
  "model_name": "model-name",
  "test_category": "simple",
  "valid": false,
  "error": ["Nested type checking failed for parameter 'interval'. ..."],
  "error_type": "type_error:nested",
  "prompt": {
    "id": "simple_13",
    "question": [[{"role": "user", "content": "..."}]],
    "function": [{ "name": "...", "description": "...", "parameters": { ... } }]
  },
  "model_result_raw": "[calculate_area_under_curve(function=\"x**2\", interval=[1, 3])]",
  "model_result_decoded": [{ "calculate_area_under_curve": { ... } }],
  "possible_answer": [{ "calculate_area_under_curve": { "function": [...], "interval": [...] } }]
}
```

### Task Fields

| InspectorRAGet Field | Source                                             | Notes                               |
| -------------------- | -------------------------------------------------- | ----------------------------------- |
| `task_id`            | `id` from score or dataset file                    | e.g., `"simple_0"`                  |
| `task_type`          | hardcoded                                          | `"tool_calling"` or `"agentic"`     |
| `input`              | `question` from dataset or score prompt            | Conversation history as `Message[]` |
| `tools`              | `function` from dataset or score prompt            | JSON Schema tool definitions        |
| `targets`            | `possible_answer` from answer file or score record | See Ground Truth below              |
| `bfcl_category`      | `test_category` from score file or task ID prefix  | e.g., `"simple"`, `"live_parallel"` |

### Ground Truth (`targets`)

BFCL's ground truth is a list where every element is a required parallel call (AND semantics). Simple and multiple categories have one element; parallel and parallel_multiple categories have multiple. The entire list maps to a single `TaskTarget`:

- All elements become one `TaskTarget` with all calls in `calls[]`.
- `calls[i]` uses the first acceptable value per argument as the canonical value.
- `alternatives` on the target stores additional acceptable argument values, keyed by `ToolCallRecord.id`.

### Cross-Model Task Coverage

InspectorRAGet requires every model to have a score for every metric on every task. When a task failed for one model but passed for another, the converter synthesises "correct" scores for the passing model:

| Metric / Label         | Failing Model             | Passing Model                          |
| ---------------------- | ------------------------- | -------------------------------------- |
| `bfcl_error_severity`  | derived from `error_type` | `correct` / `0.0`                      |
| `bfcl_errors`          | error messages joined     | `"none"`                               |
| `bfcl_latency_total_s` | from result file          | from result file, or `600.0` if absent |
| `Error Type` (label)   | raw error type string     | `"none"`                               |

The `600.0` sentinel for missing latency (10 minutes) is intentionally large — it stands out in aggregate views and signals incomplete data rather than silently skewing the mean.

### Passing Task Output

BFCL score files contain only failures, so passing tasks have no decoded model output. The converter uses the canonical target calls as a proxy: the model was correct, so its response matches the ground truth. The output panel and target panel will show identical calls for passing tasks, which is the expected behaviour.

For failing tasks where BFCL could not decode the model output, `model_result_decoded` is empty. The converter falls back to the raw result string so the failure is visible in the output panel.

---

## Agentic Converter Details

### Multi-Turn File Layout

```
<model-name>/
├── result/
│   └── <model-id>/
│       ├── BFCL_v3_multi_turn_base_result.json
│       └── ... (one file per multi-turn category)
└── score/
    └── <model-id>/
        ├── BFCL_v3_multi_turn_base_score.json
        └── ...
```

Multi-turn score files have **no aggregate header line** (unlike single-turn), and use a nested `error` dict:

```json
{
  "id": "multi_turn_base_0",
  "valid": false,
  "error": {
    "error_type": "multi_turn:instance_state_mismatch",
    "error_message": "Model instance for GorillaFileSystem does not match the state with ground truth instance."
  },
  "possible_answer": [["mkdir(dir_name='temp')", "mv(source='document/final_report.pdf', destination='temp')"], [...]],
  "inference_log": [...]
}
```

`possible_answer` is `list[list[str]]` — one list per turn, each containing expected call strings for that turn.

Multi-turn result files carry latency as a list-of-lists (one inner list per turn, one float per retry step):

```json
{
  "id": "multi_turn_base_0",
  "inference_log": [...],
  "latency": [[0.42, 0.31], [0.55], [0.28, 0.19, 0.44]]
}
```

The converter sums all values to produce the total wall-clock time.

### Multi-Turn Dataset Fields

| Field              | Description                                                                       |
| ------------------ | --------------------------------------------------------------------------------- |
| `initial_config`   | Full serialised environment state at task start                                   |
| `question`         | `list[list[dict]]` — one inner list per turn, each containing a user-role message |
| `path`             | Canonical sequence of tool method names for successful completion                 |
| `involved_classes` | CamelCase toolkit class names used in this scenario                               |

Tool definitions are stored separately in `multi_turn_func_doc/` within the dataset directory, one JSON file per toolkit class. The converter loads all available class files and attaches the relevant tools to each task based on `involved_classes`.

### The `inference_log` Structure

The `inference_log` is the primary artifact for agentic tasks. It is a flat list alternating between two kinds of entries:

- **State snapshots** (`list`): Python-serialised snapshots of the simulator class instances. Dropped by the converter.
- **Turn dicts** (`dict`): one per user instruction, keyed by `begin_of_turn_query` and `step_0`, `step_1`, etc.

Each step is a list of role-keyed entries:

| Role              | Content                                        | Converter Treatment                                |
| ----------------- | ---------------------------------------------- | -------------------------------------------------- |
| `inference_input` | Raw API request payload sent to the model      | Dropped                                            |
| `assistant`       | Raw model output string                        | Kept; tool calls parsed from it                    |
| `handler_log`     | Decoder status and parsed calls                | Used to extract decoded calls; dropped from output |
| `tool`            | Environment execution result for one tool call | Kept as a `tool`-role message                      |

### Steps, Retries, and the Execution Trace

Each `step_N` within a turn dict is one LLM invocation. There are two reasons the runner issues multiple steps within a turn:

1. **Decode failure:** the model's output could not be parsed into a valid tool call. The runner injects an error message back into context and re-prompts. These steps are retries.
2. **Genuine agentic reasoning:** the model made tool calls, observed the environment responses, and issued a follow-up invocation to continue solving the task. These are not retries — they are real sequential reasoning steps.

Both cases produce multiple `step_N` entries under the same turn. The runner caps the total steps across the entire task at 20; exhausting this budget produces `multi_turn:force_terminated`.

The converter treats the last step that produced decoded tool calls or tool responses as the **accepted step** for that turn. The accepted step's output becomes the top-level assistant message in `result.output` (and its tool responses follow as `tool`-role messages). All earlier steps within the turn are written into the trace on that assistant message — they are the intermediate reasoning that led to the accepted output.

#### Why intermediate steps go into the trace, not the execution thread

The execution thread (`result.output`) is intended to answer: "what did the model actually do, and what did the environment respond?" It shows the accepted input/output pairs — the conversation as it would appear to an observer watching the agent work.

Intermediate steps (decode failures, empty responses, coercion retries) are runner mechanics: the BFCL harness re-prompts the model with augmented context until it produces something acceptable. These steps are not part of the agent's committed actions — they were rejected before any environment execution occurred. Putting them inline would bury the real tool calls and tool responses under repeated failed attempts and make the execution thread unreadable.

The trace exists to give researchers access to this intermediate reasoning without cluttering the primary view. If you want to see why a turn took multiple attempts, open the Trace tab for that assistant message. If you just want to understand what the agent did and what happened as a result, the execution thread is sufficient on its own.

The trace on each assistant message is a `TraceEvent[]` with three event types:

| Event type       | When emitted                                                                        |
| ---------------- | ----------------------------------------------------------------------------------- |
| `invocation`     | Each intermediate step's LLM call (steps 0..N-1; accepted step N is in the message) |
| `tool_execution` | Environment response(s) following an intermediate invocation                        |
| `observation`    | Runner feedback after a decode failure, empty response, or forced termination       |

The `label` field on each `invocation` event matches the `step_N` key in the inference log (e.g., `"step_2"`), enabling cross-reference with the raw file.

#### How Observations Are Built

The BFCL runner inner loop has three conditions that produce runner feedback:

**Decode error** — `convert_to_function_call()` raised an `AttributeError` because the model returned plain text instead of a parseable tool call. The runner logs the exception in `handler_log.error` and re-prompts. The observation includes the error string and the model's raw output:

```
Runner: decode error — <exception>. Model output: <raw text>
```

**Empty response** — The model output decoded to an empty call list (successfully decoded, but no functions were found). The runner logs `"Empty response from the model. Proceed to next turn."` in `handler_log.content` and re-prompts. The observation includes the model's raw output if any:

```
Runner: empty response. Model output: <raw text>
```

or (if model produced nothing):

```
Runner: empty response (model produced no tool calls).
```

**Force quit** — The runner exhausted the 20-step budget across the task. It appends `"Model has been forced to quit after N steps."` to the last step's `handler_log` after terminating the inner loop. This observation appears at the end of the trace on the last assistant message:

```
Runner: model forced to quit (step budget exhausted).
```

Decode error and empty response observations appear as intermediate events in the trace (between the failed invocation and the next retry). The force quit observation appears as the final event in the trace.

When the accepted step is the first and only step (no intermediate reasoning), no trace is emitted and the message stands alone.

### Output Structure

| Field             | Content                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `task.input`      | First user message (the initial goal)                                                                |
| `task.contexts`   | Initial environment state serialised from `initial_config`                                           |
| `task.tools`      | Tool definitions for all `involved_classes`                                                          |
| `task.targets`    | Per-turn ground truth (see below)                                                                    |
| `result.output`   | Flat execution thread: user, assistant, and tool messages interleaved across all turns               |
| `output[N].trace` | Intermediate trace for assistant message N: `invocation`, `tool_execution`, and `observation` events |

### Ground Truth for Agentic Tasks

When `possible_answer/` dataset files are available:

```json
{
  "type": "state",
  "value": {
    "turn_1": [
      "mkdir(dir_name='temp')",
      "mv(source='document/final_report.pdf', destination='temp/final_report.pdf')"
    ],
    "turn_2": ["grep(file_name='final_report.pdf', pattern='budget analysis')"],
    "turn_3": ["sort(file_name='final_report.pdf')"]
  }
}
```

When `possible_answer/` files are absent, the converter falls back to a `text` target from the `path` field:

```json
{
  "type": "text",
  "value": "GorillaFileSystem.mkdir → GorillaFileSystem.mv → GorillaFileSystem.grep"
}
```

### Message Status Badges

Each assistant and tool message in the execution thread carries two metadata fields stamped by the converter:

- `metadata.status` — one of `pass`, `warn`, or `fail`; InspectorRAGet renders this as a coloured badge.
- `metadata.statusDefinition` — a human-readable explanation of why the message has that status; InspectorRAGet shows it as a hover tooltip on the badge.

| Status | Colour | Meaning                                                                                                                            |
| ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pass` | Green  | Model produced accepted output in a single step.                                                                                   |
| `warn` | Yellow | Model took multiple intermediate steps before producing accepted output. Open the Trace tab to inspect the intermediate reasoning. |
| `fail` | Red    | Turn did not complete. The BFCL runner terminated the turn before an accepted output was reached.                                  |

**How status is derived for agentic tasks:**

- Assistant messages with no trace: `pass` (single-step turn).
- Assistant messages whose trace ends in a `tool_execution` event: `warn` (multiple steps, accepted output reached).
- Assistant messages whose trace ends in an `invocation` event: `fail` (turn cut off without runner feedback).
- Assistant messages whose trace ends in an `observation` event: `fail` with a precise cause derived from the observation content: step budget exhausted, repeated decode failure, or repeated empty response.
- The last assistant message in a `force_terminated` run: always `fail`, regardless of trace shape.
- Tool messages: `fail` if the content is JSON with a top-level `error` key (environment execution error); otherwise `pass`.

<!-- TODO: investigate whether a single output file can combine both single-turn (tool_calling) and multi-turn (agentic) BFCL tasks, since they share the same metrics and converter infrastructure. -->
