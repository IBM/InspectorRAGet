# ComplexBench Converter

Converts [ComplexBench](https://github.com/HC-Guo/ComplexBench) evaluation results into an InspectorRAGet JSON file.

## What is ComplexBench?

ComplexBench evaluates LLM instruction-following on complex, compositional prompts. Each task contains multiple constraints combined via `And`, `Chain`, or `Selection` composition logic. Constraints span 19 dimensions (Template, Length, Start with, Target Language, etc.). The primary metric is **DRFR** (Dependency-aware Result Fraction Rate): the fraction of per-constraint verdicts that pass after applying dependency logic so that downstream constraints are not credited when a prerequisite fails.

## Input layout

```
run_dir/
    <model_id_1>/
        complexbench/
            evaluated_model_final_results.json
    <model_id_2>/
        complexbench/
            evaluated_model_final_results.json
    ...
```

- Each immediate subdirectory of `run_dir` that contains `complexbench/evaluated_model_final_results.json` is treated as one model variant.
- The subdirectory name becomes the `model_id` in the output.
- All model directories must contain results for the same task set (joined on `main_id`).

## Usage

```bash
python convert.py \
    --run-dir runs/my_experiment \
    --output runs/my_experiment/complexbench.json \
    --name "My ComplexBench Run"
```

| Argument    | Required | Default                       | Description                                            |
| ----------- | -------- | ----------------------------- | ------------------------------------------------------ |
| `--run-dir` | yes      | —                             | Root directory with one subdirectory per model variant |
| `--output`  | no       | `<run_dir>/complexbench.json` | Output file path                                       |
| `--name`    | no       | `ComplexBench Evaluation`     | Display name shown in InspectorRAGet                   |

## Output

A single InspectorRAGet JSON file with `task_type: "generation"`.

### Metrics

| Name                 | Type                    | Description                                                                                                                                                                                                                                            |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DRFR`               | numerical (0–1)         | Fraction of per-constraint verdicts that passed after dependency adjustment (`point_judges_rely`). Higher is better.                                                                                                                                   |
| `task_pass`          | categorical (pass/fail) | Whether all per-constraint verdicts passed. A task passes only if every `point_judges_rely` value is True.                                                                                                                                             |
| `failed_constraints` | text                    | Semicolon-separated list of failed scoring questions, each formatted as `[dimension] question text`. When a question has no dimension tag, `[?]` is used. `"all passed"` when nothing failed. Uses `point_judges_rely` (dependency-adjusted) verdicts. |

### Labels

Each result carries a `labels` dict keyed by constraint dimension (e.g. `Template`, `Length`, `Start with`). The value is `"pass"` if every scoring question for that dimension passed, `"fail"` if any failed. A task can have multiple scoring questions mapped to the same dimension; the label is conservative: one failure marks the whole dimension as failed.

Labels use `point_judges_rely` (dependency-adjusted) verdicts, consistent with DRFR and `failed_constraints`.

Labels are visible in the Model Characteristics tab. Dimensions used in ComplexBench:
`Bullets Format`, `Consistency`, `End with`, `Factuality`, `Helpfulness`, `JSON Format`, `Keywords`, `Language Style`, `Length`, `Markdown Format`, `Personalization`, `Punctuation`, `Sentiment`, `Start with`, `Supportiveness`, `Target Language`, `Template`, `Topic`, `Word Matching`

### Filters

Each filter key is a top-level field on the task object. The filter worker matches against a user-selected set of values; list-valued fields (like `constraints`) match if the task list contains any of the selected values.

| Name          | Type     | Values                                                                                                                                                                                                                                                                                     |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `category`    | string   | `And`, `Chain_1`, `Chain_2`, `Selection_1`, `Selection_2`, `Selection_3`, `Selection_and_Chain_2`, `Selection_and_Chain_3`                                                                                                                                                                 |
| `ability`     | string   | `Advanced Chinese Understanding`, `Creative Writing`, `Custom Writing`, `Fundamental Language Ability`, `Logical Reasoning`, `Open-ended Questions`, `Practical Writing`, `Professional Knowledge`, `Professional Writing`, `Task-oriented Role Play`                                      |
| `constraints` | string[] | `Bullets Format`, `Consistency`, `End with`, `Factuality`, `Helpfulness`, `JSON Format`, `Keywords`, `Language Style`, `Length`, `Markdown Format`, `Personalization`, `Punctuation`, `Sentiment`, `Start with`, `Supportiveness`, `Target Language`, `Template`, `Topic`, `Word Matching` |

## Metrics not in this converter

`evaluated_model_statistics.json` contains several aggregate metrics that are not emitted as per-task scores because they have no meaningful per-task value:

- **`overall_drfr`** — pool-level `total_constraints_passed / total_constraints` across all tasks. Differs from the macro-average of per-task DRFR because tasks have unequal numbers of constraints (1–14 in the current dataset).
- **`single_origin_test` / `single_coherent_test`** — pass rates computed over groups of 2 related task variants (origin task alone; all variants together).
- **`multiple_origin_test` / `multiple_coherent_test`** — same, computed over groups of 3+ related variants.

The origin/coherent tests measure compositional robustness across a group of task variants (tracked via the `group` and `idx_in_group` fields), not individual task performance. Read `evaluated_model_statistics.json` directly for these numbers.

## Run data and output files

- Run data lives at `runs/` (gitignored scratch space).
- Do **not** write output files to `data/` — that directory is for shipped pre-loaded examples only.
- Regenerate with: `python convert.py --run-dir runs/<your_run>`

## Private wrapper

A `private_*.py` script (gitignored via the `private_*` pattern) can extend this converter with pipeline-specific data before writing the output file.
