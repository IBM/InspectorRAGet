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
import ast
import json
import os
import re
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
#   0.25 — right function(s), wrong argument details (recoverable with a retry)
#   0.50 — wrong function, wrong count, or wrong final state across turns
#   0.75 — called a function when none was appropriate (irrelevance), or reached a
#           partially-correct state (multi-turn state mismatch after completing turns)
#   1.00 — output could not be decoded, model went silent, or run was force-terminated
#
# The same scale is used for both single-turn (tool_calling) and multi-turn (agentic)
# categories so error severity is comparable across task types.
SEVERITY_MAP = {
    # --- Single-turn: argument-level errors ---
    "type_error:simple": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "type_error:nested": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:string": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:others": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:list/tuple": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:dict_value": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:dict_key": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "value_error:list_dict_count": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "simple_function_checker:missing_optional": (
        "wrong_arguments",
        0.25,
        "Wrong Arguments",
    ),
    "simple_function_checker:missing_required": (
        "wrong_arguments",
        0.25,
        "Wrong Arguments",
    ),
    "simple_function_checker:unexpected_param": (
        "wrong_arguments",
        0.25,
        "Wrong Arguments",
    ),
    # Java/JavaScript type vocabulary errors — argument-level mismatch.
    "type_error:java": ("wrong_arguments", 0.25, "Wrong Arguments"),
    "type_error:js": ("wrong_arguments", 0.25, "Wrong Arguments"),
    # --- Single-turn: function-level errors ---
    "simple_function_checker:wrong_func_name": (
        "wrong_function",
        0.50,
        "Wrong Function",
    ),
    "simple_function_checker:wrong_count": ("wrong_function", 0.50, "Wrong Function"),
    "multiple_function_checker:wrong_count": ("wrong_function", 0.50, "Wrong Function"),
    "parallel_function_checker_no_order:wrong_count": (
        "wrong_function",
        0.50,
        "Wrong Function",
    ),
    "parallel_function_checker_no_order:cannot_find_match": (
        "wrong_function",
        0.50,
        "Wrong Function",
    ),
    # --- Single-turn: malformed output ---
    # AST decoder could not parse the model's output into any function call at all.
    "ast_decoder:decoder_failed": ("malformed_output", 1.0, "Malformed Output"),
    "ast_decoder:decoder_wrong_output_format": (
        "malformed_output",
        1.0,
        "Malformed Output",
    ),
    # Relevance checker decoder failure — output could not be decoded for irrelevance check.
    "relevance_error:decoder_failed": ("malformed_output", 1.0, "Malformed Output"),
    # --- Single-turn: irrelevance errors ---
    "irrelevance_error:decoder_success": (
        "irrelevance_error",
        0.75,
        "Irrelevance Error",
    ),
    # --- Multi-turn: argument/execution errors ---
    # Model called the right function but with wrong arguments; execution failed.
    "multi_turn:execution_response_mismatch": (
        "wrong_arguments",
        0.25,
        "Wrong Arguments",
    ),
    # --- Multi-turn: state/function errors ---
    # Model completed all turns but the environment ended in the wrong state.
    "multi_turn:instance_state_mismatch": ("wrong_function", 0.50, "Wrong Function"),
    # --- Multi-turn: unrecoverable failures ---
    # Model produced no output for a turn, ran out of turns, or output couldn't be decoded.
    "multi_turn:empty_turn_model_response": (
        "malformed_output",
        1.0,
        "Malformed Output",
    ),
    "multi_turn:force_terminated": ("malformed_output", 1.0, "Malformed Output"),
    "multi_turn:inference_error": ("malformed_output", 1.0, "Malformed Output"),
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
            result[key] = [
                normalize_tool_def(item) if isinstance(item, dict) else item
                for item in value
            ]
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

            calls.append(
                {"id": call_id, "name": func_name, "arguments": canonical_args}
            )

            # If any argument has more than one acceptable value, record the
            # additional combinations in alternatives keyed by this call's id.
            if isinstance(args, dict):
                extra_values = {
                    k: v for k, v in args.items() if isinstance(v, list) and len(v) > 1
                }
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
                        alt_calls.append(
                            {
                                "id": str(uuid.uuid4()),
                                "name": func_name,
                                "arguments": alt_args,
                            }
                        )
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
            calls.append(
                {
                    "id": str(uuid.uuid4()),
                    "name": func_name,
                    "arguments": args if isinstance(args, dict) else {},
                }
            )

    return calls if calls else None


# ---------------------------------------------------------------------------
# Token count helper
# ---------------------------------------------------------------------------


def token_sum(raw: int | float | list | None) -> float | None:
    """
    Flatten a token count field to a single total, or None if absent.

    Single-turn result files store token counts as plain scalars. Multi-turn
    result files store them as list[list[float]] — one inner list per turn, one
    value per retry step within that turn. We sum everything so the metric
    represents total tokens consumed, including retries.

    Returns None when the field is absent (e.g. inference_error runs where the
    runner aborted before any token counts were recorded). Callers should
    substitute a per-model average so the metric remains present on every result
    (a missing metric causes the task to be disqualified by the processor).
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    total = sum(
        v
        for inner in raw
        for v in (inner if isinstance(inner, list) else [inner])
        if isinstance(v, (int, float))
    )
    return total if total else None


def model_token_averages(
    result_map: dict[str, dict[str, dict]],
) -> dict[str, dict[str, float]]:
    """
    Compute per-model averages for input and output token counts across all
    tasks that have data. Used to fill in missing values so every result carries
    a token metric (the processor disqualifies results with missing metrics).

    Returns {model_id: {"input": avg, "output": avg}}.
    """
    averages: dict[str, dict[str, float]] = {}
    for model_id, records in result_map.items():
        input_vals: list[float] = []
        output_vals: list[float] = []
        for rec in records.values():
            iv = token_sum(rec.get("input_token_count"))
            ov = token_sum(rec.get("output_token_count"))
            if iv is not None:
                input_vals.append(iv)
            if ov is not None:
                output_vals.append(ov)
        averages[model_id] = {
            "input": sum(input_vals) / len(input_vals) if input_vals else 0.0,
            "output": sum(output_vals) / len(output_vals) if output_vals else 0.0,
        }
    return averages


# ---------------------------------------------------------------------------
# Message status helper (item 22: metadata.status stamping)
# ---------------------------------------------------------------------------


def message_status_and_definition(msg: dict) -> tuple[str, str] | tuple[None, None]:
    """
    Derive a (status, statusDefinition) pair for a single message dict.

    Returns (None, None) for roles that carry no status (user, system, developer).

    Rules:
    - tool messages: 'fail' when content is JSON with a top-level 'error' key,
      otherwise 'pass'.
    - assistant messages without a trace (single step, no intermediate reasoning):
        'pass'  — has tool_calls or content (clean single-step turn).
        None    — neither (malformed).
    - assistant messages with a trace (multiple intermediate steps before accepted):
        'fail'  — trace ends with invocation or observation — force-terminated, no
                  accepted step was reached.
        'warn'  — trace ends with tool_execution — intermediate steps were present
                  but the model eventually produced an accepted output.

    statusDefinition is a human-readable BFCL-specific explanation of why this
    particular message has the given status. It is stamped into metadata so the
    UI can show it as a definition tooltip on hover.
    """
    role = msg.get("role")

    if role == "tool":
        content = msg.get("content", "")
        if isinstance(content, str):
            try:
                parsed = json.loads(content)
                if isinstance(parsed, dict) and "error" in parsed:
                    return (
                        "fail",
                        "Tool execution returned an error response from the BFCL environment.",
                    )
            except (json.JSONDecodeError, ValueError):
                pass
        return "pass", "Tool executed successfully and returned a result."

    if role == "assistant":
        trace = msg.get("trace")
        has_tool_calls = bool(msg.get("tool_calls"))
        has_content = bool(msg.get("content"))

        if trace:
            # Count intermediate invocation steps for a richer definition.
            invocation_count = sum(
                1
                for e in trace
                if isinstance(e, dict) and e.get("type") == "invocation"
            )
            last_event = None
            for e in reversed(trace):
                if isinstance(e, dict) and e.get("type"):
                    last_event = e
                    break
            last_event_type = last_event.get("type") if last_event else None

            if last_event_type in ("invocation", "observation"):
                # Use the observation content to give a precise cause when available.
                if last_event_type == "observation":
                    obs_content = (last_event or {}).get("content", "")
                    if "forced to quit" in obs_content:
                        fail_def = (
                            "Turn did not complete. The BFCL runner exhausted the "
                            "step budget before an accepted output was reached."
                        )
                    elif "decode error" in obs_content:
                        fail_def = (
                            "Turn did not complete. The model repeatedly failed to "
                            "produce a parseable tool call and the runner gave up."
                        )
                    elif "empty response" in obs_content:
                        fail_def = (
                            "Turn did not complete. The model repeatedly returned "
                            "an empty response with no tool calls."
                        )
                    else:
                        fail_def = (
                            "Turn did not complete. The BFCL runner terminated this "
                            "turn before an accepted output was reached."
                        )
                else:
                    # Trace ends on an invocation with no following observation or
                    # tool_execution — turn was cut off without runner feedback.
                    fail_def = (
                        "Turn did not complete. The BFCL runner terminated this "
                        "turn before an accepted output was reached."
                    )
                return "fail", fail_def
            steps_noun = "step" if invocation_count == 1 else "steps"
            return (
                "warn",
                f"Model required {invocation_count} intermediate {steps_noun} before "
                "producing an accepted output for this turn. "
                "Open the Trace tab to inspect the intermediate reasoning.",
            )

        if has_tool_calls or has_content:
            return "pass", "Model produced accepted output in a single step."
        return None, None

    return None, None


# ---------------------------------------------------------------------------
# Error metadata helper (item 23: ModelResult.metadata.error)
# ---------------------------------------------------------------------------


def build_error_metadata(error_dict: dict) -> dict | None:
    """
    Extract structured diagnostic detail from a multi-turn BFCL error dict and
    return a metadata.error entry, or None when no useful detail is available.

    BFCL error types that carry a 'details' sub-dict:
    - instance_state_mismatch: details.differences (model vs ground-truth env
      state repr) and error.execution_result (per-turn tool response arrays).
    - execution_response_mismatch: details.missing_items (expected tool responses
      not produced), details['model_response (including all previous turns)'],
      details['ground_truth_response (only the current turn)'].
    - empty_turn_model_response: details.execution_result (per-turn arrays showing
      which turns had model output and which were empty).

    force_terminated and inference_error have no details — return None for those.
    """
    if not isinstance(error_dict, dict):
        return None

    error_type = error_dict.get("error_type", "")
    details = error_dict.get("details")

    if error_type == "multi_turn:instance_state_mismatch" and isinstance(details, dict):
        context: dict = {}
        if "differences" in details:
            context["differences"] = details["differences"]
        execution_result = error_dict.get("execution_result") or details.get(
            "execution_result"
        )
        if execution_result:
            context["execution_result"] = execution_result
        if context:
            return {"kind": "structured", "context": context}

    if error_type == "multi_turn:execution_response_mismatch" and isinstance(
        details, dict
    ):
        context = {}
        if "missing_items" in details:
            context["missing_items"] = details["missing_items"]
        # Key names in BFCL details include spaces — copy them as-is.
        model_resp = details.get("model_response (including all previous turns)")
        gt_resp = details.get("ground_truth_response (only the current turn)")
        if model_resp is not None:
            context["model_response"] = model_resp
        if gt_resp is not None:
            context["ground_truth_response"] = gt_resp
        if context:
            return {"kind": "structured", "context": context}

    if error_type == "multi_turn:empty_turn_model_response" and isinstance(
        details, dict
    ):
        execution_result = details.get("execution_result")
        if execution_result:
            return {
                "kind": "structured",
                "context": {"execution_result": execution_result},
            }

    return None


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
                    print(
                        f"  Warning: skipping malformed line in {path}: {e}",
                        file=sys.stderr,
                    )
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
            return stem[len(prefix) :]
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
        if entry.is_dir() and (
            (entry / "result").exists() or (entry / "score").exists()
        ):
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
        for pattern in (
            f"BFCL_v4_{category}.json",
            f"BFCL_v3_{category}.json",
            f"BFCL_v2_{category}.json",
        ):
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
            for pattern in (
                f"BFCL_v4_{category}.json",
                f"BFCL_v3_{category}.json",
                f"BFCL_v2_{category}.json",
            ):
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

    print(
        f"Found {len(model_dirs)} model director{'y' if len(model_dirs) == 1 else 'ies'} under {bfcl_root}"
    )

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
                    print(
                        f"  Warning: unknown category '{category}' in {result_file.name}, skipping",
                        file=sys.stderr,
                    )
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
                print(
                    f"  Loaded {len(failure_records)} failure records from {score_file.name}"
                )

    if deferred_categories:
        print(
            f"Deferred categories (multi-turn, agentic task type): {sorted(deferred_categories)}"
        )
        print("  Re-run with --task-type agentic to convert these.")

    # --- Load dataset files for passing-task prompts ---
    dataset_records: dict[str, dict] = {}
    if dataset_dir:
        dataset_records = load_dataset_dir(dataset_dir, TOOL_CALLING_CATEGORIES)
        print(f"\nLoaded {len(dataset_records)} task definitions from dataset dir")
    else:
        print("\nNo --dataset-dir provided.")
        print(
            "Output will contain only tasks that failed for at least one model (full prompt available from score files)."
        )
        print(
            "To include passing tasks, download dataset files from https://huggingface.co/datasets/gorilla-llm/BFCL-v3"
        )
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
    token_avgs = model_token_averages(result_map)
    print(
        f"\nBuilding output for {len(task_ids_to_emit)} tasks across {len(all_model_ids)} model(s)..."
    )

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

            severity_value, severity_numeric, severity_display = derive_severity(
                is_valid, error_type
            )

            # Model output: decoded form from score record for failures.
            # For passing tasks the score file is absent, so BFCL provides no
            # decoded output. Use the task's canonical target calls as a proxy —
            # the model was correct, so its output matches the ground truth.
            # For failing tasks with no decoded output (e.g. inference errors),
            # fall back to the raw result string rather than the target proxy.
            model_result_decoded = (
                score_record.get("model_result_decoded") if score_record else None
            )
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
                    raw = (result_record or {}).get("result", "") or (
                        score_record or {}
                    ).get("model_result_raw", "")
                    output_message["content"] = (
                        raw if isinstance(raw, str) else json.dumps(raw)
                    )

            # Stamp metadata.status and metadata.statusDefinition on the output
            # message so the UI can show a visual pass/fail/warn indicator with
            # a hover tooltip explaining the status.
            status, status_def = message_status_and_definition(output_message)
            if status:
                output_message["metadata"] = {
                    "status": status,
                    "statusDefinition": status_def,
                }

            output = [output_message]

            # Latency and token counts from result file. Default to 600.0
            # (sentinel) when the result file is absent — avoids missing metrics
            # while making the gap visible in aggregate views.
            rec = result_record or {}
            latency = rec.get("latency", 600.0)
            avg = token_avgs.get(model_id, {})
            input_tokens = token_sum(rec.get("input_token_count")) or avg.get(
                "input", 0.0
            )
            output_tokens = token_sum(rec.get("output_token_count")) or avg.get(
                "output", 0.0
            )

            # Scores are nested as {metricName: {annotatorId: {value, ...}}}.
            # BFCL metrics are all algorithm-produced, annotator key is "bfcl".
            # All metrics are always present on every ModelResult.
            # bfcl_errors use "none" for passing models
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
                "bfcl_errors": {
                    "bfcl": {
                        # error entries can be strings or dicts (detailed sub-error objects)
                        "value": "\n".join(
                            e if isinstance(e, str) else json.dumps(e) for e in errors
                        )
                        if errors
                        else "none"
                    }
                },
                "bfcl_latency_total_s": {"bfcl": {"value": latency}},
                "bfcl_input_tokens_total": {"bfcl": {"value": input_tokens}},
                "bfcl_output_tokens_total": {"bfcl": {"value": output_tokens}},
            }

            # InspectorRAGet labels are per-(task, model) nominal descriptors that
            # characterise output without scoring it. Unlike metrics, labels have no natural
            # ordering or aggregation semantics; InspectorRAGet surfaces them in the Model
            # Characteristics tab for distribution analysis across models.
            #
            # "Error Type" stores the BFCL error_type string rather than a metric because
            # it is a categorical classifier (e.g., "type_error:nested",
            # "wrong_func_name"), not a quantity. Treating it as a metric would imply
            # ordinal meaning that doesn't exist. As a label it appears in grouped bar
            # charts showing how error types are distributed per model, which is the
            # analysis researchers actually want.
            labels: dict = {
                "Error Type": error_type if error_type is not None else "N/A"
            }

            result_entry: dict = {
                "task_id": task_id,
                "model_id": model_id,
                "output": output,
                "scores": scores,
                "labels": labels,
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
            "order": "ascending",
            "values": [
                {"value": "correct", "numeric_value": 1, "display_value": "Correct"},
                {
                    "value": "incorrect",
                    "numeric_value": 0,
                    "display_value": "Incorrect",
                },
            ],
        },
        {
            "name": "bfcl_error_severity",
            "display_name": "Error Severity",
            "description": (
                "Recoverability-anchored severity scale derived from BFCL error type. "
                "Consistent across single-turn (tool_calling) and multi-turn (agentic) categories. "
                "0 = correct, 0.25 = wrong arguments or execution mismatch, "
                "0.5 = wrong function or state mismatch, "
                "0.75 = irrelevance error, 1.0 = malformed or unrecoverable output."
            ),
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "descending",
            "values": [
                {"value": "correct", "numeric_value": 0.0, "display_value": "Correct"},
                {
                    "value": "wrong_arguments",
                    "numeric_value": 0.25,
                    "display_value": "Wrong Arguments",
                },
                {
                    "value": "wrong_function",
                    "numeric_value": 0.5,
                    "display_value": "Wrong Function",
                },
                {"value": "unknown", "numeric_value": 0.5, "display_value": "Unknown"},
                {
                    "value": "irrelevance_error",
                    "numeric_value": 0.75,
                    "display_value": "Irrelevance Error",
                },
                {
                    "value": "malformed_output",
                    "numeric_value": 1.0,
                    "display_value": "Malformed Output",
                },
            ],
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
            "description": "Total wall-clock inference time in seconds. Binned in 5s intervals up to 25s. Values above 25s render as raw numbers; 600.0 indicates missing data.",
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "mean",
            "order": "descending",
            "range": [0, 25, 5],
        },
        {
            "name": "bfcl_input_tokens_total",
            "display_name": "Input Tokens",
            "description": (
                "Total input token count for this task. "
                "Not directly comparable across models with different tokenizers, "
                "but useful as a cost proxy when combined with per-model pricing."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "mean",
            "order": "descending",
            "range": [0, 2000, 250],
        },
        {
            "name": "bfcl_output_tokens_total",
            "display_name": "Output Tokens",
            "description": (
                "Total output token count for this task. "
                "Not directly comparable across models with different tokenizers, "
                "but useful as a cost proxy when combined with per-model pricing."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "mean",
            "order": "descending",
            "range": [0, 400, 50],
        },
    ]

    # Collect unique bfcl_category values for the filters block.
    bfcl_categories = sorted(
        {
            task.get("bfcl_category", "")
            for task in tasks_list
            if task.get("bfcl_category")
        }
    )

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
# Agentic conversion helpers
# ---------------------------------------------------------------------------


def _to_snake(name: str) -> str:
    """Convert a CamelCase or PascalCase class name to snake_case.

    Examples: GorillaFileSystem → gorilla_file_system, TravelAPI → travel_api
    """
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    s = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s)
    return s.lower()


def load_func_doc_dir(dataset_dir: Path) -> dict[str, list[dict]]:
    """
    Load tool definitions from multi_turn_func_doc/ within dataset_dir.
    Returns a map of snake_case class_name → list of tool dicts (normalised).

    BFCL dataset files store class names in CamelCase (e.g. GorillaFileSystem,
    TravelAPI), while the func_doc files on disk use snake_case filenames.
    Some names diverge between dataset records and file stems, so aliases are
    added to cover both the file-stem key and any alternate snake_case name.
    """
    # Aliases from alternate snake_case name (derived from involved_classes) → file stem.
    # TwitterAPI → twitter_api but file is message_api.json (same tool set, renamed in v3).
    # TravelAPI → travel_api but file is travel_booking.json.
    # VehicleControlAPI → vehicle_control_api but file is vehicle_control.json.
    _ALIASES: dict[str, str] = {
        "twitter_api": "message_api",
        "travel_api": "travel_booking",
        "vehicle_control_api": "vehicle_control",
    }

    func_doc_dir = dataset_dir / "multi_turn_func_doc"
    if not func_doc_dir.exists():
        return {}
    class_tools: dict[str, list[dict]] = {}
    for path in sorted(func_doc_dir.glob("*.json")):
        class_name = path.stem
        tools = []
        for record in load_jsonl(path):
            if isinstance(record, dict) and "name" in record:
                tools.append(normalize_tool_def(record))
        if tools:
            class_tools[class_name] = tools

    for alt_key, canonical in _ALIASES.items():
        if canonical in class_tools and alt_key not in class_tools:
            class_tools[alt_key] = class_tools[canonical]

    return class_tools


def load_agentic_dataset_dir(
    dataset_dir: Path, categories: set[str]
) -> dict[str, dict]:
    """
    Load multi-turn BFCL dataset files (e.g. BFCL_v3_multi_turn_base.json).
    Returns task_id → record. Records include question, initial_config, path, involved_classes.

    Ground truth answers (per-turn expected call sequences) are merged from
    possible_answer/ subdirectory under key "ground_truth_turns".
    """
    dataset_map: dict[str, dict] = {}
    for category in categories:
        for pattern in (f"BFCL_v4_{category}.json", f"BFCL_v3_{category}.json"):
            path = dataset_dir / pattern
            if not path.exists():
                continue
            for record in load_jsonl(path):
                task_id = record.get("id")
                if task_id:
                    dataset_map[task_id] = record
            break

    answer_dir = dataset_dir / "possible_answer"
    if answer_dir.exists():
        for category in categories:
            for pattern in (f"BFCL_v4_{category}.json", f"BFCL_v3_{category}.json"):
                path = answer_dir / pattern
                if not path.exists():
                    continue
                for record in load_jsonl(path):
                    task_id = record.get("id")
                    ground_truth = record.get("ground_truth")
                    if task_id and ground_truth is not None and task_id in dataset_map:
                        # ground_truth is list[list[str]] — one list per turn, each
                        # entry is a canonical function call string like "create_file(...)"
                        dataset_map[task_id]["ground_truth_turns"] = ground_truth
                break

    return dataset_map


def _build_observation(sr: dict) -> str | None:
    """
    Build an observation text string from a step result dict, or return None
    if this step produced no runner feedback worth surfacing.

    Three cases from the BFCL runner inner loop:

    decode_error — The model's output could not be parsed as a function call.
        convert_to_function_call() raised an AttributeError (model returned
        plain text instead of a tool call). handler_log.error is set to the
        exception string. The model's raw text is in asst_content.
        Observation text: "Runner: decode error — <error>. Model output: <raw>"

    empty_response — The model output decoded to an empty call list. The runner
        treats this the same as a no-tool-call response and logs
        "Empty response from the model. Proceed to next turn." in handler_log.content.
        The model's raw text (or empty string) is in asst_content.
        Observation text: "Runner: empty response. Model output: <raw>"

    force_quit — The runner exhausted the 20-step budget (step limit exceeded
        within a turn). It appends "Model has been forced to quit after N steps."
        to the last step's handler_log after terminating the inner loop.
        Observation text: "Runner: model forced to quit (step budget exhausted)."

    Only the first matching case is used; a step may have at most one of these.
    """
    if sr.get("decode_error"):
        err = sr["decode_error"]
        raw = sr.get("asst_content", "").strip()
        if raw:
            return f"Runner: decode error — {err}. Model output: {raw}"
        return f"Runner: decode error — {err}."

    if sr.get("empty_response"):
        raw = sr.get("asst_content", "").strip()
        if raw:
            return f"Runner: empty response. Model output: {raw}"
        return "Runner: empty response (model produced no tool calls)."

    if sr.get("force_quit"):
        return "Runner: model forced to quit (step budget exhausted)."

    return None


def inference_log_to_messages(inference_log: list) -> list[dict]:
    """
    Convert a BFCL inference_log into a flat Message[] execution thread.

    BFCL inference_log is a list that alternates between:
      - lists of state_info dicts  (class instance snapshots — dropped)
      - turn dicts with keys:
          "begin_of_turn_query": list[Message]  (the user instruction for this turn)
          "step_0", "step_1", ...               (retry steps within the turn)

    Each step is a list of entries with these roles:
      - "inference_input": raw API request payload  — dropped
      - "assistant": model output string             — kept (last step only per turn)
      - "handler_log": decoder status               — used to find decoded calls
      - "tool": environment execution result        — kept

    We emit one user message per turn (from begin_of_turn_query) and the final
    assistant + tool sequence from that turn (last step where decode succeeded,
    or last step overall if all steps failed). Retry steps are collapsed: the
    final assistant message carries a "retries" list for earlier attempts.
    """
    messages: list[dict] = []

    for chunk in inference_log:
        # Skip state_info lists
        if isinstance(chunk, list):
            continue
        if not isinstance(chunk, dict):
            continue

        # User message: last user-role entry in begin_of_turn_query
        btq = chunk.get("begin_of_turn_query", [])
        user_msg = None
        if isinstance(btq, list):
            for m in reversed(btq):
                if isinstance(m, dict) and m.get("role") == "user":
                    user_msg = {"role": "user", "content": str(m.get("content", ""))}
                    break

        if user_msg:
            messages.append(user_msg)

        # Collect all step keys in order
        step_keys = sorted(
            [k for k in chunk if k.startswith("step_")],
            key=lambda k: int(k.split("_", 1)[1]),
        )

        if not step_keys:
            continue

        # Process steps: collect assistant output, tool calls, tool responses,
        # and any runner feedback for each step.
        step_results: list[dict] = []
        for step_key in step_keys:
            step_entries = chunk.get(step_key, [])
            if not isinstance(step_entries, list):
                continue

            asst_content: str = ""
            tool_calls: list[dict] | None = None
            tool_msgs: list[dict] = []
            decode_error: str | None = None
            empty_response: bool = False
            force_quit: bool = False

            for entry in step_entries:
                if not isinstance(entry, dict):
                    continue
                role = entry.get("role")

                if role == "assistant":
                    raw = entry.get("content", "")
                    asst_content = str(raw)
                    # Try to parse tool calls from the raw string
                    tool_calls = _parse_tool_calls_from_raw([raw])

                elif role == "handler_log":
                    # handler_log carries model_response_decoded when decode succeeded
                    decoded = entry.get("model_response_decoded")
                    if decoded:
                        tool_calls = _parse_tool_calls_from_raw(decoded) or tool_calls
                    err = entry.get("error")
                    if err:
                        decode_error = str(err)
                    content_str = str(entry.get("content", ""))
                    if "empty response" in content_str.lower():
                        empty_response = True
                    if "forced to quit" in content_str.lower():
                        force_quit = True

                elif role == "tool":
                    content = entry.get("content", "")
                    tool_msgs.append(
                        {
                            "role": "tool",
                            "tool_call_id": entry.get("tool_call_id", ""),
                            "content": content
                            if isinstance(content, str)
                            else json.dumps(content),
                        }
                    )

            step_results.append(
                {
                    "asst_content": asst_content,
                    "tool_calls": tool_calls,
                    "tool_msgs": tool_msgs,
                    "decode_error": decode_error,
                    "empty_response": empty_response,
                    "force_quit": force_quit,
                }
            )

        if not step_results:
            continue

        # Find the accepted step: last step where the environment actually executed
        # tool calls (has tool_msgs). A step with only tool_calls but no tool_msgs
        # is a decode-fail step — the runner rejected the output and did not execute
        # anything. Fall back to the last step if no step produced tool_msgs.
        accepted_idx = len(step_results) - 1
        for i in range(len(step_results) - 1, -1, -1):
            if step_results[i]["tool_msgs"]:
                accepted_idx = i
                break

        # Build the trace from steps 0..accepted_idx-1 only.
        # The accepted step's invocation and tool responses are already in the
        # top-level assistant message and subsequent tool messages in output —
        # repeating them in the trace would show the same content twice.
        # Intermediate steps (0..accepted_idx-1) are trace-only: they represent
        # genuine agentic reasoning (model reacting to tool feedback) or failed
        # decode/empty-response attempts.
        # If accepted_idx == 0 with no observations, the trace is empty and omitted.
        trace_events: list[dict] = []
        for step_idx, sr in enumerate(step_results[:accepted_idx]):
            invocation_output: dict = {"role": "assistant"}
            if sr["tool_calls"]:
                invocation_output["tool_calls"] = sr["tool_calls"]
            else:
                invocation_output["content"] = sr["asst_content"]
            # Label matches the step_N key in the BFCL inference log for cross-referencing.
            trace_events.append(
                {
                    "type": "invocation",
                    "label": f"step_{step_idx}",
                    "output": invocation_output,
                }
            )

            # Tool executions follow each intermediate invocation that produced tool calls.
            for tool_msg in sr["tool_msgs"]:
                trace_events.append({"type": "tool_execution", "result": tool_msg})

            # Observation: runner feedback after this step, before the next invocation.
            # Three cases from the BFCL runner:
            #   decode_error   — runner could not parse the model output into a tool call
            #                    (handler_log.error set); model's raw text is in asst_content
            #   empty_response — model output decoded to an empty call list; runner
            #                    treats this the same as a text/no-tool-call response
            #   (force_quit is only set on the last step — handled below)
            obs = _build_observation(sr)
            if obs:
                trace_events.append({"type": "observation", "content": obs})

        # Observation on the accepted step: force_quit is appended by the runner to
        # the last step after it terminates the inner loop. Surface it as a trailing
        # observation so researchers can see the termination reason.
        # It goes at the end of trace_events, after any intermediate step events,
        # because it describes what happened to the accepted step itself.
        accepted_sr = step_results[accepted_idx]
        accepted_obs = _build_observation(accepted_sr)
        if accepted_obs:
            trace_events.append({"type": "observation", "content": accepted_obs})

        final = step_results[accepted_idx]
        asst_msg: dict = {"role": "assistant"}
        if final["tool_calls"]:
            asst_msg["tool_calls"] = final["tool_calls"]
        else:
            asst_msg["content"] = final["asst_content"]

        if trace_events:
            asst_msg["trace"] = trace_events

        messages.append(asst_msg)
        messages.extend(final["tool_msgs"])

    return messages


def _parse_tool_calls_from_raw(raw_outputs: list) -> list[dict] | None:
    """
    Attempt to parse BFCL function call syntax from a list of raw output strings.

    BFCL result files store decoded calls in a separate field (model_result_decoded),
    but the inference_log stores raw assistant output strings. We do a best-effort
    parse here: if each non-empty output looks like "func_name(...)", we build a
    ToolCallRecord; otherwise return None so the caller falls back to plain text.

    This is intentionally conservative — an unparseable response falls back to
    text content rather than an empty or broken tool_calls list.
    """
    calls = []
    for raw in raw_outputs:
        raw = str(raw).strip()
        if not raw:
            continue
        # Match: function_name(key=value, ...) possibly wrapped in brackets
        raw_clean = raw.strip("[]").strip()
        # Try splitting on top-level commas to handle parallel calls
        for call_str in _split_parallel_calls(raw_clean):
            call_str = call_str.strip()
            m = re.match(
                r"^([A-Za-z_][A-Za-z0-9_.]*)\s*\((.*)\)\s*$", call_str, re.DOTALL
            )
            if not m:
                return None  # Not a parseable call — bail out entirely
            func_name = m.group(1)
            args_str = m.group(2).strip()
            args = _parse_kwargs(args_str)
            if args is None:
                return None
            calls.append(
                {"id": str(uuid.uuid4()), "name": func_name, "arguments": args}
            )

    return calls if calls else None


def _split_parallel_calls(s: str) -> list[str]:
    """
    Split a string of parallel function calls at top-level commas that appear
    between top-level closing and opening parentheses.
    e.g. "f(a=1), g(b=2)" → ["f(a=1)", "g(b=2)"]
    """
    parts = []
    depth = 0
    current: list[str] = []
    for ch in s:
        if ch == "(":
            depth += 1
            current.append(ch)
        elif ch == ")":
            depth -= 1
            current.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    if current:
        parts.append("".join(current).strip())
    return [p for p in parts if p]


def _parse_kwargs(args_str: str) -> dict | None:
    """
    Parse a kwargs string like 'key1="val", key2=42' into a dict.
    Uses ast.literal_eval for individual values — conservative and safe.
    Returns None if the string cannot be reliably parsed.
    """
    if not args_str.strip():
        return {}

    result = {}
    # Match key=value pairs where value can be a quoted string, number, bool,
    # list, dict, or None. We use a simple scan to handle nested structures.
    remaining = args_str.strip()
    while remaining:
        # Match key=
        key_match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*", remaining)
        if not key_match:
            return None
        key = key_match.group(1)
        remaining = remaining[key_match.end() :]

        # Find the end of the value by scanning brackets/quotes
        value_end = _find_value_end(remaining)
        if value_end < 0:
            return None
        value_str = remaining[:value_end].strip()
        remaining = remaining[value_end:].lstrip(", ")

        try:
            result[key] = ast.literal_eval(value_str)
        except (ValueError, SyntaxError):
            result[key] = value_str  # store as string if unparseable

    return result


def _find_value_end(s: str) -> int:
    """
    Given a string starting at the value of a kwarg, return the index of the
    character after the value ends (either at a top-level comma, or end of string).
    Handles nested brackets and quoted strings.
    """
    depth = 0
    in_str: str | None = None
    i = 0
    while i < len(s):
        ch = s[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
        elif ch in ('"', "'"):
            in_str = ch
        elif ch in ("(", "[", "{"):
            depth += 1
        elif ch in (")", "]", "}"):
            depth -= 1
        elif ch == "," and depth == 0:
            return i
        i += 1
    return i  # end of string


def ground_truth_turns_to_target(
    path: list, ground_truth_turns: list | None
) -> list[dict]:
    """
    Build a TaskTarget[] for an agentic task.

    If ground_truth_turns is available (per-turn expected call sequences), we
    produce a state target whose value is a structured summary of the expected
    execution: {turn_N: [call_strings]}. This is readable and searchable without
    requiring the virtual environment to produce a real final state snapshot.

    If only path is available, we produce a text target describing the canonical
    sequence of method names.
    """
    if ground_truth_turns:
        # ground_truth_turns is list[list[str]] — one list per turn
        state_value: dict = {}
        for turn_idx, turn_calls in enumerate(ground_truth_turns):
            if turn_calls:
                state_value[f"turn_{turn_idx + 1}"] = turn_calls
        if state_value:
            return [{"type": "state", "value": state_value}]

    if path:
        return [{"type": "text", "value": " → ".join(path)}]

    return []


# ---------------------------------------------------------------------------
# Core conversion: agentic task type
# ---------------------------------------------------------------------------


def convert_agentic(
    bfcl_root: Path, dataset_dir: Path | None, output_name: str
) -> dict:
    """
    Walk bfcl_root, collect all multi-turn BFCL categories, and produce an
    InspectorRAGet JSON document with task_type "agentic".

    Multi-turn tasks use goal-directed agentic execution: the model receives
    a goal and an initial environment state, then drives tool calls across
    multiple turns until the goal is achieved or abandoned. The execution
    trace (all turns, all tool calls, all tool responses) is stored as
    output: Message[].

    Result files contain an inference_log field with the full execution trace.
    Score files contain pass/fail and error details (failures only).
    Dataset files contain the initial environment state and canonical path.
    """
    result_map: dict[str, dict[str, dict]] = defaultdict(dict)
    score_map: dict[str, dict[str, dict]] = defaultdict(dict)
    model_dir_names: dict[str, str] = {}

    model_dirs = find_model_dirs(bfcl_root)
    if not model_dirs:
        sys.exit(f"Error: no model output directories found under {bfcl_root}")

    print(
        f"Found {len(model_dirs)} model director{'y' if len(model_dirs) == 1 else 'ies'} under {bfcl_root}"
    )

    for model_dir in model_dirs:
        print(f"\nProcessing: {model_dir.name}")

        for mid_dir in find_model_id_dir(model_dir, "result"):
            model_id = mid_dir.name
            model_dir_names[model_id] = model_dir.name
            for result_file in sorted(mid_dir.glob("*.json")):
                category = infer_category(result_file.name)
                if category is None:
                    continue
                if category not in AGENTIC_CATEGORIES:
                    continue
                records = load_jsonl(result_file)
                for record in records:
                    task_id = record.get("id")
                    if task_id:
                        result_map[model_id][task_id] = record
                print(f"  Loaded {len(records)} result records from {result_file.name}")

        for mid_dir in find_model_id_dir(model_dir, "score"):
            model_id = mid_dir.name
            for score_file in sorted(mid_dir.glob("*.json")):
                category = infer_category(score_file.name)
                if category is None or category not in AGENTIC_CATEGORIES:
                    continue
                records = load_jsonl(score_file)
                failure_records = [r for r in records if "id" in r]
                for record in failure_records:
                    task_id = record.get("id")
                    if task_id:
                        score_map[model_id][task_id] = record
                print(
                    f"  Loaded {len(failure_records)} failure records from {score_file.name}"
                )

    if not result_map:
        print(
            "\nNo multi-turn result files found. Make sure your BFCL run includes "
            "multi-turn categories and that results are under result/<model-id>/ "
            "with filenames like BFCL_v3_multi_turn_base_result.json.",
            file=sys.stderr,
        )

    # Load dataset files (initial_config, path, involved_classes) and func docs
    dataset_records: dict[str, dict] = {}
    class_tools: dict[str, list[dict]] = {}
    if dataset_dir:
        dataset_records = load_agentic_dataset_dir(dataset_dir, AGENTIC_CATEGORIES)
        class_tools = load_func_doc_dir(dataset_dir)
        print(f"\nLoaded {len(dataset_records)} task definitions from dataset dir")
        print(
            f"Loaded {len(class_tools)} toolkit class definitions from multi_turn_func_doc/"
        )
    else:
        print("\nNo --dataset-dir provided. Tasks will have no initial state or tools.")

    all_model_ids = sorted(result_map.keys())
    all_result_ids: set[str] = set()
    for model_records in result_map.values():
        all_result_ids.update(model_records.keys())

    if dataset_dir:
        task_ids_to_emit = set(dataset_records.keys()) & all_result_ids
    else:
        task_ids_to_emit = all_result_ids

    token_avgs = model_token_averages(result_map)
    print(
        f"\nBuilding output for {len(task_ids_to_emit)} tasks across {len(all_model_ids)} model(s)..."
    )

    tasks_list: list[dict] = []
    results_list: list[dict] = []

    for task_id in sorted(task_ids_to_emit):
        dataset_record = dataset_records.get(task_id, {})

        # Goal: first user message from question[0]
        question = dataset_record.get("question", [])
        goal_message: dict | None = None
        if question and isinstance(question[0], list) and question[0]:
            goal_message = question[0][0]

        # Initial state: initial_config from dataset record
        initial_config = dataset_record.get("initial_config")

        # Tools: gathered from involved_classes.
        # Dataset records use CamelCase class names (e.g. GorillaFileSystem),
        # while func_doc files are keyed by snake_case stem — normalise before lookup.
        involved_classes = dataset_record.get("involved_classes", [])
        task_tools: list[dict] = []
        for class_name in involved_classes:
            task_tools.extend(class_tools.get(_to_snake(class_name), []))

        # Category
        category = task_id.rsplit("_", 2)[0] if "_" in task_id else task_id
        for cat in AGENTIC_CATEGORIES:
            if task_id.startswith(cat):
                category = cat
                break

        # Targets
        path = dataset_record.get("path", [])
        ground_truth_turns = dataset_record.get("ground_truth_turns")
        targets = ground_truth_turns_to_target(path, ground_truth_turns)

        task: dict = {
            "task_id": task_id,
            "task_type": "agentic",
        }
        if goal_message:
            task["input"] = [goal_message]
        if initial_config:
            # Store as a single context entry so the agentic TaskView renders it
            # under "Initial State" using the contexts field.
            task["contexts"] = [
                {"text": json.dumps(initial_config, ensure_ascii=False)}
            ]
        if task_tools:
            task["tools"] = task_tools
        if targets:
            task["targets"] = targets
        if category:
            task["bfcl_category"] = category

        tasks_list.append(task)

        # One ModelResult per model
        for model_id in all_model_ids:
            result_record = result_map.get(model_id, {}).get(task_id)
            score_record = score_map.get(model_id, {}).get(task_id)

            if result_record is None and score_record is None:
                continue

            is_failing = score_record is not None
            is_valid = not is_failing or score_record.get("valid", False)

            # Multi-turn score records nest error_type inside the "error" dict,
            # unlike single-turn which has a top-level "error_type" key.
            error_dict = score_record.get("error", {}) if score_record else {}
            if isinstance(error_dict, dict):
                error_type = error_dict.get("error_type")
                raw_msg = error_dict.get("error_message", "")
                # BFCL sometimes stores error_message as a list of strings
                error_message = (
                    "\n".join(raw_msg) if isinstance(raw_msg, list) else raw_msg
                )
            else:
                # Defensive: some score records may use the single-turn flat format
                error_type = score_record.get("error_type") if score_record else None
                error_message = (
                    "; ".join(str(e) for e in error_dict)
                    if isinstance(error_dict, list)
                    else str(error_dict)
                )

            # For per-task targets: use possible_answer from the score record when
            # available (failing tasks only). This is the per-turn ground truth as
            # list[list[str]]. Prefer it over the dataset's path-only ground truth.
            score_possible_answer = (
                score_record.get("possible_answer") if score_record else None
            )
            if score_possible_answer and not task.get("targets"):
                task["targets"] = ground_truth_turns_to_target(
                    path, score_possible_answer
                )

            # Prefer score record's inference_log for failing tasks — it is the same
            # log that was used for evaluation and is always present for failures.
            # Fall back to result record for passing tasks.
            log_source = (
                score_record
                if (score_record and score_record.get("inference_log"))
                else result_record
            )
            inference_log = (log_source or {}).get("inference_log", [])
            output_messages = inference_log_to_messages(inference_log)

            # Fallback: if no thread could be reconstructed, build a minimal one
            # from the goal + error so the instance view is not empty.
            if not output_messages and goal_message:
                output_messages = [
                    {"role": "user", "content": goal_message.get("content", "")}
                ]
                if is_failing and error_message:
                    output_messages.append(
                        {
                            "role": "assistant",
                            "content": f"[Run failed: {error_type or 'unknown'}]\n{error_message}",
                        }
                    )

            severity_value, severity_numeric, severity_display = derive_severity(
                is_valid, error_type
            )

            rec = result_record or {}
            latency = token_sum(rec.get("latency")) or 600.0
            avg = token_avgs.get(model_id, {})
            input_tokens = token_sum(rec.get("input_token_count")) or avg.get(
                "input", 0.0
            )
            output_tokens = token_sum(rec.get("output_token_count")) or avg.get(
                "output", 0.0
            )

            # Stamp metadata.status on each assistant and tool message so the UI
            # can show a visual pass/fail/warn indicator per message.
            # For force_terminated runs, the last assistant message gets 'fail' —
            # its turn exhausted the step budget. Earlier assistant messages completed
            # their turns and are stamped normally (pass/warn).
            is_force_terminated = error_type == "multi_turn:force_terminated"
            last_asst_idx = max(
                (
                    i
                    for i, m in enumerate(output_messages)
                    if m.get("role") == "assistant"
                ),
                default=None,
            )
            for i, msg in enumerate(output_messages):
                if is_force_terminated and i == last_asst_idx:
                    msg["metadata"] = {
                        "status": "fail",
                        "statusDefinition": (
                            "Turn did not complete. The BFCL runner force-terminated the "
                            "agent before it could finish (step budget exhausted)."
                        ),
                    }
                else:
                    status, status_def = message_status_and_definition(msg)
                    if status:
                        msg["metadata"] = {
                            "status": status,
                            "statusDefinition": status_def,
                        }

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
                "bfcl_errors": {
                    "bfcl": {"value": error_message if error_message else "none"}
                },
                "bfcl_latency_total_s": {"bfcl": {"value": latency}},
                "bfcl_input_tokens_total": {"bfcl": {"value": input_tokens}},
                "bfcl_output_tokens_total": {"bfcl": {"value": output_tokens}},
            }

            # InspectorRAGet labels are per-(task, model) nominal descriptors that
            # characterise output without scoring it. Unlike metrics, labels have no natural
            # ordering or aggregation semantics; InspectorRAGet surfaces them in the Model
            # Characteristics tab for distribution analysis across models.
            #
            # "Error Type" stores the BFCL error_type string rather than a metric because
            # it is a categorical classifier (e.g., "multi_turn:instance_state_mismatch",
            # "multi_turn:force_terminated"), not a quantity. Treating it as a metric would
            # imply ordinal meaning that doesn't exist. As a label it appears in grouped bar
            # charts showing how error types are distributed per model, which is the
            # analysis researchers actually want. The "multi_turn:" prefix is stripped to
            # keep label values concise; the agentic context is already implied by the tab.
            labels: dict = {
                "Error Type": error_type.removeprefix("multi_turn:")
                if error_type is not None
                else "N/A"
            }

            result_entry: dict = {
                "task_id": task_id,
                "model_id": model_id,
                "output": output_messages,
                "scores": scores,
                "labels": labels,
            }

            # Structured error diagnostics from BFCL score record details.
            # Only present for error types that carry a 'details' sub-dict.
            if score_record:
                error_meta = build_error_metadata(error_dict)
                if error_meta:
                    result_entry["metadata"] = {"error": error_meta}

            results_list.append(result_entry)

    # Metrics: same set as tool_calling (correctness, severity, errors, latency)
    # plus bfcl_turn_count for multi-turn depth analysis.
    metrics = [
        {
            "name": "bfcl_correctness",
            "display_name": "Correctness",
            "description": "Whether the agent completed the goal according to BFCL evaluation.",
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "ascending",
            "values": [
                {"value": "correct", "numeric_value": 1, "display_value": "Correct"},
                {
                    "value": "incorrect",
                    "numeric_value": 0,
                    "display_value": "Incorrect",
                },
            ],
        },
        {
            "name": "bfcl_error_severity",
            "display_name": "Error Severity",
            "description": (
                "Recoverability-anchored severity scale derived from BFCL error type. "
                "Consistent across single-turn (tool_calling) and multi-turn (agentic) categories. "
                "0 = correct, 0.25 = wrong arguments or execution mismatch, "
                "0.5 = wrong function or state mismatch, "
                "0.75 = irrelevance error, 1.0 = malformed or unrecoverable output."
            ),
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "descending",
            "values": [
                {"value": "correct", "numeric_value": 0.0, "display_value": "Correct"},
                {
                    "value": "wrong_arguments",
                    "numeric_value": 0.25,
                    "display_value": "Wrong Arguments",
                },
                {
                    "value": "wrong_function",
                    "numeric_value": 0.5,
                    "display_value": "Wrong Function",
                },
                {"value": "unknown", "numeric_value": 0.5, "display_value": "Unknown"},
                {
                    "value": "irrelevance_error",
                    "numeric_value": 0.75,
                    "display_value": "Irrelevance Error",
                },
                {
                    "value": "malformed_output",
                    "numeric_value": 1.0,
                    "display_value": "Malformed Output",
                },
            ],
        },
        {
            "name": "bfcl_errors",
            "display_name": "Error Messages",
            "description": "BFCL error messages joined as a single string. 'none' for correct tasks.",
            "author": "algorithm",
            "type": "text",
        },
        {
            "name": "bfcl_latency_total_s",
            "display_name": "Latency (s)",
            "description": "Total wall-clock inference time in seconds across all turns, including retry steps. Binned in 100s intervals up to 1000s. Values above 1000s render as raw numbers; 600.0 indicates missing data.",
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "mean",
            "order": "descending",
            "range": [0, 1000, 100],
        },
        {
            "name": "bfcl_input_tokens_total",
            "display_name": "Input Tokens",
            "description": (
                "Total input token count across all turns and retry steps. "
                "Not directly comparable across models with different tokenizers, "
                "but useful as a cost proxy when combined with per-model pricing. "
                "Runs where token counts were not recorded use the per-model average."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "mean",
            "order": "descending",
            "range": [0, 200000, 25000],
        },
        {
            "name": "bfcl_output_tokens_total",
            "display_name": "Output Tokens",
            "description": (
                "Total output token count across all turns and retry steps. "
                "Not directly comparable across models with different tokenizers, "
                "but useful as a cost proxy when combined with per-model pricing. "
                "Runs where token counts were not recorded use the per-model average."
            ),
            "author": "algorithm",
            "type": "numerical",
            "aggregator": "mean",
            "order": "descending",
            "range": [0, 2000, 250],
        },
    ]

    bfcl_categories = sorted(
        {
            task.get("bfcl_category", "")
            for task in tasks_list
            if task.get("bfcl_category")
        }
    )

    models = [
        {"model_id": mid, "name": model_dir_names.get(mid, mid), "owner": ""}
        for mid in all_model_ids
    ]

    output_doc: dict = {
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
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert BFCL output directories to an InspectorRAGet JSON file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Convert single-turn categories:
  python convert.py \\
      --bfcl-root ./bfcl_output \\
      --dataset-dir dataset/v4/ \\
      --output single_turn.json

  # Convert multi-turn (agentic) categories:
  python convert.py \\
      --bfcl-root ./bfcl_output \\
      --dataset-dir dataset/v4/ \\
      --task-type agentic \\
      --output multi_turn.json

  # Multiple models (each in their own subdirectory under bfcl_output):
  python convert.py --bfcl-root ./bfcl_output --output comparison.json
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
        type=Path,
        default=None,
        help=(
            "Path for the output InspectorRAGet JSON file. "
            "Defaults to bfcl_<task_type>.json inside --bfcl-root."
        ),
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
            "'agentic' converts multi-turn goal-directed categories "
            "(multi_turn_base, multi_turn_miss_func, multi_turn_miss_param, "
            "multi_turn_long_context, web_search, memory). "
            "Default: tool_calling."
        ),
    )

    args = parser.parse_args()

    if not args.bfcl_root.exists():
        sys.exit(f"Error: --bfcl-root path does not exist: {args.bfcl_root}")
    if args.dataset_dir and not args.dataset_dir.exists():
        sys.exit(f"Error: --dataset-dir path does not exist: {args.dataset_dir}")

    output = (
        args.output if args.output else args.bfcl_root / f"bfcl_{args.task_type}.json"
    )

    if args.task_type == "tool_calling":
        result = convert_tool_calling(args.bfcl_root, args.dataset_dir, args.name)
    else:
        result = convert_agentic(args.bfcl_root, args.dataset_dir, args.name)

    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    task_count = len(result.get("tasks", []))
    model_count = len(result.get("models", []))
    print(f"\nWrote {task_count} tasks across {model_count} model(s) to {output}")


if __name__ == "__main__":
    main()
