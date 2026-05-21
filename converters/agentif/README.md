# AgentIF Converter

Converts [AgentIF](https://github.com/THU-KEG/AgentIF) evaluation results into an InspectorRAGet JSON file.

## What is AgentIF?

AgentIF is a benchmark for evaluating LLM instruction-following in agentic scenarios. It contains 707 human-annotated instructions drawn from 50 real-world agent applications, each paired with a list of constraints evaluated via code-based, LLM-based, or hybrid methods. Instructions average 1,723 words and 11.9 constraints.

AgentIF distinguishes two constraint categories:

- **Regular constraints** apply directly to the model's response (formatting, semantic, tool usage).
- **Meta constraints** govern other constraints — they define selection, detailing, or prioritization rules among constraints. Approximately 25% of instructions include meta constraints.

Two primary metrics are reported:

- **CSR** (Constraint Success Rate): fraction of constraints satisfied per instruction.
- **ISR** (Instruction Success Rate): whether all triggered constraints passed (all-or-nothing per instruction).

Both metrics are emitted in two variants: one including meta constraints (matching the benchmark runner) and one excluding them (matching the paper definition).

## Input layout

```
run_dir/
    <model_id_1>/
        agentif/
            merged_for_eval/
                results.json
    <model_id_2>/
        agentif/
            merged_for_eval/
                results.json
    ...
```

- Each immediate subdirectory of `run_dir` that contains `agentif/merged_for_eval/results.json` is treated as one model variant.
- The subdirectory name becomes the `model_id` in the output.
- Records are joined across models by positional index — all model directories must contain the same ordered task list.

## Usage

```bash
python convert.py \
    --run-dir runs/my_experiment \
    --output runs/my_experiment/agentif.json \
    --name "My AgentIF Run"
```

| Argument    | Required | Default                  | Description                                            |
| ----------- | -------- | ------------------------ | ------------------------------------------------------ |
| `--run-dir` | yes      | —                        | Root directory with one subdirectory per model variant |
| `--output`  | no       | `<run_dir>/agentif.json` | Output file path                                       |
| `--name`    | no       | `AgentIF Evaluation`     | Display name shown in InspectorRAGet                   |

## Output

A single InspectorRAGet JSON file with `task_type: "generation"`. The task `input` is stored as a `Message[]` array (the full system + user message history delivered to the model), rendered as a chat thread in the task instance view.

### Metrics

| Name                 | Display name                                   | Type                    | Description                                                                                                                                                        |
| -------------------- | ---------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `csr`                | Constraint Success Rate                        | numerical (0–1)         | Fraction of all scored constraints that passed, including meta constraints. Matches the benchmark runner output. Higher is better.                                 |
| `csr_no_meta`        | Constraint Success Rate (Regular Constraints)  | numerical (0–1)         | Fraction of regular (non-meta) scored constraints that passed. Matches the paper definition. Higher is better.                                                     |
| `isr`                | Instruction Success Rate                       | categorical (pass/fail) | Whether all scored constraints (including meta) passed. Matches the benchmark runner output.                                                                       |
| `isr_no_meta`        | Instruction Success Rate (Regular Constraints) | categorical (pass/fail) | Whether all regular (non-meta) scored constraints passed. A task can pass this while failing `isr` if only a meta constraint failed. Matches the paper definition. |
| `failed_constraints` | Failed Constraints                             | text                    | Semicolon-separated list of all failed constraints (meta and regular), formatted as `[dimension \| type] description`. `"all passed"` when nothing failed.         |

**Note on paper vs. runner discrepancy:** the AgentIF paper defines CSR/ISR over regular constraints only, but the benchmark runner includes meta constraints. `csr` and `isr` match the runner (and `accuracy.json`) exactly. `csr_no_meta` and `isr_no_meta` match the paper definition.

### Labels

Each result carries labels keyed by constraint dimension and normalized constraint type. Labels use regular (non-meta) constraints only.

- **Dimension labels**: `unconditional`, `conditional`, `example_driven`
- **Type labels**: `semantic`, `formatting`, `resource`

The label value is `"pass"` if all scored regular constraints of that key passed, `"fail"` if any failed. Labels are visible in the Model Characteristics tab.

### Filters

Each filter key is a top-level field on the task object.

| Name          | Description                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`      | Data source domain for Schema A tasks (`lawglm`, `general`). `N/A` for Schema B tasks. Schema A tasks are in Chinese; Schema B tasks are in English — so `domain` is also an effective language filter. |
| `prompt_type` | Agent prompt variant for Schema A tasks (e.g. `Thought_prompt`, `Code_prompt`). `N/A` for Schema B tasks.                                                                                               |
| `agent_name`  | Agent name for Schema B tasks (e.g. `action_agent`, `assessment_agent`). Present on Schema A tasks too but less meaningful for filtering.                                                               |

## Two record schemas

AgentIF `results.json` contains two types of records mixed together:

- **Schema A** (`domain` / `query_id` / `turn_id` / `prompt_type`): multi-turn agentic tasks from the LawGLM and General domains. The input message array includes the full conversation history up to this turn. Task IDs follow the pattern `agentif_{domain}_{query_id}_{turn_id}_{prompt_type}`.
- **Schema B** (`id` + `agent_name`): single-response tasks from diverse specialist agent applications. The `id` field alone is not globally unique — `(id, agent_name)` is the unique key. Task IDs follow the pattern `agentif_{id}_{agent_name}`.

Both are emitted as `generation` tasks. The input message array is always rendered as a chat thread.

## CSR/ISR vs. accuracy.json

The `CSR` value in `accuracy.json` is a pool-level number: `total_constraints_passed / total_constraints_scored` across all tasks. The per-task `csr` stored in InspectorRAGet is the per-task fraction, which averages to a higher value because tasks with fewer constraints carry more weight in the macro-average. The `isr` value matches `accuracy.json` exactly since it is already a per-task binary.

## Run data and output files

- Run data lives at `runs/` (gitignored scratch space).
- Do **not** write output files to `data/` — that directory is for shipped pre-loaded examples only.
- Regenerate with: `python convert.py --run-dir runs/<your_run>`

## Private wrapper

A `private_*.py` script (gitignored via the `private_*` pattern) can extend this converter with pipeline-specific data before writing the output file.
