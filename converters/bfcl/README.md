# BFCL Converter

Converts [Berkeley Function-Calling Leaderboard (BFCL)](https://gorilla.cs.berkeley.edu) output directories into an InspectorRAGet JSON file for instance-level analysis.

## Scope

BFCL has two structurally different evaluation paradigms:

| BFCL categories                                                                                                                                            | Paradigm                                                                                                                                          | Converter flag             | Status              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------- |
| `simple` (V3), `simple_python` (V4), `multiple`, `parallel`, `parallel_multiple`, `irrelevance`, `live_*`, `java`, `javascript`, `format_sensitivity` (V4) | **Next-response prediction** — input is the conversation history, output is the predicted next tool call(s), ground truth is the expected call(s) | `--task-type tool_calling` | Supported           |
| `multi_turn_base`, `multi_turn_miss_func`, `multi_turn_miss_param`, `multi_turn_long_context`, `web_search` (V4), `memory` (V4)                            | **Goal-directed agentic execution** — model drives a stateful virtual environment to a goal; ground truth is the final environment state          | `--task-type agentic`      | Not yet implemented |

**Why the split matters:** Papers reporting "BFCL overall accuracy" include multi-turn categories, which this converter does not cover. The output file reflects single-turn and language-specific (Java/JavaScript) performance only. The file name and InspectorRAGet display name should make this scope explicit (e.g. "BFCL Single-Turn — Model Comparison").

**Note on java and javascript categories:** Tool definitions in these categories use Java/JavaScript type vocabulary (`HashMap`, `ArrayList`, `Boolean`, etc.) rather than JSON Schema types. The schema structure is otherwise identical to Python categories. InspectorRAGet renders these type names as-is. Model output argument values in these categories are language-syntax strings (e.g. `new ArrayList<String>(Arrays.asList("a", "b"))`) rather than JSON values, which also renders correctly as text in the task view.

---

## Requirements

Python 3.10 or later. No third-party dependencies — uses stdlib only (`json`, `pathlib`, `argparse`, `uuid`).

---

## Input files

A standard BFCL run for a single model produces this directory layout:

```
<model-name>/
├── result/
│   └── <model-id>/
│       ├── BFCL_v3_simple_result.json
│       ├── BFCL_v3_multiple_result.json
│       ├── BFCL_v3_parallel_result.json
│       ├── BFCL_v3_parallel_multiple_result.json
│       ├── BFCL_v3_irrelevance_result.json
│       ├── BFCL_v3_live_simple_result.json
│       └── ... (one file per category)
└── score/
    └── <model-id>/
        ├── BFCL_v3_simple_score.json
        ├── BFCL_v3_multiple_score.json
        └── ... (one file per category)
```

To compare multiple models, place each model's directory as a sibling under a shared root:

```
bfcl_output/
├── GPT-4o/
│   ├── result/...
│   └── score/...
└── Llama-3.1-70B/
    ├── result/...
    └── score/...
```

Pass `--bfcl-root bfcl_output` and the converter processes all model directories automatically.

### Result files

One JSON object per line (JSONL). Each line contains the raw model output and timing for one task:

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

### Score files

One JSON object per line (JSONL). The **first line** is an aggregate header — the converter skips it:

```json
{ "accuracy": 0.9575, "correct_count": 383, "total_count": 400 }
```

Subsequent lines are **failures only** (passing tasks are omitted from score files):

```json
{
  "id": "simple_13",
  "model_name": "local-llama3",
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

Because score files only contain failures, passing tasks have no `prompt` field in the score output.

**Without `--dataset-dir`:** the converter emits only tasks that failed for at least one model. These have a full prompt (input, tools, ground truth) from the score file and are useful for error analysis. Passing tasks are excluded entirely rather than emitted as empty-shell records.

**With `--dataset-dir`:** all tasks are emitted, including passing ones, with full input and tools populated from the dataset files.

### Cross-model task coverage

InspectorRAGet requires every model to have a score for every metric on every task. When a task failed for model A but passed for model B, the converter synthesises "correct" scores for model B so the constraint is satisfied:

| Metric                 | Failing model             | Passing model                                      |
| ---------------------- | ------------------------- | -------------------------------------------------- |
| `bfcl_error_severity`  | derived from `error_type` | `correct / 0.0`                                    |
| `bfcl_error_type`      | raw error type string     | `"none"`                                           |
| `bfcl_errors`          | error messages joined     | `"none"`                                           |
| `bfcl_latency_total_s` | from result file          | from result file, or `600.0` if result file absent |

The `600.0` sentinel for missing latency (10 minutes) is intentionally large — it stands out in aggregate views and signals incomplete data rather than silently skewing the mean.

### Incomplete runs and load errors

If a model's result files are missing for some tasks (e.g. a run was interrupted), those tasks will have no `ModelResult` for that model. InspectorRAGet requires every model to have a result on every task, so loading such a file will produce a validation error.

This is most likely to happen when `--dataset-dir` is provided and the dataset contains tasks that one or more model runs did not complete. If you hit a load error, check whether all model runs cover the same task set before converting.

---

## Dataset files (recommended)

BFCL dataset files contain the full task definitions — conversation history, tool definitions, and ground-truth answers — for every task regardless of pass/fail outcome.

Without them, passing tasks in the output will have no `input`, `tools`, or `targets` fields, which limits what InspectorRAGet can show for those instances.

### Two file sets are required

The BFCL repository separates task definitions from ground-truth answers into two directories:

- **Task definitions** (`data/BFCL_v3_<category>.json`): conversation history and tool definitions. One record per line: `{"id": ..., "question": [[...]], "function": [...]}`.
- **Ground-truth answers** (`data/possible_answer/BFCL_v3_<category>.json`): correct function calls for every task. One record per line: `{"id": ..., "ground_truth": [{func_name: {arg: [values]}}]}`.

Score files (failures only) embed both the task definition and ground truth inline, so they cover failing tasks without the dataset files. But passing tasks only have their ground truth in the `possible_answer/` answer files. Without those files, passing tasks will have no `targets`.

### Downloading the dataset

Use the provided script to download both sets into `converters/bfcl/dataset/` (gitignored):

```bash
# Download v4 (default)
./converters/bfcl/download_dataset.sh

# Download v3
./converters/bfcl/download_dataset.sh v3
```

The script downloads task definition files and the corresponding `possible_answer/` answer files for all single-turn categories. It skips files that already exist, so it is safe to re-run.

The dataset files live in the BFCL GitHub repository. Source URLs:

- **V3:** `github.com/ShishirPatil/gorilla` at commit `cd9429c`, path `berkeley-function-call-leaderboard/bfcl_eval/data/`
- **V4:** `github.com/ShishirPatil/gorilla` at `main`, same path

The script downloads into `dataset/v3/` or `dataset/v4/` respectively. Pass the versioned subdirectory to `--dataset-dir`:

```bash
python convert.py --bfcl-root runs/my-experiment --dataset-dir dataset/v3/ --output results.json
python convert.py --bfcl-root runs/my-experiment --dataset-dir dataset/v4/ --output results.json
```

The converter looks for `BFCL_v3_<category>.json` (or `BFCL_v4_`) in the directory you pass, and for answer files under a `possible_answer/` subdirectory within it.

---

## Usage

```bash
# Full fidelity — with dataset files:
python convert.py \
    --bfcl-root runs/ \
    --dataset-dir dataset/v4/ \
    --output my_results.json \
    --name "BFCL Single-Turn — My Experiment"

# Without dataset files (only failed tasks, full prompt from score files):
python convert.py \
    --bfcl-root runs/ \
    --output failures_only.json

# From an arbitrary location on your system:
python convert.py \
    --bfcl-root /path/to/your/bfcl/output \
    --dataset-dir dataset/v4/ \
    --output my_results.json

# Agentic task type (not yet implemented — will print an error and exit):
python convert.py \
    --bfcl-root runs/ \
    --task-type agentic \
    --output agentic_results.json
```

You can point `--bfcl-root` at any directory on your system. As a convention, `converters/bfcl/runs/` is gitignored and works well as a local scratch space for organising multiple experiments:

```
converters/bfcl/runs/
├── 2026-03-17_gpt4o-vs-llama/
│   ├── GPT-4o/
│   │   ├── result/...
│   │   └── score/...
│   └── Llama-3.1-70B/
│       ├── result/...
│       └── score/...
└── 2026-03-20_ablation/
    ├── ModelA/
    └── ModelB/
```

Then convert a specific experiment with:

```bash
python convert.py \
    --bfcl-root runs/2026-03-17_gpt4o-vs-llama \
    --dataset-dir dataset/v4/ \
    --output runs/2026-03-17_gpt4o-vs-llama/results.json
```

### All options

| Flag            | Required | Default           | Description                                                |
| --------------- | -------- | ----------------- | ---------------------------------------------------------- |
| `--bfcl-root`   | Yes      | —                 | Root directory containing model output subdirectories      |
| `--output`      | Yes      | —                 | Output file path for the InspectorRAGet JSON               |
| `--dataset-dir` | No       | —                 | Directory with BFCL dataset files for passing-task prompts |
| `--name`        | No       | `BFCL Evaluation` | Display name in InspectorRAGet                             |
| `--task-type`   | No       | `tool_calling`    | `tool_calling` or `agentic` (agentic not yet implemented)  |

---

## Output schema

The converter produces a schema v2 InspectorRAGet JSON file with `task_type: "tool_calling"`.

### Metrics

| Metric                 | Type        | Description                                                                          |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `bfcl_correctness`     | categorical | Binary pass/fail: `correct` (1) or `incorrect` (0)                                   |
| `bfcl_error_severity`  | categorical | Recoverability-anchored severity score (see below)                                   |
| `bfcl_error_type`      | text        | Raw BFCL error type string (e.g. `type_error:nested`). `"none"` for correct tasks    |
| `bfcl_errors`          | text        | Full error messages from BFCL, joined as a single string. `"none"` for correct tasks |
| `bfcl_latency_total_s` | numerical   | Wall-clock inference time in seconds                                                 |

### Error severity scale

The `bfcl_error_severity` metric groups BFCL error types by how recoverable the error is:

| Value               | Numeric | Meaning                                                    | BFCL source                                           |
| ------------------- | ------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| `correct`           | 0.0     | No error                                                   | `valid: true`                                         |
| `wrong_arguments`   | 0.25    | Right function, wrong argument values or types             | `type_error:*`, `value_error:*`, `missing_optional`   |
| `wrong_function`    | 0.5     | Called the wrong function or wrong number of functions     | `wrong_func_name`, `wrong_count`, `cannot_find_match` |
| `unknown`           | 0.5     | Error type not in the known mapping                        | Any unrecognised `error_type`                         |
| `irrelevance_error` | 0.75    | Called a function when none was appropriate, or vice versa | `irrelevance_error:decoder_success`                   |
| `malformed_output`  | 1.0     | Output could not be decoded into any function call         | No `model_result_decoded`                             |

### Ground truth (`targets`)

BFCL's ground truth is a list where every element is a required parallel call (AND semantics). Simple and multiple categories have one element; parallel and parallel_multiple categories have multiple elements, one per concurrent call. The entire list maps to a single `TaskTarget`:

- All elements become one `TaskTarget` with all calls in `calls[]`.
- `calls[i]` uses the first acceptable value per argument as the canonical value.
- `alternatives` on the target stores additional acceptable argument values, keyed by `ToolCallRecord.id`.

The ground truth comes from two sources: the `possible_answer` field embedded in score files (failures only), and the `possible_answer/` answer files from the dataset directory (all tasks). Both use the same list structure. The converter prefers the score file value for failing tasks and falls back to the answer files for passing tasks.

### Passing task output

BFCL score files contain only failures, so passing tasks have no decoded model output. The converter uses the canonical target calls as a proxy for the output: the model was correct, so its response matches the ground truth. This means the output panel and the target panel will show identical calls for passing tasks, which is the expected and correct behaviour.

For failing tasks where BFCL could not decode the model output (e.g. inference errors or malformed responses), `model_result_decoded` is empty. In this case the converter falls back to the raw result string (the inference error message or raw unparsed output) rather than the target proxy, so the failure is visible in the output panel.

### BFCL category as a filter

Each task carries a `bfcl_category` field (e.g. `simple`, `live_parallel`). The output file's top-level `filters` array includes `bfcl_category` so InspectorRAGet builds a filter dropdown for it automatically.

---

## Agentic converter (future)

The `--task-type agentic` path is reserved for converting BFCL multi-turn categories once the InspectorRAGet `agentic` task type is designed and implemented. Multi-turn BFCL tasks use goal-directed evaluation with stateful virtual environments (GorillaFileSystem, TwitterAPI, etc.) and cannot be represented as next-response-prediction instances.
