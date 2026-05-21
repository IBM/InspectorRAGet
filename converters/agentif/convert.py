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

AgentIF → InspectorRAGet converter.

Reads one or more model output directories and writes a single
InspectorRAGet JSON file for AgentIF benchmark results.

Usage:
    python convert.py --run-dir runs/my_experiment --output runs/my_experiment/agentif.json

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

ANNOTATOR = "agentif"

# ---------------------------------------------------------------------------
# File loading
# ---------------------------------------------------------------------------


def load_results(path: Path) -> list[dict]:
    """Load merged_for_eval/results.json for one model directory."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        sys.exit(f"Error: expected a JSON array in {path}, got {type(data).__name__}")
    return data


# ---------------------------------------------------------------------------
# Directory scanning
# ---------------------------------------------------------------------------


def find_model_dirs(run_dir: Path) -> list[Path]:
    """
    Return subdirectories of run_dir that contain AgentIF result files at
    <model_dir>/agentif/merged_for_eval/results.json.
    """
    model_dirs = []
    for entry in sorted(run_dir.iterdir()):
        if not entry.is_dir():
            continue
        if (entry / "agentif" / "merged_for_eval" / "results.json").exists():
            model_dirs.append(entry)
    return model_dirs


# ---------------------------------------------------------------------------
# Score helpers
# ---------------------------------------------------------------------------


def normalize_constraint_types(raw: object) -> list[str]:
    """
    Normalize the constraint 'type' field to a flat sorted list of strings.

    The field is inconsistently stored in AgentIF output: sometimes a list
    (e.g. ['semantic']), sometimes a bare string (e.g. 'formatting').
    """
    if isinstance(raw, list):
        return sorted(str(t) for t in raw if t)
    if isinstance(raw, str) and raw:
        return [raw]
    return []


def per_task_csr(constraints: list[dict], exclude_meta: bool = False) -> float:
    """
    Compute per-task CSR (Constraint Success Rate).

    CSR = constraints_passed / constraints_scored among constraints with a
    non-null score. Conditional constraints that were not triggered (score=null)
    are excluded from both numerator and denominator.

    With exclude_meta=False (default): matches the AgentIF accuracy.json output
    exactly — the actual runner includes meta constraints despite the paper saying
    otherwise. Empirically verified against benchmark runner ground truth.

    With exclude_meta=True: excludes is_meta constraints, matching the paper
    definition. Useful for comparing model performance on content constraints only.

    Returns 0.0 when no scored constraints exist.
    """
    scored = [
        c for c in constraints
        if c.get("score") is not None
        and (not exclude_meta or not c.get("is_meta"))
    ]
    if not scored:
        return 0.0
    return sum(1 for c in scored if c["score"] is True) / len(scored)


def task_passes(constraints: list[dict], exclude_meta: bool = False) -> bool:
    """
    Return True if all scored constraints passed (ISR numerator).

    With exclude_meta=False (default): includes meta constraints, matching the
    AgentIF accuracy.json ISR values exactly.

    With exclude_meta=True: excludes meta constraints, matching the paper
    definition. A task can pass ISR_no_meta while failing ISR if a meta
    constraint caused the failure.

    Returns False when no scored constraints exist.
    """
    scored = [
        c for c in constraints
        if c.get("score") is not None
        and (not exclude_meta or not c.get("is_meta"))
    ]
    return bool(scored) and all(c["score"] is True for c in scored)




def failed_constraints_text(constraints: list[dict]) -> str:
    """
    Return a human-readable summary of which constraints failed.

    Includes all scored constraints (meta and non-meta) that are False, since
    both contribute to ISR failures. Format: "[dimension | type] desc" per
    failing constraint, semicolon-separated. Returns "all passed" when nothing
    failed.
    """
    entries = []
    for c in constraints:
        if c.get("score") is not True and c.get("score") is not None:
            dim = c.get("dimension", "?")
            types = normalize_constraint_types(c.get("type"))
            type_str = ", ".join(types) if types else "?"
            desc = c.get("desc", "").strip()
            entries.append(f"[{dim} | {type_str}] {desc}")
    return "; ".join(entries) if entries else "all passed"


def build_labels(constraints: list[dict]) -> dict[str, str]:
    """
    Build per-dimension and per-type labels from constraint scores.

    For each constraint dimension (unconditional, conditional, example_driven)
    and each normalized type (semantic, formatting, resource) present in the
    task, emit a label of "pass" if every scored non-meta constraint for that
    key passed, "fail" if any failed. Untriggered constraints (score=null) do
    not affect the label for their dimension/type.
    """
    dim_results: dict[str, list[bool]] = {}
    type_results: dict[str, list[bool]] = {}

    for c in constraints:
        if c.get("is_meta") or c.get("score") is None:
            continue
        passed = c["score"] is True
        dim = c.get("dimension")
        if dim:
            dim_results.setdefault(dim, []).append(passed)
        for t in normalize_constraint_types(c.get("type")):
            type_results.setdefault(t, []).append(passed)

    labels: dict[str, str] = {}
    for dim, verdicts in dim_results.items():
        labels[dim] = "pass" if all(verdicts) else "fail"
    for t, verdicts in type_results.items():
        labels[t] = "pass" if all(verdicts) else "fail"
    return labels


def task_id_for(record: dict, idx: int) -> str:
    """
    Build a stable task ID for a record.

    Schema A (domain/query_id/turn_id/prompt_type): encode all four fields.
    Schema B (id + agent_name): encode both — 'id' alone is not unique across
    agent types; (id, agent_name) is the minimal unique key for Schema B records.
    Falls back to the positional index if neither key is present.
    """
    if "domain" in record:
        ptype_safe = record.get("prompt_type", "").replace(" ", "_")
        return f"agentif_{record['domain']}_{record['query_id']}_{record['turn_id']}_{ptype_safe}"
    if "id" in record:
        agent_safe = record.get("agent_name", "").replace(" ", "_")
        return f"agentif_{record['id']}_{agent_safe}"
    return f"agentif_{idx}"


def filter_fields_for(record: dict) -> dict[str, str]:
    """
    Extract filter field values from a record.

    Schema A carries domain and prompt_type; Schema B carries agent_name.
    Fields absent on a record use "N/A" so the filter UI shows a meaningful
    label rather than a blank entry.
    """
    return {
        "domain": record.get("domain") or "N/A",
        "prompt_type": record.get("prompt_type") or "N/A",
        "agent_name": record.get("agent_name") or "N/A",
    }


# ---------------------------------------------------------------------------
# Core conversion
# ---------------------------------------------------------------------------


def convert(run_dir: Path, output_name: str) -> dict:
    """
    Walk run_dir, collect all model variant subdirectories containing AgentIF
    results, and produce an InspectorRAGet JSON document with task_type
    "generation".

    Each model directory must contain:
        agentif/merged_for_eval/results.json

    Records are joined across models by positional index. All model directories
    must contain results for the same ordered task list.
    """
    model_dirs = find_model_dirs(run_dir)
    if not model_dirs:
        sys.exit(
            f"Error: no model directories with agentif/ results found under {run_dir}"
        )

    print(
        f"Found {len(model_dirs)} model director{'y' if len(model_dirs) == 1 else 'ies'} under {run_dir}"
    )

    # records_by_model[model_name] = list of records in original order
    records_by_model: dict[str, list[dict]] = {}

    for model_dir in model_dirs:
        model_name = model_dir.name
        score_file = model_dir / "agentif" / "merged_for_eval" / "results.json"
        print(f"\nProcessing: {model_name}")
        records = load_results(score_file)
        records_by_model[model_name] = records
        print(f"  Records: {len(records)}")

    first_model_name = model_dirs[0].name
    first_records = records_by_model[first_model_name]
    n_tasks = len(first_records)

    # Validate all models have the same record count.
    for model_name, records in records_by_model.items():
        if len(records) != n_tasks:
            sys.exit(
                f"Error: model '{model_name}' has {len(records)} records but "
                f"'{first_model_name}' has {n_tasks}. All models must cover the same task set."
            )

    all_model_names = [d.name for d in model_dirs]
    print(
        f"\nBuilding output for {n_tasks} tasks across {len(all_model_names)} model(s)..."
    )

    tasks_list: list[dict] = []
    results_list: list[dict] = []

    for idx, ref_record in enumerate(first_records):
        task_id = task_id_for(ref_record, idx)

        task: dict = {
            "task_id": task_id,
            "task_type": "generation",
            "input": ref_record.get("input", []),
            **filter_fields_for(ref_record),
        }
        tasks_list.append(task)

        for model_name in all_model_names:
            record = records_by_model[model_name][idx]
            constraints = record.get("constraints", [])
            response = record.get("output", {}).get("content", "")

            csr = per_task_csr(constraints)
            csr_reg = per_task_csr(constraints, exclude_meta=True)
            isr = task_passes(constraints)
            isr_reg = task_passes(constraints, exclude_meta=True)

            scores: dict = {
                "csr": {
                    ANNOTATOR: {
                        "value": round(csr, 4),
                    }
                },
                "csr_no_meta": {
                    ANNOTATOR: {
                        "value": round(csr_reg, 4),
                    }
                },
                "isr": {
                    ANNOTATOR: {
                        "value": "pass" if isr else "fail",
                    }
                },
                "isr_no_meta": {
                    ANNOTATOR: {
                        "value": "pass" if isr_reg else "fail",
                    }
                },
                "failed_constraints": {
                    ANNOTATOR: {
                        "value": failed_constraints_text(constraints),
                    }
                },
            }

            labels = build_labels(constraints)

            result_entry: dict = {
                "task_id": task_id,
                "model_id": model_name,
                "output": [{"role": "assistant", "content": response}],
                "scores": scores,
                "labels": labels,
            }
            results_list.append(result_entry)

    # --- Metrics block ---
    metrics = [
        {
            "name": "csr",
            "display_name": "Constraint Success Rate",
            "description": (
                "Fraction of constraints satisfied (0–1), including meta constraints. "
                "Meta constraints govern other constraints (selection, detailing, prioritization) "
                "rather than applying directly to the response. "
                "Untriggered conditional constraints (score=null) are excluded. "
                "Matches the AgentIF benchmark runner output. Higher is better."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "average",
            "order": "ascending",
            "range": [0, 1, 0.1],
        },
        {
            "name": "csr_no_meta",
            "display_name": "Constraint Success Rate (Regular Constraints)",
            "description": (
                "Fraction of regular constraints satisfied (0–1), excluding meta constraints. "
                "Regular constraints apply directly to the model's response (formatting, "
                "semantic, tool). Matches the AgentIF paper definition of CSR."
                "Untriggered conditional constraints (score=null) are excluded. Higher is better."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "average",
            "order": "ascending",
            "range": [0, 1, 0.1],
        },
        {
            "name": "isr",
            "display_name": "Instruction Success Rate",
            "description": (
                "Whether ALL constraints (including meta) were satisfied. "
                "A task passes only if every triggered constraint passed. "
                "Matches the AgentIF benchmark runner output."
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
            "name": "isr_no_meta",
            "display_name": "Instruction Success Rate (Regular Constraints)",
            "description": (
                "Whether ALL regular constraints (excluding meta) were satisfied. "
                "A task can pass this metric while failing ISR if only a meta constraint failed. "
                "Matches the AgentIF paper definition of ISR."
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
                "Semicolon-separated list of all constraints that failed (meta and regular), "
                "each formatted as '[dimension | type] description'. 'all passed' when nothing failed."
            ),
            "author": "algorithm",
            "type": "text",
        },
    ]

    filters = ["domain", "prompt_type", "agent_name"]

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
    """Entry point for the AgentIF converter CLI."""
    parser = argparse.ArgumentParser(
        description="Convert AgentIF output directories to an InspectorRAGet JSON file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python convert.py --run-dir runs/my_experiment --output runs/my_experiment/agentif.json

  python convert.py \\
      --run-dir runs/my_experiment \\
      --name "My AgentIF Experiment" \\
      --output runs/my_experiment/agentif.json
""",
    )
    parser.add_argument(
        "--run-dir",
        required=True,
        type=Path,
        help=(
            "Root directory containing one subdirectory per model variant. "
            "Each subdirectory must contain agentif/merged_for_eval/results.json."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=(
            "Path for the output InspectorRAGet JSON file. "
            "Defaults to agentif.json inside --run-dir."
        ),
    )
    parser.add_argument(
        "--name",
        default="AgentIF Evaluation",
        help="Display name for this evaluation in InspectorRAGet (default: 'AgentIF Evaluation').",
    )

    args = parser.parse_args()

    if not args.run_dir.exists():
        sys.exit(f"Error: --run-dir path does not exist: {args.run_dir}")

    output = args.output if args.output else args.run_dir / "agentif.json"

    result = convert(args.run_dir, args.name)

    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    task_count = len(result.get("tasks", []))
    model_count = len(result.get("models", []))
    print(f"\nWrote {task_count} tasks across {model_count} model(s) to {output}")


if __name__ == "__main__":
    main()
