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

BFCL → InspectorRAGet converter.

Reads one or more BFCL model output directories and writes a single
InspectorRAGet JSON file.

Usage:
    python convert.py \\
        --bfcl-root /path/to/bfcl/output \\
        --dataset-dir /path/to/bfcl/dataset \\
        --output results.json \\
        --task-type tool_calling

See README.md for full documentation.
"""

import argparse
import json
import os
import sys
import uuid
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 2

# Single-turn categories that map to the tool_calling task type.
# These use next-response-prediction evaluation: input = conversation history,
# output = predicted next tool call(s), ground truth = expected call(s).
#
# java and javascript are included here. Their tool definition schemas use the
# same dict/properties/required structure as Python categories — only the type
# name strings differ (e.g. "HashMap", "ArrayList", "Boolean"). InspectorRAGet
# renders these as-is, which is correct: a researcher looking at a Java task
# will recognise the type names. Model output argument values in these categories
# are language-syntax strings (e.g. new ArrayList<String>(...)) rather than
# JSON values, which also renders fine as text.
TOOL_CALLING_CATEGORIES = {
    "simple",
    "multiple",
    "parallel",
    "parallel_multiple",
    "irrelevance",
    "live_simple",
    "live_multiple",
    "live_parallel",
    "live_parallel_multiple",
    "live_relevance",
    "live_irrelevance",
    "java",
    "javascript",
    # V4 renames "simple" → "simple_python" and adds new single-turn categories.
    "simple_python",
    "format_sensitivity",
}

# Multi-turn categories require the agentic task type (goal-directed execution
# with stateful environment simulation). Not supported by this converter.
AGENTIC_CATEGORIES = {
    "multi_turn_base",
    "multi_turn_miss_func",
    "multi_turn_miss_param",
    "multi_turn_long_context",
    # V4 agentic categories — require live tool execution, not next-response prediction.
    "web_search",
    "memory",
}

# No categories are skipped entirely in tool_calling mode.
SKIPPED_CATEGORIES: set[str] = set()

# Maps BFCL error_type prefixes/values to a recoverability severity score.
# Semantic anchor: how hard would this error be to fix?
#   0.00 — correct
#   0.25 — right function, wrong argument details (recoverable)
#   0.50 — wrong function entirely, or wrong count (more fundamental)
#   0.75 — should not have called any function (irrelevance error)
#   1.00 — output could not be decoded at all (worst case)
SEVERITY_MAP = {
    # Argument-level errors — model understood the task, got details wrong
    "type_error:simple": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "type_error:nested": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:string": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:others": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:list/tuple": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:dict_value": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "simple_function_checker:missing_optional": ("wrong_arguments", 0.25, "Wrong Arguments"),
    # Function-level errors — model called the wrong thing
    "simple_function_checker:wrong_func_name": ("wrong_function", 0.50, "Wrong Function"),
    "simple_function_checker:wrong_count": ("wrong_function", 0.50, "Wrong Function"),
    "multiple_function_checker:wrong_count": ("wrong_function", 0.50, "Wrong Function"),
    "parallel_function_checker_no_order:wrong_count": ("wrong_function", 0.50, "Wrong Function"),
    "parallel_function_checker_no_order:cannot_find_match": ("wrong_function", 0.50, "Wrong Function"),
    # Irrelevance errors — model called a function when it should have declined
    "irrelevance_error:decoder_success": ("irrelevance_error", 0.75, "Irrelevance Error"),
}


# ---------------------------------------------------------------------------
# Tool definition normalisation
# ---------------------------------------------------------------------------

def normalize_tool_def(tool: dict) -> dict:
    """
    Recursively replace BFCL's "type": "dict" with "type": "object" so the
    result is valid JSON Schema understood by InspectorRAGet's ToolDefinition.
    """
    if not isinstance(tool, dict):
        return tool
    result = {}
    for key, value in tool.items():
        if key == "type" and value == "dict":
            result[key] = "object"
        elif isinstance(value, dict):
            result[key] = normalize_tool_def(value)
        elif isinstance(value, list):
            result[key] = [normalize_tool_def(item) if isinstance(item, dict) else item for item in value]
        else:
            result[key] = value
    return result


# ---------------------------------------------------------------------------
# Ground-truth (possible_answer) → TaskTarget conversion
# ---------------------------------------------------------------------------

def possible_answer_to_targets(possible_answer: list) -> list:
    """
    Convert BFCL's possible_answer structure to InspectorRAGet TaskTarget[].

    BFCL structure:
        possible_answer = [
            { "func_a": { "arg1": ["val_a", "val_b"], "arg2": [true] } },
            { "func_b": { "arg1": ["val_c"] } },
        ]

    The outer list elements are all required parallel calls (AND semantics).
    Simple and multiple categories have a single element; parallel and
    parallel_multiple categories have multiple elements, one per parallel call.

    Per-argument value arrays = acceptable alternatives for that argument.

    Mapping:
        All outer elements → one TaskTarget { type: "tool_calls", calls, alternatives? }
        calls[i] uses arg[0] as the canonical argument value.
        alternatives[call_id] holds ToolCallRecords for arg combinations beyond the first.
    """
    if not possible_answer:
        return []

    calls = []
    alternatives: dict[str, list] = {}

    for answer_entry in possible_answer:
        if not isinstance(answer_entry, dict):
            continue

        for func_name, args in answer_entry.items():
            call_id = str(uuid.uuid4())

            # Build canonical call using the first acceptable value for each arg.
            canonical_args = {}
            if isinstance(args, dict):
                for arg_name, arg_values in args.items():
                    if isinstance(arg_values, list) and arg_values:
                        canonical_args[arg_name] = arg_values[0]
                    else:
                        canonical_args[arg_name] = arg_values

            calls.append({"id": call_id, "name": func_name, "arguments": canonical_args})

            # If any argument has more than one acceptable value, record the
            # additional combinations in alternatives keyed by this call's id.
            if isinstance(args, dict):
                extra_values = {k: v for k, v in args.items() if isinstance(v, list) and len(v) > 1}
                if extra_values:
                    alt_calls = []
                    # Generate one ToolCallRecord per additional combination.
                    # BFCL does not define which combinations are valid — treat
                    # each argument's alternatives independently (per BFCL semantics).
                    max_alts = max(len(v) for v in extra_values.values())
                    for i in range(1, max_alts):
                        alt_args = dict(canonical_args)
                        for arg_name, arg_values in extra_values.items():
                            if i < len(arg_values):
                                alt_args[arg_name] = arg_values[i]
                        alt_calls.append({"id": str(uuid.uuid4()), "name": func_name, "arguments": alt_args})
                    if alt_calls:
                        alternatives[call_id] = alt_calls

    target: dict = {"type": "tool_calls", "calls": calls}
    if alternatives:
        target["alternatives"] = alternatives
    return [target]


# ---------------------------------------------------------------------------
# Model output → Message[] conversion
# ---------------------------------------------------------------------------

def decoded_to_tool_calls(model_result_decoded) -> list | None:
    """
    Convert BFCL's model_result_decoded (a list of {func_name: {args}} dicts)
    to a ToolCallRecord list for use in an assistant Message.
    Returns None if the decoded result is empty or unparseable.
    """
    if not model_result_decoded or not isinstance(model_result_decoded, list):
        return None

    calls = []
    for entry in model_result_decoded:
        if not isinstance(entry, dict):
            continue
        for func_name, args in entry.items():
            calls.append({
                "id": str(uuid.uuid4()),
                "name": func_name,
                "arguments": args if isinstance(args, dict) else {},
            })

    return calls if calls else None


# ---------------------------------------------------------------------------
# Error severity derivation
# ---------------------------------------------------------------------------

def derive_severity(valid: bool, error_type: str | None) -> tuple[str, float, str]:
    """
    Returns (value, numericValue, displayValue) for the bfcl_error_severity metric.
    """
    if valid:
        return ("correct", 0.0, "Correct")
    if not error_type:
        return ("malformed_output", 1.0, "Malformed Output")
    severity = SEVERITY_MAP.get(error_type)
    if severity:
        return severity
    # error_type present but not in the known mapping — treat as wrong_function severity
    return ("unknown", 0.5, "Unknown")


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
                    print(f"  Warning: skipping malformed line in {path}: {e}", file=sys.stderr)
    return records


def infer_category(filename: str) -> str | None:
    """
    Extract the BFCL category from a result or score filename.
    e.g. "BFCL_v3_live_simple_result.json" → "live_simple"
         "BFCL_v3_parallel_multiple_score.json" → "parallel_multiple"
    """
    stem = Path(filename).stem  # e.g. "BFCL_v3_live_simple_result"
    for suffix in ("_result", "_score"):
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    # Strip version prefix (v4, v3, v2, v1)
    for prefix in ("BFCL_v4_", "BFCL_v3_", "BFCL_v2_", "BFCL_v1_"):
        if stem.startswith(prefix):
            return stem[len(prefix):]
    return None


# ---------------------------------------------------------------------------
# Directory scanning
# ---------------------------------------------------------------------------

def find_model_dirs(bfcl_root: Path) -> list[Path]:
    """
    Return subdirectories of bfcl_root that look like BFCL model output dirs,
    i.e. they contain a result/ or score/ subdirectory.
    """
    model_dirs = []
    for entry in sorted(bfcl_root.iterdir()):
        if entry.is_dir() and ((entry / "result").exists() or (entry / "score").exists()):
            model_dirs.append(entry)
    return model_dirs


def find_model_id_dir(model_dir: Path, subdir: str) -> list[Path]:
    """
    Return leaf model-id directories inside model_dir/subdir/.
    BFCL nests files under <model-dir>/<subdir>/<model-id>/*.json.
    """
    base = model_dir / subdir
    if not base.exists():
        return []
    # The model-id directory is the first level of children under base.
    return [p for p in sorted(base.iterdir()) if p.is_dir()]


def load_dataset_dir(dataset_dir: Path, categories: set[str]) -> dict[str, dict]:
    """
    Load BFCL dataset files (e.g. BFCL_v3_simple.json) from dataset_dir.
    Returns a map of task_id → prompt record.

    Dataset files are one JSON object per line. Each record has the same
    structure as the prompt field in score files:
        { "id": ..., "question": [[...]], "function": [...] }

    Ground-truth answers live in a parallel possible_answer/ subdirectory:
        { "id": ..., "ground_truth": [{func_name: {arg: [values]}}] }

    The ground_truth list is merged into each prompt record under the key
    "possible_answer" so the rest of the converter can use a single field name
    regardless of whether the answer came from a score file or the answer files.
    """
    dataset_map: dict[str, dict] = {}
    for category in categories:
        for pattern in (f"BFCL_v4_{category}.json", f"BFCL_v3_{category}.json", f"BFCL_v2_{category}.json"):
            path = dataset_dir / pattern
            if not path.exists():
                continue
            for record in load_jsonl(path):
                task_id = record.get("id")
                if task_id:
                    dataset_map[task_id] = record
            break  # found the file for this category, stop looking

    # Merge ground-truth answers from possible_answer/ subdirectory.
    # These files contain the correct answers for all tasks, including passing
    # ones that are absent from score files.
    answer_dir = dataset_dir / "possible_answer"
    if answer_dir.exists():
        for category in categories:
            for pattern in (f"BFCL_v4_{category}.json", f"BFCL_v3_{category}.json", f"BFCL_v2_{category}.json"):
                path = answer_dir / pattern
                if not path.exists():
                    continue
                for record in load_jsonl(path):
                    task_id = record.get("id")
                    ground_truth = record.get("ground_truth")
                    if task_id and ground_truth and task_id in dataset_map:
                        dataset_map[task_id]["possible_answer"] = ground_truth
                break

    return dataset_map


# ---------------------------------------------------------------------------
# Core conversion: tool_calling task type
# ---------------------------------------------------------------------------

def convert_tool_calling(
    bfcl_root: Path,
    dataset_dir: Path | None,
    output_name: str,
) -> dict:
    """
    Walk bfcl_root, collect all single-turn BFCL categories, and produce an
    InspectorRAGet JSON document with task_type "tool_calling".
    """
    # Collect per-model result and score records across all valid categories.
    # result_map[model_id][task_id] = result record
    # score_map[model_id][task_id]  = score record (failures only)
    result_map: dict[str, dict[str, dict]] = defaultdict(dict)
    score_map: dict[str, dict[str, dict]] = defaultdict(dict)
    model_dir_names: dict[str, str] = {}  # model_id → directory name (for display)

    deferred_categories: set[str] = set()

    model_dirs = find_model_dirs(bfcl_root)
    if not model_dirs:
        sys.exit(f"Error: no model output directories found under {bfcl_root}")

    print(f"Found {len(model_dirs)} model director{'y' if len(model_dirs) == 1 else 'ies'} under {bfcl_root}")

    for model_dir in model_dirs:
        print(f"\nProcessing: {model_dir.name}")

        # --- Result files ---
        for mid_dir in find_model_id_dir(model_dir, "result"):
            model_id = mid_dir.name
            model_dir_names[model_id] = model_dir.name
            for result_file in sorted(mid_dir.glob("*.json")):
                category = infer_category(result_file.name)
                if category is None:
                    continue
                if category in AGENTIC_CATEGORIES:
                    deferred_categories.add(category)
                    continue
                if category not in TOOL_CALLING_CATEGORIES:
                    print(f"  Warning: unknown category '{category}' in {result_file.name}, skipping", file=sys.stderr)
                    continue

                records = load_jsonl(result_file)
                for record in records:
                    task_id = record.get("id")
                    if task_id:
                        result_map[model_id][task_id] = record
                print(f"  Loaded {len(records)} result records from {result_file.name}")

        # --- Score files ---
        for mid_dir in find_model_id_dir(model_dir, "score"):
            model_id = mid_dir.name
            for score_file in sorted(mid_dir.glob("*.json")):
                category = infer_category(score_file.name)
                if category is None:
                    continue
                if category in AGENTIC_CATEGORIES:
                    continue
                if category not in TOOL_CALLING_CATEGORIES:
                    continue

                records = load_jsonl(score_file)
                # First line is an aggregate header {accuracy, correct_count, total_count} — skip it.
                failure_records = [r for r in records if "id" in r]
                for record in failure_records:
                    task_id = record.get("id")
                    if task_id:
                        score_map[model_id][task_id] = record
                print(f"  Loaded {len(failure_records)} failure records from {score_file.name}")

    if deferred_categories:
        print(f"Deferred categories (multi-turn, requires agentic task type): {sorted(deferred_categories)}")
        print("  Re-run with --task-type agentic to convert these (not yet implemented).")

    # --- Load dataset files for passing-task prompts ---
    dataset_records: dict[str, dict] = {}
    if dataset_dir:
        dataset_records = load_dataset_dir(dataset_dir, TOOL_CALLING_CATEGORIES)
        print(f"\nLoaded {len(dataset_records)} task definitions from dataset dir")
    else:
        print("\nNo --dataset-dir provided.")
        print("Output will contain only tasks that failed for at least one model (full prompt available from score files).")
        print("To include passing tasks, download dataset files from https://huggingface.co/datasets/gorilla-llm/BFCL-v3")
        print("and pass --dataset-dir.")

    # --- Determine which task IDs to emit ---
    # With dataset files: emit all tasks seen in result files.
    # Without dataset files: emit only tasks that failed for at least one model,
    # because those are the only tasks with a prompt (input + tools + ground truth)
    # available from the score files. Passing tasks have no prompt in score files
    # and would produce empty-shell records with no analytical value.
    all_failed_ids: set[str] = set()
    for model_score_map in score_map.values():
        all_failed_ids.update(model_score_map.keys())

    all_result_ids: set[str] = set()
    for model_records in result_map.values():
        all_result_ids.update(model_records.keys())

    if dataset_dir:
        # Full dataset available — emit every task in the dataset files,
        # not just those that appear in result files. This is the complete
        # picture: all tasks, all models, full pass/fail coverage.
        task_ids_to_emit = set(dataset_records.keys())
    else:
        # No dataset files — restrict to tasks that failed for at least one
        # model, since those are the only ones with a prompt (input + tools +
        # ground truth) available from the score files.
        task_ids_to_emit = all_failed_ids

    all_model_ids = sorted(result_map.keys())
    print(f"\nBuilding output for {len(task_ids_to_emit)} tasks across {len(all_model_ids)} model(s)...")

    # --- Build tasks and results ---
    # tasks: flat list of task definitions (no model data).
    # results: flat list of ModelResult entries, one per task × model pair.
    # This matches InspectorRAGet's schema where tasks and results are separate
    # top-level arrays joined by taskId/modelId.
    tasks_list: list[dict] = []
    results_list: list[dict] = []

    for task_id in task_ids_to_emit:
        # Resolve prompt from whichever score record has it (any failing model).
        prompt = None
        for model_id in all_model_ids:
            score_record = score_map.get(model_id, {}).get(task_id)
            if score_record and "prompt" in score_record:
                prompt = score_record["prompt"]
                break
        if prompt is None and task_id in dataset_records:
            prompt = dataset_records[task_id]

        task: dict = {
            "task_id": task_id,
            "task_type": "tool_calling",
        }

        if prompt:
            # question is [[{role, content}]] — take the innermost message list.
            question = prompt.get("question", [[]])
            if question and isinstance(question[0], list):
                task["input"] = question[0]
            elif question:
                task["input"] = question

            # Normalize tool definitions from BFCL dict format to JSON Schema.
            raw_functions = prompt.get("function", [])
            if raw_functions:
                task["tools"] = [normalize_tool_def(f) for f in raw_functions]

        # bfcl_category: prefer from a score record; fall back to task_id prefix.
        category = ""
        for model_id in all_model_ids:
            score_record = score_map.get(model_id, {}).get(task_id)
            if score_record and score_record.get("test_category"):
                category = score_record["test_category"]
                break
        if not category:
            category = task_id.rsplit("_", 1)[0] if "_" in task_id else ""
        if category:
            task["bfcl_category"] = category

        # Ground truth: prefer score record (failures carry possible_answer inline);
        # fall back to the answer file merged into the dataset record. The answer
        # files under possible_answer/ are the only source for passing tasks.
        possible_answer = None
        for model_id in all_model_ids:
            score_record = score_map.get(model_id, {}).get(task_id)
            if score_record and score_record.get("possible_answer"):
                possible_answer = score_record["possible_answer"]
                break
        if possible_answer is None and task_id in dataset_records:
            possible_answer = dataset_records[task_id].get("possible_answer")
        if possible_answer:
            task["targets"] = possible_answer_to_targets(possible_answer)

        tasks_list.append(task)

        # --- Build one ModelResult per model ---
        for model_id in all_model_ids:
            score_record = score_map.get(model_id, {}).get(task_id)
            result_record = result_map.get(model_id, {}).get(task_id)

            # A model must have at least one of score or result to produce a
            # ModelResult. If it has neither, skip — the run was incomplete.
            if score_record is None and result_record is None:
                continue

            is_failing = score_record is not None

            if is_failing:
                is_valid = score_record.get("valid", False)
                error_type = score_record.get("error_type")
                errors = score_record.get("error", [])
            else:
                # Model passed this task — no score record exists for it.
                is_valid = True
                error_type = None
                errors = []

            severity_value, severity_numeric, severity_display = derive_severity(is_valid, error_type)

            # Model output: decoded form from score record for failures.
            # For passing tasks the score file is absent, so BFCL provides no
            # decoded output. Use the task's canonical target calls as a proxy —
            # the model was correct, so its output matches the ground truth.
            # For failing tasks with no decoded output (e.g. inference errors),
            # fall back to the raw result string rather than the target proxy.
            model_result_decoded = score_record.get("model_result_decoded") if score_record else None
            tool_calls = decoded_to_tool_calls(model_result_decoded)

            # Build the output message. tool_calls takes priority; content is used
            # for text/error outputs (irrelevance tasks, inference failures).
            output_message: dict = {"role": "assistant"}
            if tool_calls is not None:
                output_message["tool_calls"] = tool_calls
            else:
                if not is_failing:
                    targets = task.get("targets", [])
                    if targets and targets[0].get("calls"):
                        output_message["tool_calls"] = targets[0]["calls"]
                if "tool_calls" not in output_message:
                    raw = (result_record or {}).get("result", "") or (score_record or {}).get("model_result_raw", "")
                    output_message["content"] = raw if isinstance(raw, str) else json.dumps(raw)

            # Raw output as a generation step on the message for UI visibility.
            raw_output = score_record.get("model_result_raw") if score_record else (result_record or {}).get("result", "")
            if raw_output:
                output_message["steps"] = [{
                    "type": "generation",
                    "id": str(uuid.uuid4()),
                    "content": raw_output if isinstance(raw_output, str) else json.dumps(raw_output),
                }]

            output = [output_message]

            # Latency from result file. Default to 600.0 (sentinel) when the
            # result file is absent — avoids missing metrics while making the
            # gap visible in aggregate views.
            latency = (result_record or {}).get("latency", 600.0)

            # Scores are nested as {metricName: {annotatorId: {value, ...}}}.
            # BFCL metrics are all algorithm-produced, annotator key is "bfcl".
            # All four metrics are always present on every ModelResult.
            # bfcl_error_type and bfcl_errors use "none" for passing models
            # (unambiguously signals no error, not a missing value).
            scores: dict = {
                "bfcl_correctness": {
                    "bfcl": {
                        "value": "correct" if is_valid else "incorrect",
                        "numeric_value": 1 if is_valid else 0,
                    }
                },
                "bfcl_error_severity": {
                    "bfcl": {
                        "value": severity_value,
                        "numeric_value": severity_numeric,
                        "display_value": severity_display,
                    }
                },
                "bfcl_error_type": {
                    "bfcl": {"value": error_type if error_type is not None else "none"}
                },
                "bfcl_errors": {
                    "bfcl": {
                        # error entries can be strings or dicts (detailed sub-error objects)
                        "value": "\n".join(
                            e if isinstance(e, str) else json.dumps(e) for e in errors
                        ) if errors else "none"
                    }
                },
                "bfcl_latency_total_s": {
                    "bfcl": {"value": latency}
                },
            }

            result_entry: dict = {
                "task_id": task_id,
                "model_id": model_id,
                "output": output,
                "scores": scores,
            }

            results_list.append(result_entry)

    # --- Build metrics block ---
    metrics = [
        {
            "name": "bfcl_correctness",
            "display_name": "Correctness",
            "description": "Whether the model's response was correct according to BFCL evaluation.",
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "descending",
            "values": [
                {"value": "correct", "numeric_value": 1, "display_value": "Correct"},
                {"value": "incorrect", "numeric_value": 0, "display_value": "Incorrect"},
            ],
        },
        {
            "name": "bfcl_error_severity",
            "display_name": "Error Severity",
            "description": (
                "Recoverability-anchored severity scale derived from BFCL error type. "
                "0 = correct, 0.25 = wrong arguments, 0.5 = wrong function, "
                "0.75 = irrelevance error, 1.0 = malformed output."
            ),
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "descending",
            "values": [
                {"value": "correct", "numeric_value": 0.0, "display_value": "Correct"},
                {"value": "wrong_arguments", "numeric_value": 0.25, "display_value": "Wrong Arguments"},
                {"value": "wrong_function", "numeric_value": 0.5, "display_value": "Wrong Function"},
                {"value": "unknown", "numeric_value": 0.5, "display_value": "Unknown"},
                {"value": "irrelevance_error", "numeric_value": 0.75, "display_value": "Irrelevance Error"},
                {"value": "malformed_output", "numeric_value": 1.0, "display_value": "Malformed Output"},
            ],
        },
        {
            "name": "bfcl_error_type",
            "display_name": "Error Type",
            "description": "Raw BFCL error type string (e.g. type_error:nested). Empty for correct tasks.",
            "author": "algorithm",
            "type": "text",
        },
        {
            "name": "bfcl_errors",
            "display_name": "Error Messages",
            "description": "BFCL error messages joined as a single string. Empty for correct tasks.",
            "author": "algorithm",
            "type": "text",
        },
        {
            "name": "bfcl_latency_total_s",
            "display_name": "Latency (s)",
            "description": "Total wall-clock inference time in seconds. Binned in 5s intervals up to 30s. Values above 30s render as raw numbers; 600.0 indicates missing data.",
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "mean",
            "order": "descending",
            "range": [0, 30, 5],
        },
    ]

    # Collect unique bfcl_category values for the filters block.
    bfcl_categories = sorted({
        task.get("bfcl_category", "")
        for task in tasks_list
        if task.get("bfcl_category")
    })

    # --- Build models block ---
    models = [
        {"model_id": mid, "name": model_dir_names.get(mid, mid), "owner": ""}
        for mid in sorted(result_map.keys())
    ]

    output_doc = {
        "schema_version": SCHEMA_VERSION,
        "name": output_name,
        "models": models,
        "metrics": metrics,
        "tasks": tasks_list,
        "results": results_list,
    }
    if bfcl_categories:
        output_doc["filters"] = ["bfcl_category"]

    return output_doc


# ---------------------------------------------------------------------------
# Agentic conversion (not yet implemented)
# ---------------------------------------------------------------------------

def convert_agentic(bfcl_root: Path, dataset_dir: Path | None, output_name: str) -> dict:
    print(
        "\nError: --task-type agentic is not yet implemented.\n"
        "\n"
        "BFCL multi-turn categories (multi_turn_base, multi_turn_miss_func,\n"
        "multi_turn_miss_param, multi_turn_long_context) use goal-directed agentic\n"
        "execution with stateful environment simulation. They require the 'agentic'\n"
        "task type in InspectorRAGet, which is still under design.\n"
        "\n"
        "To convert single-turn BFCL categories today, use:\n"
        "    python convert.py --task-type tool_calling ...\n",
        file=sys.stderr,
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert BFCL output directories to an InspectorRAGet JSON file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Convert single-turn categories from one model run:
  python convert.py \\
      --bfcl-root ./bfcl_output \\
      --dataset-dir ./bfcl_dataset \\
      --output my_results.json

  # Multiple models (each in their own subdirectory under bfcl_output):
  python convert.py --bfcl-root ./bfcl_output --output comparison.json

  # Without dataset files (passing tasks will have no input/tools):
  python convert.py --bfcl-root ./bfcl_output --output partial.json
""",
    )
    parser.add_argument(
        "--bfcl-root",
        required=True,
        type=Path,
        help="Root directory containing one subdirectory per model (each with result/ and score/ subdirs).",
    )
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=None,
        help=(
            "Directory containing BFCL dataset files (e.g. BFCL_v3_simple.json). "
            "Required for full fidelity — without it, passing tasks have no input or tools. "
            "Download from https://huggingface.co/datasets/gorilla-llm/BFCL-v3"
        ),
    )
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="Path for the output InspectorRAGet JSON file.",
    )
    parser.add_argument(
        "--name",
        default="BFCL Evaluation",
        help="Display name for this evaluation in InspectorRAGet (default: 'BFCL Evaluation').",
    )
    parser.add_argument(
        "--task-type",
        choices=["tool_calling", "agentic"],
        default="tool_calling",
        help=(
            "Target InspectorRAGet task type. "
            "'tool_calling' converts single-turn next-response-prediction categories. "
            "'agentic' converts multi-turn goal-directed categories (not yet implemented). "
            "Default: tool_calling."
        ),
    )

    args = parser.parse_args()

    if not args.bfcl_root.exists():
        sys.exit(f"Error: --bfcl-root path does not exist: {args.bfcl_root}")
    if args.dataset_dir and not args.dataset_dir.exists():
        sys.exit(f"Error: --dataset-dir path does not exist: {args.dataset_dir}")

    if args.task_type == "tool_calling":
        result = convert_tool_calling(args.bfcl_root, args.dataset_dir, args.name)
    else:
        result = convert_agentic(args.bfcl_root, args.dataset_dir, args.name)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    task_count = len(result.get("tasks", []))
    model_count = len(result.get("models", []))
    print(f"\nWrote {task_count} tasks across {model_count} model(s) to {args.output}")


if __name__ == "__main__":
    main()
