# IFEval Converter

Converts [IFEval](https://arxiv.org/abs/2311.07911) benchmark output into an InspectorRAGet JSON file for instance-level analysis.

---

## Quick Start

```bash
python convert.py --run-dir runs/my_experiment

python convert.py \
    --run-dir runs/my_experiment \
    --name "My IFEval Experiment" \
    --output runs/my_experiment/ifeval.json
```

### All Options

| Flag        | Required | Default                          | Description                                                |
| ----------- | -------- | -------------------------------- | ---------------------------------------------------------- |
| `--run-dir` | Yes      |                                  | Experiment directory containing one subdirectory per model |
| `--name`    | No       | `IFEval Evaluation`              | Display name shown in InspectorRAGet                       |
| `--output`  | No       | `ifeval.json` inside `--run-dir` | Output file path                                           |

---

## What Is IFEval?

IFEval (Instruction Following Evaluation) is a benchmark from Google Research that evaluates whether a model satisfies verifiable constraints embedded in a natural language prompt. Each prompt contains one or more constraints drawn from a closed vocabulary of 25 types (e.g., `punctuation:no_comma`, `length_constraints:number_words`, `detectable_format:json_format`). Constraints are checked algorithmically, not by a judge.

The benchmark is described in:

> [Instruction-Following Evaluation for Large Language Models](https://arxiv.org/abs/2311.07911)  
> Jeffrey Zhou et al., 2023

The original implementation is at [google-research/google-research/instruction_following_eval](https://github.com/google-research/google-research/tree/master/instruction_following_eval).

---

## No Dataset Download Required

IFEval is fully self-contained. The evaluation result files include the prompt text, model response, and all score fields inline for every task. No external dataset files are needed.

---

## Run Directory Layout

Each invocation of `convert.py` converts one experiment. `--run-dir` points to the experiment directory. Each model evaluated in that experiment is a subdirectory inside `--run-dir`.

```
runs/
└── my_experiment/               ← pass this as --run-dir
    ├── model_a/                 ← directory name = model ID and display name
    │   ├── eval_results_strict.jsonl
    │   └── eval_results_loose.jsonl
    └── model_b/
        ├── eval_results_strict.jsonl
        └── eval_results_loose.jsonl
```

This matches the standard output layout of the [google-research IFEval runner](https://github.com/google-research/google-research/tree/master/instruction_following_eval). `converters/ifeval/runs/` is gitignored and is a convenient local scratch space.

To compare multiple models, place each model's directory as a sibling under a shared experiment root and point `--run-dir` at that root.

### Model naming

The directory name is used as both the model ID (internal key) and the display name shown in InspectorRAGet. Choose names that are meaningful to the reader.

### Loose file is optional

`eval_results_loose.jsonl` is optional. If absent for a model, PL and IL metrics fall back to the strict values for that model. The PL and IL values will then be identical to PS and IS respectively.

---

## Source File Schema

Both `eval_results_strict.jsonl` and `eval_results_loose.jsonl` use the same format — one JSON object per line:

```json
{
  "prompt": "Write a 300+ word summary without using any commas...",
  "response": "...",
  "follow_all_instructions": true,
  "follow_instruction_list": [true, false, true],
  "instruction_id_list": [
    "punctuation:no_comma",
    "detectable_format:number_highlighted_sections",
    "length_constraints:number_words"
  ]
}
```

This is the canonical output format of the [google-research IFEval runner](https://github.com/google-research/google-research/blob/master/instruction_following_eval/evaluation_lib.py). Some forks include a `key` field (integer ID from the original dataset); the converter accepts it but does not use it.

The `prompt` text is used as the join key across models and between strict and loose files. All models in the same experiment must have been evaluated on the same prompt set.

---

## Metrics

| Metric               | Type        | Aggregator | Description                                                                                    |
| -------------------- | ----------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `PS`                 | categorical | majority   | Prompt-level strict: all constraints satisfied under strict evaluation                         |
| `IS`                 | numerical   | average    | Instruction-level strict: fraction of constraints satisfied, strict (0–1)                      |
| `PL`                 | categorical | majority   | Prompt-level loose: all constraints satisfied under loose evaluation                           |
| `IL`                 | numerical   | average    | Instruction-level loose: fraction of constraints satisfied, loose (0–1)                        |
| `failed_constraints` | text        |            | Comma-separated list of constraint types that failed (strict); `"all passed"` when none failed |

### Strict vs loose

Strict evaluation checks the model response as-is. Loose evaluation applies normalizations before checking each constraint: strip leading and trailing whitespace, remove asterisks, drop the first line, drop the last line, and combinations of the above. The best result across all variants is taken. `PL >= PS` and `IL >= IS` always hold. The gap between strict and loose scores indicates how much surface formatting artifacts affected the result.

### IS and IL normalization

IS and IL are computed as `constraints_satisfied / total_constraints` for each task, normalized to 0–1. This makes tasks with different numbers of constraints comparable when aggregating across a dataset.

The Performance Overview aggregation of PS across all tasks equals the headline prompt-level strict accuracy reported in IFEval papers.

### failed_constraints

This text metric provides a human-readable per-instance breakdown visible in the task view Evaluations tab. It lists the constraint type IDs that failed under strict evaluation, comma-separated. When all constraints are satisfied it shows `"all passed"` rather than a blank or dash, which would be ambiguous with missing data.

---

## Labels

InspectorRAGet labels are per-(task, model) nominal descriptors that appear in the Model Characteristics tab as grouped bar charts showing distribution across models.

IFEval has a closed vocabulary of 25 constraint types. Each constraint type present in a task gets its own label key, with value `"pass"` or `"fail"` based on strict evaluation. Tasks that do not include a given constraint type have no entry for that key, which InspectorRAGet renders as N/A.

The Model Characteristics tab answers: which constraint types does each model struggle with most?

### Full constraint type vocabulary

```
change_case:capital_word_frequency      change_case:english_capital
change_case:english_lowercase           combination:repeat_prompt
combination:two_responses               detectable_content:number_placeholders
detectable_content:postscript           detectable_format:constrained_response
detectable_format:json_format           detectable_format:multiple_sections
detectable_format:number_bullet_lists   detectable_format:number_highlighted_sections
detectable_format:title                 keywords:existence
keywords:forbidden_words                keywords:frequency
keywords:letter_frequency               language:response_language
length_constraints:nth_paragraph_first_word  length_constraints:number_paragraphs
length_constraints:number_sentences     length_constraints:number_words
punctuation:no_comma                    startend:end_checker
startend:quotation
```

---

## Data Mapping

| InspectorRAGet Field        | Source                                                     | Notes                                                         |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `task_id`                   | positional index across all prompts                        | `ifeval_0`, `ifeval_1`, ...                                   |
| `task_type`                 | hardcoded                                                  | `"generation"`                                                |
| `input`                     | `prompt`                                                   | Plain string                                                  |
| `output[0].content`         | `response` from strict file                                | Model response text                                           |
| `scores.PS`                 | `follow_all_instructions` (strict)                         | `"pass"` / `"fail"` categorical                               |
| `scores.IS`                 | `follow_instruction_list` (strict)                         | Fraction satisfied, 0–1                                       |
| `scores.PL`                 | `follow_all_instructions` (loose)                          | `"pass"` / `"fail"` categorical                               |
| `scores.IL`                 | `follow_instruction_list` (loose)                          | Fraction satisfied, 0–1                                       |
| `scores.failed_constraints` | `instruction_id_list` + `follow_instruction_list` (strict) | Comma-separated failed constraint IDs                         |
| `labels.<constraint_id>`    | `instruction_id_list` + `follow_instruction_list` (strict) | `"pass"` or `"fail"` per constraint type present in this task |
