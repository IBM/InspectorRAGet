"""
Copyright 2023-present InspectorRAGet Team

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

IFEval → InspectorRAGet converter.

Reads one or more model output directories and writes a single
InspectorRAGet JSON file for IFEval benchmark results.

Usage:
    python convert.py --run-dir runs/my_experiment --output runs/my_experiment/ifeval.json

See README.md for full documentation.
"""

import argparse
import json
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 2

# Annotator key stamped on all scores — signals algorithm-produced evaluation.
ANNOTATOR = "ifeval"

# ---------------------------------------------------------------------------
# File loading helpers
# ---------------------------------------------------------------------------


def load_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file, skipping blank lines. Returns list of parsed objects."""
    records = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(
                        f"  Warning: skipping malformed line in {path}: {e}",
                        file=sys.stderr,
                    )
    return records


# ---------------------------------------------------------------------------
# Directory scanning
# ---------------------------------------------------------------------------


def find_model_dirs(run_dir: Path) -> list[tuple[Path, Path]]:
    """
    Return (model_dir, ifeval_dir) pairs for subdirectories of run_dir that
    contain IFEval result files (public runner layout).

    The public google-research runner writes results directly into the model
    output directory:
        <model_dir>/eval_results_strict.jsonl
        <model_dir>/eval_results_loose.jsonl
    """
    results = []
    for entry in sorted(run_dir.iterdir()):
        if not entry.is_dir():
            continue
        if (entry / "eval_results_strict.jsonl").exists() or (
            entry / "eval_results_loose.jsonl"
        ).exists():
            results.append((entry, entry))
    return results


# ---------------------------------------------------------------------------
# Score loading
# ---------------------------------------------------------------------------


def load_ifeval_scores(ifeval_dir: Path) -> tuple[dict[str, dict], dict[str, dict]]:
    """
    Load strict and loose IFEval eval results from ifeval_dir.

    Returns (strict_map, loose_map) where each map is:
        prompt_text → record dict (with follow_all_instructions, follow_instruction_list,
                                    instruction_id_list, response)

    Keyed by the full prompt text since IFEval has no stable numeric ID in the
    output files (the original google-research runner omits the 'key' field from
    outputs; some forks include it but it cannot be relied upon).
    """
    def _load(filename: str) -> dict[str, dict]:
        path = ifeval_dir / filename
        if not path.exists():
            return {}
        result = {}
        for rec in load_jsonl(path):
            prompt = rec.get("prompt", "")
            if prompt:
                result[prompt] = rec
        return result

    return _load("eval_results_strict.jsonl"), _load("eval_results_loose.jsonl")


# ---------------------------------------------------------------------------
# Score computation helpers
# ---------------------------------------------------------------------------


def instruction_pass_rate(follow_instruction_list: list[bool]) -> float:
    """
    Compute the fraction of individual constraints that passed (IS or IL metric).
    Returns 0.0 for an empty list to avoid division by zero.
    """
    if not follow_instruction_list:
        return 0.0
    return sum(1 for v in follow_instruction_list if v) / len(follow_instruction_list)


def failed_constraints_text(
    instruction_id_list: list[str], follow_instruction_list: list[bool]
) -> str:
    """
    Return a human-readable summary of which constraints failed.
    Returns "all passed" when no constraints failed, so the value is
    unambiguous (a dash could be confused with missing data).
    """
    failed = [
        cid
        for cid, passed in zip(instruction_id_list, follow_instruction_list)
        if not passed
    ]
    return ", ".join(failed) if failed else "all passed"


def constraint_labels(
    instruction_id_list: list[str], follow_instruction_list: list[bool]
) -> dict[str, str]:
    """
    Build per-constraint labels from the IFEval closed constraint vocabulary.

    Each constraint type present in the task gets a label value of "pass" or "fail".
    Tasks that do not have a given constraint type will simply have no entry for that
    label key, which InspectorRAGet renders as N/A in the Model Characteristics tab.
    """
    labels: dict[str, str] = {}
    for constraint_id, passed in zip(instruction_id_list, follow_instruction_list):
        labels[constraint_id] = "pass" if passed else "fail"
    return labels


# ---------------------------------------------------------------------------
# Core conversion
# ---------------------------------------------------------------------------


def convert(run_dir: Path, output_name: str, results_finder=None) -> dict:
    """
    Walk run_dir, collect all model variant subdirectories that contain IFEval
    results, and produce an InspectorRAGet JSON document with task_type "generation".

    Each model directory must contain (public google-research runner layout):
        <model_dir>/eval_results_strict.jsonl
        <model_dir>/eval_results_loose.jsonl   (optional but recommended)

    The prompt text is used as the join key across models and between strict/loose
    files. All models must have been run on the same prompt set.

    results_finder is an optional callable(run_dir) -> list[tuple[Path, Path]]
    that overrides find_model_dirs. Each tuple is (model_dir, ifeval_dir). Private
    wrappers use this to supply internal path logic without modifying the public
    converter.
    """
    model_entries = (results_finder or find_model_dirs)(run_dir)
    if not model_entries:
        sys.exit(
            f"Error: no model directories with IFEval results found under {run_dir}"
        )

    print(
        f"Found {len(model_entries)} model director{'y' if len(model_entries) == 1 else 'ies'} under {run_dir}"
    )

    # strict_scores[model_name][prompt] = record
    # loose_scores[model_name][prompt]  = record
    strict_scores: dict[str, dict[str, dict]] = {}
    loose_scores: dict[str, dict[str, dict]] = {}

    for model_dir, ifeval_dir in model_entries:
        model_name = model_dir.name
        print(f"\nProcessing: {model_name}")
        strict, loose = load_ifeval_scores(ifeval_dir)
        strict_scores[model_name] = strict
        loose_scores[model_name] = loose
        print(f"  Strict: {len(strict)} records")
        print(f"  Loose:  {len(loose)} records")

    # Collect all prompts across all models (union). In a well-formed run all
    # models share the same prompt set, but we handle partial runs gracefully.
    all_prompts: list[str] = []
    seen: set[str] = set()
    # Preserve order from the first model to keep task ordering stable.
    first_model = model_entries[0][0].name
    for prompt in strict_scores.get(first_model, {}):
        if prompt not in seen:
            all_prompts.append(prompt)
            seen.add(prompt)
    for model_name, prompts in strict_scores.items():
        if model_name == first_model:
            continue
        for prompt in prompts:
            if prompt not in seen:
                all_prompts.append(prompt)
                seen.add(prompt)

    all_model_names = [model_dir.name for model_dir, _ in model_entries]
    print(
        f"\nBuilding output for {len(all_prompts)} tasks across {len(all_model_names)} model(s)..."
    )

    tasks_list: list[dict] = []
    results_list: list[dict] = []

    for task_idx, prompt in enumerate(all_prompts):
        task_id = f"ifeval_{task_idx}"

        # instruction_id_list and kwargs are task-level (same for all models).
        # Take them from whichever model has a strict record for this prompt.
        instruction_id_list: list[str] = []
        for model_name in all_model_names:
            rec = strict_scores.get(model_name, {}).get(prompt)
            if rec and rec.get("instruction_id_list"):
                instruction_id_list = rec["instruction_id_list"]
                break

        task: dict = {
            "task_id": task_id,
            "task_type": "generation",
            "input": prompt,
        }
        tasks_list.append(task)

        for model_name in all_model_names:
            strict_rec = strict_scores.get(model_name, {}).get(prompt)
            loose_rec = loose_scores.get(model_name, {}).get(prompt)

            # A model must have at least a strict record to produce a result.
            if strict_rec is None:
                print(
                    f"  Warning: model '{model_name}' has no strict record for task {task_id}, skipping",
                    file=sys.stderr,
                )
                continue

            response = strict_rec.get("response", "")

            # PS: prompt-level strict pass/fail
            ps_pass = strict_rec.get("follow_all_instructions", False)
            strict_follow = strict_rec.get("follow_instruction_list", [])
            # IS: instruction-level strict pass rate
            is_rate = instruction_pass_rate(strict_follow)

            # PL and IL from loose file; fall back to strict values if loose is absent.
            if loose_rec is not None:
                pl_pass = loose_rec.get("follow_all_instructions", False)
                loose_follow = loose_rec.get("follow_instruction_list", [])
                il_rate = instruction_pass_rate(loose_follow)
            else:
                pl_pass = ps_pass
                loose_follow = strict_follow
                il_rate = is_rate

            scores: dict = {
                "PS": {
                    ANNOTATOR: {
                        "value": "pass" if ps_pass else "fail",
                    }
                },
                "IS": {
                    ANNOTATOR: {
                        "value": round(is_rate, 4),
                    }
                },
                "PL": {
                    ANNOTATOR: {
                        "value": "pass" if pl_pass else "fail",
                    }
                },
                "IL": {
                    ANNOTATOR: {
                        "value": round(il_rate, 4),
                    }
                },
            }

            scores["failed_constraints"] = {
                ANNOTATOR: {
                    "value": failed_constraints_text(instruction_id_list, strict_follow)
                }
            }

            # Labels: one key per constraint type present in this task, value "pass"/"fail".
            # Use strict evaluation results for labels — they are the canonical signal.
            labels = constraint_labels(instruction_id_list, strict_follow)

            output_message: dict = {"role": "assistant", "content": response}

            result_entry: dict = {
                "task_id": task_id,
                "model_id": model_name,
                "output": [output_message],
                "scores": scores,
                "labels": labels,
            }
            results_list.append(result_entry)

    # --- Metrics block ---
    metrics = [
        {
            "name": "PS",
            "display_name": "Prompt-Level Strict (PS)",
            "description": (
                "Whether ALL constraints in the prompt were satisfied under strict evaluation. "
                "Strict evaluation applies exact string matching with no normalization. "
                "This is the headline IFEval metric reported in the original paper."
            ),
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "ascending",
            "values": [
                {"value": "pass", "numeric_value": 1, "display_value": "Pass"},
                {"value": "fail", "numeric_value": 0, "display_value": "Fail"},
            ],
        },
        {
            "name": "IS",
            "display_name": "Instruction-Level Strict (IS)",
            "description": (
                "Fraction of individual constraints satisfied under strict evaluation (0–1). "
                "Normalized so tasks with more constraints are comparable to tasks with fewer. "
                "Higher is better. Computed as: constraints_passed / total_constraints."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "average",
            "order": "ascending",
            "range": [0, 1, 0.1],
        },
        {
            "name": "PL",
            "display_name": "Prompt-Level Loose (PL)",
            "description": (
                "Whether ALL constraints in the prompt were satisfied under loose evaluation. "
                "Loose evaluation applies normalizations (strip whitespace, remove asterisks, "
                "drop first/last lines) before checking. PL >= PS always."
            ),
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "ascending",
            "values": [
                {"value": "pass", "numeric_value": 1, "display_value": "Pass"},
                {"value": "fail", "numeric_value": 0, "display_value": "Fail"},
            ],
        },
        {
            "name": "IL",
            "display_name": "Instruction-Level Loose (IL)",
            "description": (
                "Fraction of individual constraints satisfied under loose evaluation (0–1). "
                "Loose evaluation applies normalizations before checking each constraint. "
                "IL >= IS always. Higher is better."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "average",
            "order": "ascending",
            "range": [0, 1, 0.1],
        },
        {
            "name": "failed_constraints",
            "display_name": "Failed Constraints",
            "description": (
                "Comma-separated list of constraint types that failed under strict evaluation. "
                "'all passed' when no constraints failed."
            ),
            "author": "algorithm",
            "type": "text",
        },
    ]

    models = [{"model_id": name, "name": name} for name in all_model_names]

    output_doc = {
        "schema_version": SCHEMA_VERSION,
        "name": output_name,
        "models": models,
        "metrics": metrics,
        "tasks": tasks_list,
        "results": results_list,
    }

    return output_doc


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert IFEval output directories to an InspectorRAGet JSON file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python convert.py --run-dir runs/my_experiment --output runs/my_experiment/ifeval.json

  python convert.py \\
      --run-dir runs/my_experiment \\
      --name "My IFEval Experiment" \\
      --output runs/my_experiment/ifeval.json
""",
    )
    parser.add_argument(
        "--run-dir",
        required=True,
        type=Path,
        help=(
            "Root directory containing one subdirectory per model variant. "
            "Each subdirectory must contain eval_results_strict.jsonl "
            "(standard google-research IFEval runner layout)."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=(
            "Path for the output InspectorRAGet JSON file. "
            "Defaults to ifeval.json inside --run-dir."
        ),
    )
    parser.add_argument(
        "--name",
        default="IFEval Evaluation",
        help="Display name for this evaluation in InspectorRAGet (default: 'IFEval Evaluation').",
    )

    args = parser.parse_args()

    if not args.run_dir.exists():
        sys.exit(f"Error: --run-dir path does not exist: {args.run_dir}")

    output = args.output if args.output else args.run_dir / "ifeval.json"

    result = convert(args.run_dir, args.name)

    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    task_count = len(result.get("tasks", []))
    model_count = len(result.get("models", []))
    print(f"\nWrote {task_count} tasks across {model_count} model(s) to {output}")


if __name__ == "__main__":
    main()
