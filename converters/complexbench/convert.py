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

ComplexBench → InspectorRAGet converter.

Reads one or more model output directories and writes a single
InspectorRAGet JSON file for ComplexBench evaluation results.

Usage:
    python convert.py --run-dir runs/my_experiment --output runs/my_experiment/complexbench.json

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

# Annotator key stamped on all scores.
ANNOTATOR = "complexbench"

# ---------------------------------------------------------------------------
# File loading
# ---------------------------------------------------------------------------


def load_final_results(path: Path) -> list[dict]:
    """Load evaluated_model_final_results.json for one model directory."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        sys.exit(f"Error: expected a JSON array in {path}, got {type(data).__name__}")
    return data


# ---------------------------------------------------------------------------
# Directory scanning
# ---------------------------------------------------------------------------


def find_model_results(run_dir: Path) -> list[tuple[str, Path]]:
    """
    Return (model_id, results_path) pairs for all ComplexBench score files found
    under run_dir (public runner layout).

    The public runner writes one flat file per model:
        <run_dir>/<model_id>_final_results.json

    The model ID is extracted from the filename by stripping the
    '_final_results.json' suffix. Files are returned in sorted order so output
    is deterministic.
    """
    results = []
    for path in sorted(run_dir.glob("*_final_results.json")):
        model_id = path.name[: -len("_final_results.json")]
        results.append((model_id, path))
    return results


# ---------------------------------------------------------------------------
# Score helpers
# ---------------------------------------------------------------------------


def per_task_drfr(point_judges_rely: list[bool]) -> float:
    """
    Compute per-task DRFR (Dependency-aware Result Fraction Rate).

    DRFR = sum(point_judges_rely) / len(point_judges_rely).
    Returns 0.0 for an empty list to avoid division by zero.

    The global DRFR reported in evaluated_model_statistics.json equals the
    sum of this value across all tasks divided by the number of tasks (i.e.
    the macro-average), which is arithmetically equivalent to computing it
    over the entire pool of constraint verdicts.
    """
    if not point_judges_rely:
        return 0.0
    return sum(point_judges_rely) / len(point_judges_rely)


def failed_constraints_text(
    scoring_questions: list[dict], point_judges_rely: list[bool]
) -> str:
    """
    Return a human-readable summary of which constraints failed, including
    the specific question text for each failure.

    Format: "[Dim1, Dim2] question_en; [Dim] question_en; ..."
    When a question has no constraint_dimensions tag, "[?]" is used as the
    bracket prefix. Semicolons separate entries because question text can
    contain commas.

    Returns "all passed" when no constraints failed so the value is
    unambiguous (a dash could be confused with missing data).
    """
    entries = []
    for q, passed in zip(scoring_questions, point_judges_rely):
        if not passed:
            dims = q.get("constraint_dimensions", [])
            dim_label = ", ".join(dims) if dims else "?"
            entries.append(f"[{dim_label}] {q.get('question_en', '').strip()}")
    return "; ".join(entries) if entries else "all passed"


def build_labels(
    scoring_questions: list[dict], point_judges_rely: list[bool]
) -> dict[str, str]:
    """
    Build per-constraint-dimension labels from the ComplexBench closed vocabulary.

    Each constraint dimension present in the task gets a label of "pass" or "fail".
    When a task has multiple scoring questions mapped to the same dimension, the
    label is "fail" if any of those questions failed (conservative: any failure
    in a dimension counts as a dimension failure).

    Uses point_judges_rely (dependency-adjusted verdicts) rather than raw
    point_judges so the label reflects what the benchmark actually scored.
    """
    dim_results: dict[str, list[bool]] = {}
    for q, passed in zip(scoring_questions, point_judges_rely):
        for dim in q.get("constraint_dimensions", []):
            dim_results.setdefault(dim, []).append(passed)
    return {
        dim: ("pass" if all(verdicts) else "fail")
        for dim, verdicts in dim_results.items()
    }


# ---------------------------------------------------------------------------
# Core conversion
# ---------------------------------------------------------------------------


def convert(
    run_dir: Path,
    output_name: str,
    results_finder=None,
) -> dict:
    """
    Walk run_dir, collect all ComplexBench result files, and produce an
    InspectorRAGet JSON document with task_type "generation".

    Each model's results must be a flat file at:
        <run_dir>/<model_id>_final_results.json

    The main_id field is used as the stable join key across models. All models
    must have been evaluated on the same task set.

    results_finder is an optional callable(run_dir) -> list[tuple[str, Path]] that
    overrides find_model_results. Private wrappers can use this to supply internal
    path logic without modifying the public converter.
    """
    model_results = (results_finder or find_model_results)(run_dir)
    if not model_results:
        sys.exit(f"Error: no ComplexBench result files found under {run_dir}")

    print(
        f"Found {len(model_results)} model result{'s' if len(model_results) != 1 else ''} under {run_dir}"
    )

    # records_by_model[model_name][main_id] = record dict
    records_by_model: dict[str, dict[int, dict]] = {}

    for model_name, score_file in model_results:
        print(f"\nProcessing: {model_name}")
        records = load_final_results(score_file)
        records_by_model[model_name] = {r["main_id"]: r for r in records}
        print(f"  Records: {len(records)}")

    # Build the ordered task list from the first model (tasks are identical across models).
    first_model_name = model_results[0][0]
    first_model_records = records_by_model[first_model_name]
    ordered_ids = sorted(first_model_records.keys())

    all_model_names = [name for name, _ in model_results]
    print(
        f"\nBuilding output for {len(ordered_ids)} tasks across {len(all_model_names)} model(s)..."
    )

    tasks_list: list[dict] = []
    results_list: list[dict] = []

    for main_id in ordered_ids:
        task_id = f"complexbench_{main_id}"

        # Task-level fields are invariant across models; read from the first model.
        ref_record = first_model_records[main_id]
        instruction = ref_record.get("instruction_en") or ref_record.get(
            "instruction", ""
        )

        task: dict = {
            "task_id": task_id,
            "task_type": "generation",
            "input": instruction,
            "category": ref_record.get("category", ""),
            "ability": ref_record.get("task_types", ""),
            "constraints": ref_record.get("constraint_dimensions", []),
        }
        tasks_list.append(task)

        for model_name in all_model_names:
            record = records_by_model.get(model_name, {}).get(main_id)
            if record is None:
                print(
                    f"  Warning: model '{model_name}' has no record for task {task_id}, skipping",
                    file=sys.stderr,
                )
                continue

            response = record.get("output", "")
            point_judges_rely: list[bool] = record.get("point_judges_rely", [])
            scoring_questions: list[dict] = record.get("scoring_questions", [])

            drfr = per_task_drfr(point_judges_rely)
            task_passed = all(point_judges_rely) if point_judges_rely else False

            scores: dict = {
                "DRFR": {
                    ANNOTATOR: {
                        "value": round(drfr, 4),
                    }
                },
                "task_pass": {
                    ANNOTATOR: {
                        "value": "pass" if task_passed else "fail",
                    }
                },
                "failed_constraints": {
                    ANNOTATOR: {
                        "value": failed_constraints_text(
                            scoring_questions, point_judges_rely
                        ),
                    }
                },
            }

            labels = build_labels(scoring_questions, point_judges_rely)

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
            "name": "DRFR",
            "display_name": "Dependency-aware Result Fraction Rate (DRFR)",
            "description": (
                "Fraction of per-constraint verdicts that passed, after applying dependency "
                "logic (point_judges_rely). A downstream constraint is marked failed if any "
                "prerequisite constraint failed, even if the judge would have passed it in "
                "isolation. Range 0–1; higher is better. The global DRFR in the ComplexBench "
                "statistics file equals the macro-average of this value across all tasks."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "average",
            "order": "ascending",
            "range": [0, 1, 0.1],
        },
        {
            "name": "task_pass",
            "display_name": "Task Pass",
            "description": (
                "Whether ALL per-constraint verdicts passed (after dependency adjustment). "
                "A task passes only if every scoring question's point_judges_rely value is True."
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
            "name": "failed_constraints",
            "display_name": "Failed Constraints",
            "description": (
                "Semicolon-separated list of constraints that failed under dependency-adjusted "
                "evaluation (point_judges_rely). Each entry is formatted as "
                "'[dimension] question text' so the specific requirement is visible. "
                "Questions with no dimension tag use '[?]'. "
                "'all passed' when no constraints failed."
            ),
            "author": "algorithm",
            "type": "text",
        },
    ]

    filters = ["category", "ability", "constraints"]

    models = [{"model_id": name, "name": name} for name in all_model_names]

    output_doc = {
        "schema_version": SCHEMA_VERSION,
        "name": output_name,
        "models": models,
        "metrics": metrics,
        "filters": filters,
        "tasks": tasks_list,
        "results": results_list,
    }

    return output_doc


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    """Entry point for the ComplexBench converter CLI."""
    parser = argparse.ArgumentParser(
        description="Convert ComplexBench output directories to an InspectorRAGet JSON file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python convert.py --run-dir runs/my_experiment --output runs/my_experiment/complexbench.json

  python convert.py \\
      --run-dir runs/my_experiment \\
      --name "My ComplexBench Experiment" \\
      --output runs/my_experiment/complexbench.json
""",
    )
    parser.add_argument(
        "--run-dir",
        required=True,
        type=Path,
        help=(
            "Directory containing ComplexBench result files. "
            "Public runner layout: <run_dir>/<model_id>_final_results.json. "
            "Internal runner layout: <run_dir>/<model_id>/complexbench/evaluated_model_final_results.json."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=(
            "Path for the output InspectorRAGet JSON file. "
            "Defaults to complexbench.json inside --run-dir."
        ),
    )
    parser.add_argument(
        "--name",
        default="ComplexBench Evaluation",
        help="Display name for this evaluation in InspectorRAGet (default: 'ComplexBench Evaluation').",
    )

    args = parser.parse_args()

    if not args.run_dir.exists():
        sys.exit(f"Error: --run-dir path does not exist: {args.run_dir}")

    output = args.output if args.output else args.run_dir / "complexbench.json"

    result = convert(args.run_dir, args.name)

    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    task_count = len(result.get("tasks", []))
    model_count = len(result.get("models", []))
    print(f"\nWrote {task_count} tasks across {model_count} model(s) to {output}")


if __name__ == "__main__":
    main()
