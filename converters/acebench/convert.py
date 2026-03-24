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

ACEBench -> InspectorRAGet converter.

Reads one ACEBench experiment directory and writes one or two InspectorRAGet
JSON files (one per task type, or both with --task-type all).

Usage:
    python convert.py \\
        --runs-dir runs/my_experiment \\
        --dataset-dir dataset/ \\
        --task-type tool_calling

See README.md for full documentation.
"""

import argparse
import ast
import json
import re
import sys
import uuid
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 2

# 15 tool-calling category file stems. Each maps to task_type "tool_calling".
TOOL_CALLING_STEMS = {
    "data_normal_atom_bool",
    "data_normal_atom_enum",
    "data_normal_atom_list",
    "data_normal_atom_number",
    "data_normal_atom_object_short",
    "data_normal_atom_object_deep",
    "data_normal_single_turn_single_function",
    "data_normal_single_turn_parallel_function",
    "data_normal_multi_turn_user_adjust",
    "data_normal_multi_turn_user_switch",
    "data_normal_similar_api",
    "data_normal_preference",
    "data_special_error_param",
    "data_special_incomplete",
    "data_special_irrelevant",
}

# 2 agentic category file stems. Each maps to task_type "agentic".
AGENTIC_STEMS = {
    "data_agent_multi_step",
    "data_agent_multi_turn",
}

# Special categories: no valid function call is possible. Targets use type "text".
SPECIAL_STEMS = {
    "data_special_error_param",
    "data_special_incomplete",
    "data_special_irrelevant",
}

# Maps ACEBench error_type to (value, numeric_value, display_value).
# Severity anchor: how hard is this error to fix?
#   0.00 — correct
#   0.25 — right function, wrong argument details
#   0.50 — wrong function, wrong count, or wrong final API state
#   0.75 — called a function when none was appropriate
#   1.00 — output could not be parsed as a function call
SEVERITY_MAP: dict[str, tuple[str, float, str]] = {
    "addition_args":                   ("extra_arguments",   0.25, "Extra Arguments"),
    "lack_args":                       ("missing_arguments", 0.25, "Missing Arguments"),
    "type_error":                      ("wrong_arguments",   0.25, "Wrong Arguments"),
    "value_error":                     ("wrong_arguments",   0.25, "Wrong Arguments"),
    "value_error:string":              ("wrong_arguments",   0.25, "Wrong Arguments"),
    "value_error:list/tuple":          ("wrong_arguments",   0.25, "Wrong Arguments"),
    "value_error:list_dict_count":     ("wrong_arguments",   0.25, "Wrong Arguments"),
    "class attributes wrong":          ("wrong_arguments",   0.25, "Wrong Arguments"),
    "function_mismatch":               ("wrong_function",    0.50, "Wrong Function"),
    "wrong functions number":          ("wrong_function",    0.50, "Wrong Function"),
    "simple_function_checker:unclear": ("wrong_function",    0.50, "Wrong Function"),
    "wrong number of class":           ("wrong_function",    0.50, "Wrong Function"),
    "error_detection":                 ("irrelevance_error", 0.75, "Irrelevance Error"),
    "wrong_output_format":             ("malformed_output",  1.00, "Malformed Output"),
}


# ---------------------------------------------------------------------------
# Tool definition normalisation
# ---------------------------------------------------------------------------

def normalize_tool_def(tool: dict) -> dict:
    """
    Normalise an ACEBench tool definition to valid JSON Schema.

    ACEBench uses "arguments" and "parameters" inconsistently as the key for
    the parameter bag. This function renames "arguments" to "parameters" at
    the top level. It also replaces "type": "dict" with "type": "object" and
    "type": "list" with "type": "array" recursively throughout.
    """
    if not isinstance(tool, dict):
        return tool

    # Top-level key rename: "arguments" -> "parameters".
    if "arguments" in tool and "parameters" not in tool:
        tool = dict(tool)
        tool["parameters"] = tool.pop("arguments")

    return _fix_type_strings(tool)


def _fix_type_strings(obj):
    """Recursively replace ACEBench-specific type strings with JSON Schema equivalents."""
    if not isinstance(obj, dict):
        return obj
    result = {}
    for key, value in obj.items():
        if key == "type" and value in ("dict", "list"):
            result[key] = "object" if value == "dict" else "array"
        elif isinstance(value, dict):
            result[key] = _fix_type_strings(value)
        elif isinstance(value, list):
            result[key] = [_fix_type_strings(v) if isinstance(v, dict) else v for v in value]
        else:
            result[key] = value
    return result


# ---------------------------------------------------------------------------
# Tool call parsing
# ---------------------------------------------------------------------------

def parse_tool_calls(text: str) -> list[dict] | None:
    """
    Parse a Python-style function-call string into a ToolCallRecord list.

    Accepts "[func_a(k=v), func_b(k=v)]" or "func_a(k=v)".
    Returns None when the text does not look like a function call.
    """
    text = text.strip()
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1].strip()
    else:
        inner = text
    if not inner:
        return None

    calls = []
    for call_str in _split_parallel_calls(inner):
        call_str = call_str.strip()
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_.]*)\s*\((.*)\)\s*$", call_str, re.DOTALL)
        if not m:
            return None
        func_name = m.group(1)
        args = _parse_kwargs(m.group(2).strip())
        if args is None:
            return None
        calls.append({"id": str(uuid.uuid4()), "name": func_name, "arguments": args})

    return calls if calls else None


def _split_parallel_calls(s: str) -> list[str]:
    """Split "f(a=1), g(b=2)" -> ["f(a=1)", "g(b=2)"] at top-level commas."""
    parts: list[str] = []
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
    """Parse 'key1="val", key2=42' into a dict. Returns None on failure."""
    if not args_str.strip():
        return {}
    result = {}
    remaining = args_str.strip()
    while remaining:
        key_match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*", remaining)
        if not key_match:
            return None
        key = key_match.group(1)
        remaining = remaining[key_match.end():]
        end = _find_value_end(remaining)
        if end < 0:
            return None
        value_str = remaining[:end].strip()
        remaining = remaining[end:].lstrip(", ")
        try:
            result[key] = ast.literal_eval(value_str)
        except (ValueError, SyntaxError):
            result[key] = value_str
    return result


def _find_value_end(s: str) -> int:
    """Return the index after the value ends (at a top-level comma or end of string)."""
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
    return i


# ---------------------------------------------------------------------------
# Question string -> Message[] parsing
# ---------------------------------------------------------------------------

def parse_question(question: str) -> list[dict]:
    """
    Parse ACEBench's embedded-turn question string into a Message[].

    Tool-calling tasks embed turns as:
        "user: <text>\\nsystem: <text>\\nuser: <text>\\n"

    "user:" maps to role "user"; "system:" maps to role "assistant" (it
    represents the prior model response in context).

    Agentic questions are plain strings with no prefix. If no role prefixes are
    detected, the whole string is returned as a single user message.
    """
    lines = question.strip().splitlines()
    has_prefixes = any(l.startswith("user:") or l.startswith("system:") for l in lines)

    if not has_prefixes:
        return [{"role": "user", "content": question.strip()}]

    messages: list[dict] = []
    current_role: str | None = None
    current_parts: list[str] = []

    for line in lines:
        if line.startswith("user:"):
            if current_role is not None:
                messages.append({"role": current_role, "content": "\n".join(current_parts).strip()})
            current_role = "user"
            current_parts = [line[len("user:"):].strip()]
        elif line.startswith("system:"):
            if current_role is not None:
                messages.append({"role": current_role, "content": "\n".join(current_parts).strip()})
            current_role = "assistant"
            current_parts = [line[len("system:"):].strip()]
        else:
            if current_role is not None:
                current_parts.append(line)

    if current_role is not None and current_parts:
        messages.append({"role": current_role, "content": "\n".join(current_parts).strip()})

    return [m for m in messages if m.get("content")]


# ---------------------------------------------------------------------------
# Ground truth -> TaskTarget conversion
# ---------------------------------------------------------------------------

def tool_calling_ground_truth_to_targets(ground_truth, stem: str) -> list[dict]:
    """
    Convert an ACEBench ground_truth to TaskTarget[] for tool_calling tasks.

    Normal categories: ground_truth is {func_name: {arg: value, ...}}.
        -> type "tool_calls" with one ToolCallRecord per function name key.

    Special categories (error_param, incomplete, irrelevant): no valid call
    is possible. Emit as type "text" with the JSON-serialised ground truth.
    """
    if ground_truth is None:
        return []

    if stem in SPECIAL_STEMS:
        if isinstance(ground_truth, str):
            return [{"type": "text", "value": ground_truth}]
        return [{"type": "text", "value": json.dumps(ground_truth)}]

    if not isinstance(ground_truth, dict):
        return [{"type": "text", "value": json.dumps(ground_truth)}]

    # Heuristic: if the first value is a list of strings (not a dict), this is a
    # special category encoded as a normal-looking dict (e.g. incomplete).
    first_value = next(iter(ground_truth.values()), None)
    if isinstance(first_value, list) and (not first_value or isinstance(first_value[0], str)):
        return [{"type": "text", "value": json.dumps(ground_truth)}]

    calls = []
    for func_name, args in ground_truth.items():
        calls.append({
            "id": str(uuid.uuid4()),
            "name": func_name,
            "arguments": args if isinstance(args, dict) else {},
        })
    return [{"type": "tool_calls", "calls": calls}]


def agentic_ground_truth_to_targets(ground_truth, milestone) -> list[dict]:
    """
    Build TaskTarget[] for an agentic task.

    ground_truth: expected final API state — list of {ClassName: {attr: value}} dicts.
        -> type "state" with the parsed object.

    milestone: expected execution sequence — list of call strings (or nested lists
    for OR alternatives).
        -> type "text" with one line per step (nested lists joined with " OR ").
    """
    targets: list[dict] = []

    if ground_truth is not None:
        targets.append({"type": "state", "value": ground_truth})

    if milestone is not None:
        lines = []
        for step in milestone:
            if isinstance(step, list):
                lines.append(" OR ".join(str(s) for s in step))
            else:
                lines.append(str(step))
        if lines:
            targets.append({"type": "text", "value": "\n".join(lines)})

    return targets


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------

def derive_severity(is_valid: bool, error_type: str | None) -> tuple[str, float, str]:
    """Return (value, numeric_value, display_value) for ace_error_severity."""
    if is_valid:
        return ("correct", 0.0, "Correct")
    if not error_type:
        return ("malformed_output", 1.0, "Malformed Output")
    entry = SEVERITY_MAP.get(error_type)
    if entry:
        return entry
    return ("unknown", 0.5, "Unknown")


def flatten_error(error) -> str:
    """
    Flatten the ACEBench 'error' field to a plain string.

    Formats seen in the wild:
    - string                 (normal tool-calling errors)
    - list[string]           (wrong_output_format in normal categories)
    - list[list[string]]     (agentic state-diff errors: one list per answer variant)
    """
    if not error:
        return "none"
    if isinstance(error, str):
        return error
    if isinstance(error, list):
        parts = []
        for item in error:
            if isinstance(item, list):
                parts.append("; ".join(str(s) for s in item))
            else:
                parts.append(str(item))
        return "\n".join(parts) if parts else "none"
    return str(error)


# ---------------------------------------------------------------------------
# Message status stamping
# ---------------------------------------------------------------------------

def message_status_and_definition(msg: dict) -> tuple[str | None, str | None]:
    """
    Derive (status, statusDefinition) for a single Message.

    Returns (None, None) for roles without status (user, system).

    tool messages:
        "fail" when content contains "status: False" (ACEBench environment signal).
        "pass" otherwise.

    assistant messages without a trace (single accepted step):
        "pass" when the message has tool_calls or content.

    assistant messages with a trace (intermediate steps before accepted output):
        "fail" — trace ends on invocation or observation (no accepted output reached).
        "warn" — trace ends on tool_execution (model eventually produced accepted output).
    """
    role = msg.get("role")

    if role == "tool":
        content = msg.get("content", "")
        if isinstance(content, str) and "status: False" in content:
            return "fail", "Tool execution returned one or more failure statuses from the ACEBench environment."
        return "pass", "Tool executed successfully and returned a result."

    if role == "assistant":
        trace = msg.get("trace")
        has_tool_calls = bool(msg.get("tool_calls"))
        has_content = bool(msg.get("content"))

        if trace:
            invocation_count = sum(1 for e in trace if isinstance(e, dict) and e.get("type") == "invocation")
            last_event = next(
                (e for e in reversed(trace) if isinstance(e, dict) and e.get("type")),
                None,
            )
            last_type = last_event.get("type") if last_event else None

            # If the message itself carries tool_calls or content, the runner accepted
            # an output after the intermediate trace events. Treat as "warn" (took extra
            # steps) rather than "fail" (never reached an accepted output).
            accepted_output = has_tool_calls or has_content

            if last_type in ("invocation", "observation") and not accepted_output:
                obs_content = (last_event or {}).get("content", "") if last_type == "observation" else ""
                if "budget exhausted" in obs_content:
                    fail_def = (
                        "Turn did not complete. The ACEBench runner exhausted the "
                        "20-invocation budget before an accepted output was reached."
                    )
                elif "NL response" in obs_content:
                    fail_def = (
                        "Turn did not complete. The model produced only natural-language "
                        "text when a tool call was expected, and the runner budget was exhausted."
                    )
                else:
                    fail_def = (
                        "Turn did not complete. The ACEBench runner terminated this "
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
# Dialogue history parsing (agentic)
# ---------------------------------------------------------------------------

def parse_dialogue_history(path: Path) -> list[dict]:
    """
    Parse an ACEBench dialogue history file into a Message[] execution thread.

    The file is a tab-separated markdown table:
        | message_index | sender     | recipient  | content       |
        | 0             | user       | agent      | <task text>   |
        | 1             | agent      | execution  | [func(k=v)]   |
        | 2             | execution  | agent      | status: True  |
        | 3             | agent      | user       | NL summary    |
        | 4             | execution  | agent      | Please do ... |
        | 5             | agent      | execution  | [func2(k=v)]  |
        ...

    Content wraps across rows within fixed-width columns. Continuation rows
    have a blank message_index cell.

    Trace logic:
    Two structurally different agentic categories appear in these files:

    - data_agent_multi_step: the agent completes the task in a single tool-call burst,
      then enters a coercion loop where every agent->user NL summary is rejected with
      "Please do not ask me any questions...". Those NL summaries and the coercion
      messages are runner noise; they go into the trace of the preceding accepted
      assistant message, not the execution thread.

    - data_agent_multi_turn: the agent genuinely alternates with the user. Every
      agent->user row is a real response the user reads and replies to. No coercion
      messages appear in these files at all. Those NL responses must stay in the
      execution thread as assistant messages.

    Lookahead rule: when we see agent->user, peek at the next execution->agent row.
    If it is a coercion message, route the NL response to the trace. If it is a real
    tool response (or there is no following execution row), keep it in the thread.

    Execution thread: user -> assistant (tool call or NL) -> tool (env response).
    """
    COERCION_PREFIX = "Please do not ask me any questions"

    rows = _read_table_rows(path)
    indexed = list(_reconstruct_messages(rows))

    messages: list[dict] = []
    pending_trace: list[dict] = []
    pending_tool_msgs: list[dict] = []
    pending_asst: dict | None = None

    def flush():
        nonlocal pending_asst, pending_tool_msgs
        if pending_asst is None:
            return
        if pending_trace:
            pending_asst["trace"] = list(pending_trace)
            pending_trace.clear()
        status, status_def = message_status_and_definition(pending_asst)
        if status:
            pending_asst["metadata"] = {"status": status, "statusDefinition": status_def}
        messages.append(pending_asst)
        for tm in list(pending_tool_msgs):
            s, sd = message_status_and_definition(tm)
            if s:
                tm["metadata"] = {"status": s, "statusDefinition": sd}
            messages.append(tm)
        pending_asst = None
        pending_tool_msgs.clear()

    def next_execution_content(i: int) -> str | None:
        """Return the content of the next execution->agent row after position i, or None."""
        for j in range(i + 1, len(indexed)):
            _, s, r, c = indexed[j]
            if s == "execution" and r == "agent":
                return c
        return None

    for i, (_idx, sender, recipient, content) in enumerate(indexed):
        if sender == "user" and recipient == "agent":
            # New user turn: commit any pending assistant + tool messages first.
            flush()
            messages.append({"role": "user", "content": content})

        elif sender == "agent" and recipient == "execution":
            # Tool call accepted by the runner.
            flush()
            tool_calls = parse_tool_calls(content)
            asst: dict = {"role": "assistant"}
            if tool_calls:
                asst["tool_calls"] = tool_calls
            else:
                asst["content"] = content
            pending_asst = asst

        elif sender == "agent" and recipient == "user":
            # NL response. Peek at the next execution->agent row to decide fate:
            # coercion follows -> intermediate noise, goes into trace;
            # real response or end of file -> genuine turn, stays in execution thread.
            next_exec = next_execution_content(i)
            if next_exec is not None and next_exec.startswith(COERCION_PREFIX):
                pending_trace.append({"type": "invocation", "output": {"role": "assistant", "content": content}})
            else:
                # Genuine agent->user response: flush any pending tool call first,
                # then emit as an assistant message in the execution thread.
                flush()
                asst_msg: dict = {"role": "assistant", "content": content}
                if pending_trace:
                    asst_msg["trace"] = list(pending_trace)
                    pending_trace.clear()
                status, status_def = message_status_and_definition(asst_msg)
                if status:
                    asst_msg["metadata"] = {"status": status, "statusDefinition": status_def}
                messages.append(asst_msg)

        elif sender == "execution" and recipient == "agent":
            if content.startswith(COERCION_PREFIX):
                # Coercion retry — observation paired with the preceding NL trace event.
                pending_trace.append({
                    "type": "observation",
                    "content": f"Runner: NL response rejected. {content}",
                })
            else:
                # Environment response to an accepted tool call.
                if pending_asst is not None:
                    pending_tool_msgs.append({"role": "tool", "content": content})
                else:
                    tool_msg = {"role": "tool", "content": content}
                    s, sd = message_status_and_definition(tool_msg)
                    if s:
                        tool_msg["metadata"] = {"status": s, "statusDefinition": sd}
                    messages.append(tool_msg)

    flush()

    # If the last assistant message has a trace ending on an invocation, the runner
    # exhausted its budget with no accepted output. Append a terminal observation so
    # message_status_and_definition returns "fail" and the tooltip is informative.
    if messages:
        last = messages[-1]
        if last.get("role") == "assistant" and last.get("trace"):
            trace = last["trace"]
            if trace and trace[-1].get("type") == "invocation":
                trace.append({
                    "type": "observation",
                    "content": "Runner: budget exhausted. No further tool calls were accepted.",
                })
                s, sd = message_status_and_definition(last)
                if s:
                    last["metadata"] = {"status": s, "statusDefinition": sd}

    return messages


def _read_table_rows(path: Path) -> list[list[str]]:
    """Read a markdown table and return rows as cell-string lists (header stripped)."""
    rows: list[list[str]] = []
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    for line in lines[2:]:  # skip header row and separator row
        line = line.rstrip("\n")
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.split("|")]
        if cells and cells[0] == "":
            cells = cells[1:]
        if cells and cells[-1] == "":
            cells = cells[:-1]
        if cells:
            rows.append(cells)
    return rows


def _reconstruct_messages(rows: list[list[str]]) -> list[tuple[int, str, str, str]]:
    """
    Reconstruct logical messages from table rows, joining continuation rows.
    Returns list of (message_index, sender, recipient, content).
    """
    indexed: list[tuple[int, str, str, str]] = []
    for row in rows:
        if len(row) < 4:
            continue
        idx_str, sender, recipient, content = row[0], row[1].strip(), row[2].strip(), row[3].strip()
        if not idx_str.strip():
            # Continuation row: append content to the last message.
            if indexed and content:
                prev = indexed[-1]
                sep = " " if prev[3] else ""
                indexed[-1] = (prev[0], prev[1], prev[2], prev[3] + sep + content)
            continue
        try:
            idx = int(idx_str.strip())
        except ValueError:
            continue
        indexed.append((idx, sender, recipient, content))
    return indexed


# ---------------------------------------------------------------------------
# Process array fallback (agentic, when no dialogue history exists)
# ---------------------------------------------------------------------------

def process_to_messages(process: list) -> list[dict]:
    """
    Build a flat Message[] from the result file's process array.

    The process array alternates tool-call strings and NL summaries:
        ["[func_a(k=v)]", "NL summary", "[func_b(k=v)]", "NL summary", ...]

    Each entry is emitted as an assistant message (tool_calls when parseable,
    content otherwise). No user or tool messages are available in this fallback.
    """
    messages: list[dict] = []
    for entry in process:
        if not isinstance(entry, str):
            continue
        entry = entry.strip()
        tool_calls = parse_tool_calls(entry)
        if tool_calls:
            msg: dict = {"role": "assistant", "tool_calls": tool_calls}
        else:
            msg = {"role": "assistant", "content": entry}
        s, sd = message_status_and_definition(msg)
        if s:
            msg["metadata"] = {"status": s, "statusDefinition": sd}
        messages.append(msg)
    return messages


# ---------------------------------------------------------------------------
# Model display name shortening
# ---------------------------------------------------------------------------

def shorten_names(names: list[str]) -> dict[str, str]:
    """
    Strip the longest common prefix and suffix shared by all names and return
    {original_name: display_name}. Falls back to full names if stripping would
    produce an empty name for any entry.
    """
    if not names:
        return {}
    if len(names) == 1:
        return {names[0]: names[0]}

    prefix = 0
    for chars in zip(*names):
        if len(set(chars)) == 1:
            prefix += 1
        else:
            break

    rev = [n[::-1] for n in names]
    suffix = 0
    for chars in zip(*rev):
        if len(set(chars)) == 1:
            suffix += 1
        else:
            break

    result = {}
    for n in names:
        short = n[prefix: len(n) - suffix if suffix else None]
        short = short.strip("_-")
        result[n] = short

    if any(not v for v in result.values()):
        return {n: n for n in names}

    return result


# ---------------------------------------------------------------------------
# File loading helpers
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file, skipping blank lines."""
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


def load_dataset(dataset_dir: Path, stems: set[str]) -> dict[str, dict]:
    """
    Load ACEBench dataset files for the given stems. Returns task_id -> record.
    Merges ground_truth from possible_answer/ into each record under "ground_truth".
    For agentic, also merges "mile_stone".
    """
    dataset_map: dict[str, dict] = {}
    for stem in stems:
        path = dataset_dir / f"{stem}.json"
        if not path.exists():
            print(f"  Warning: dataset file not found: {path}", file=sys.stderr)
            continue
        for rec in load_jsonl(path):
            task_id = rec.get("id")
            if task_id:
                dataset_map[task_id] = rec

    answer_dir = dataset_dir / "possible_answer"
    if answer_dir.exists():
        for stem in stems:
            path = answer_dir / f"{stem}.json"
            if not path.exists():
                continue
            for rec in load_jsonl(path):
                task_id = rec.get("id")
                if not task_id or task_id not in dataset_map:
                    continue
                # Agentic possible_answer records have both ground_truth and mile_stone.
                if "ground_truth" in rec:
                    dataset_map[task_id]["ground_truth"] = rec["ground_truth"]
                if "mile_stone" in rec:
                    dataset_map[task_id]["mile_stone"] = rec["mile_stone"]

    return dataset_map


def stem_for_task_id(task_id: str, stems: set[str]) -> str | None:
    """
    Derive the file stem for a task ID.
    ACEBench IDs: "normal_atom_bool_0", "agent_multi_step_3".
    Stems: "data_normal_atom_bool", "data_agent_multi_step".
    """
    for stem in stems:
        prefix = stem[len("data_"):] if stem.startswith("data_") else stem
        if re.match(rf"^{re.escape(prefix)}_\d+$", task_id):
            return stem
    return None


def task_id_to_index(task_id: str) -> int | None:
    """Extract the integer suffix from a task ID. "agent_multi_step_3" -> 3."""
    m = re.search(r"_(\d+)$", task_id)
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# Metric definitions
# ---------------------------------------------------------------------------

_SEVERITY_VALUES = [
    {"value": "correct",           "numeric_value": 0.00, "display_value": "Correct"},
    {"value": "extra_arguments",   "numeric_value": 0.25, "display_value": "Extra Arguments"},
    {"value": "missing_arguments", "numeric_value": 0.25, "display_value": "Missing Arguments"},
    {"value": "wrong_arguments",   "numeric_value": 0.25, "display_value": "Wrong Arguments"},
    {"value": "wrong_function",    "numeric_value": 0.50, "display_value": "Wrong Function"},
    {"value": "unknown",           "numeric_value": 0.50, "display_value": "Unknown"},
    {"value": "irrelevance_error", "numeric_value": 0.75, "display_value": "Irrelevance Error"},
    {"value": "malformed_output",  "numeric_value": 1.00, "display_value": "Malformed Output"},
]


def build_tool_calling_metrics() -> list[dict]:
    return [
        {
            "name": "ace_correctness",
            "display_name": "Correctness",
            "description": "Whether the predicted function call(s) match the ACEBench ground truth.",
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "ascending",
            "values": [
                {"value": "correct",   "numeric_value": 1, "display_value": "Correct"},
                {"value": "incorrect", "numeric_value": 0, "display_value": "Incorrect"},
            ],
        },
        {
            "name": "ace_error_severity",
            "display_name": "Error Severity",
            "description": (
                "Recoverability-anchored severity derived from ACEBench error type. "
                "0 = correct; 0.25 = right function, wrong argument details; "
                "0.5 = wrong function or count; 0.75 = irrelevance error; "
                "1.0 = output could not be parsed."
            ),
            "author": "algorithm",
            "type": "categorical",
            "aggregator": "majority",
            "order": "descending",
            "values": _SEVERITY_VALUES,
        },
        {
            "name": "ace_error_type",
            "display_name": "Error Type",
            "description": "Raw ACEBench error_type string. \"none\" for correct tasks.",
            "author": "algorithm",
            "type": "text",
        },
        {
            "name": "ace_error",
            "display_name": "Error Detail",
            "description": "Human-readable ACEBench error description. \"none\" for correct tasks.",
            "author": "algorithm",
            "type": "text",
        },
    ]


def build_agentic_metrics() -> list[dict]:
    base = build_tool_calling_metrics()
    # Correctness description is end-to-end state match for agentic.
    base[0] = dict(base[0], description=(
        "Whether the final API state matches the ground truth (end-to-end correctness)."
    ))
    process_metric = {
        "name": "ace_process_accuracy",
        "display_name": "Process Accuracy",
        "description": (
            "Fraction of expected milestones correctly completed (0.0 to 1.0), "
            "as computed by the ACEBench process evaluator."
        ),
        "author": "algorithm",
        "type": "numerical",
        "aggregator": "mean",
        "order": "ascending",
        "range": [0.0, 1.0, 0.1],
    }
    # Insert process accuracy after correctness.
    return [base[0], process_metric] + base[1:]


# ---------------------------------------------------------------------------
# Validation: cross-check accuracy against score file headers
# ---------------------------------------------------------------------------

def validate_accuracy(runs_dir: Path, task_type: str, output_doc: dict) -> None:
    """
    Cross-check computed accuracy against the per-category accuracy values in
    score file headers. Prints a summary table and flags mismatches.
    """
    stems = TOOL_CALLING_STEMS if task_type == "tool_calling" else AGENTIC_STEMS
    score_dir = runs_dir / "score"
    if not score_dir.exists():
        return

    correct_index: dict[str, dict[str, bool]] = {}
    for result in output_doc.get("results", []):
        mid = result.get("model_id", "")
        tid = result.get("task_id", "")
        score_block = result.get("scores", {}).get("ace_correctness", {})
        for ann_data in score_block.values():
            correct_index.setdefault(mid, {})[tid] = ann_data.get("value") == "correct"

    print("\n--- Accuracy validation ---")
    header = f"{'Model':<50} {'Category':<42} {'Expected':>10} {'Computed':>10} {'Status':>10}"
    print(header)
    print("-" * len(header))

    all_ok = True
    for config_dir in sorted(d for d in score_dir.iterdir() if d.is_dir()):
        model_id = config_dir.name
        for stem in sorted(stems):
            score_file = config_dir / f"{stem}_score.json"
            if not score_file.exists():
                continue
            records = load_jsonl(score_file)
            if not records:
                continue
            hdr = records[0]
            expected = hdr.get("accuracy") or hdr.get("end_to_end_accuracy")
            total = hdr.get("total_count", 0)
            if expected is None or total == 0:
                continue

            prefix = stem[len("data_"):] if stem.startswith("data_") else stem
            cat_ids = {
                tid for tid in correct_index.get(model_id, {})
                if re.match(rf"^{re.escape(prefix)}_\d+$", tid)
            }
            if not cat_ids:
                continue

            correct = sum(1 for tid in cat_ids if correct_index[model_id].get(tid))
            computed = correct / len(cat_ids)
            diff = abs(computed - expected)
            status = "OK" if diff < 0.005 else "MISMATCH"
            if status != "OK":
                all_ok = False

            print(
                f"{model_id:<50} {stem[5:]:<42} "
                f"{expected:>10.4f} {computed:>10.4f} {status:>10}"
            )

    print("-" * len(header))
    print("All accuracy checks passed." if all_ok else "WARNING: One or more mismatches detected.")


# ---------------------------------------------------------------------------
# Core conversion: tool_calling task type
# ---------------------------------------------------------------------------

def convert_tool_calling(runs_dir: Path, dataset_dir: Path, output_name: str) -> dict:
    """
    Walk runs_dir and produce an InspectorRAGet document for all tool_calling categories.

    Each subdirectory under result/ is one model config. Score files record only
    failures; absence from the score file means the task was answered correctly.
    """
    result_dir = runs_dir / "result"
    score_dir = runs_dir / "score"

    if not result_dir.exists():
        sys.exit(f"Error: result/ directory not found under {runs_dir}")

    config_dirs = sorted(d for d in result_dir.iterdir() if d.is_dir())
    if not config_dirs:
        sys.exit(f"Error: no config directories found under {result_dir}")

    print(f"Found {len(config_dirs)} config(s) under {result_dir}")

    # result_map[model_id][task_id] = result record
    # score_map[model_id][task_id]  = score record (failures only)
    result_map: dict[str, dict[str, dict]] = {}
    score_map: dict[str, dict[str, dict]] = {}

    for config_dir in config_dirs:
        model_id = config_dir.name
        result_map.setdefault(model_id, {})
        score_map.setdefault(model_id, {})
        print(f"\nProcessing: {model_id}")

        for stem in TOOL_CALLING_STEMS:
            result_file = config_dir / f"{stem}_result.json"
            if not result_file.exists():
                continue
            recs = load_jsonl(result_file)
            for r in recs:
                if r.get("id"):
                    result_map[model_id][r["id"]] = r
            print(f"  Loaded {len(recs)} result records from {result_file.name}")

        score_config_dir = score_dir / model_id if score_dir.exists() else None
        if score_config_dir and score_config_dir.exists():
            for stem in TOOL_CALLING_STEMS:
                score_file = score_config_dir / f"{stem}_score.json"
                if not score_file.exists():
                    continue
                recs = load_jsonl(score_file)
                failures = [r for r in recs if "id" in r]
                for r in failures:
                    score_map[model_id][r["id"]] = r
                print(f"  Loaded {len(failures)} failure records from {score_file.name}")

    dataset_records = load_dataset(dataset_dir, TOOL_CALLING_STEMS)
    print(f"\nLoaded {len(dataset_records)} task definitions from {dataset_dir}")

    # Emit all dataset tasks when available; otherwise restrict to failed tasks only
    # (only failures carry a prompt in score files).
    all_failed: set[str] = set()
    for m in score_map.values():
        all_failed.update(m.keys())

    task_ids_to_emit = set(dataset_records.keys()) if dataset_records else all_failed

    all_model_ids = sorted(result_map.keys())
    display_names = shorten_names(all_model_ids)
    print(f"\nBuilding output for {len(task_ids_to_emit)} tasks across {len(all_model_ids)} model(s)...")

    tasks_list: list[dict] = []
    results_list: list[dict] = []

    for task_id in sorted(task_ids_to_emit):
        stem = stem_for_task_id(task_id, TOOL_CALLING_STEMS)
        dataset_rec = dataset_records.get(task_id, {})

        task: dict = {"task_id": task_id, "task_type": "tool_calling"}

        question = dataset_rec.get("question", "")
        if question:
            task["input"] = parse_question(question)

        raw_functions = dataset_rec.get("function", [])
        if raw_functions:
            task["tools"] = [normalize_tool_def(f) for f in raw_functions]

        if stem:
            task["ace_category"] = stem[len("data_"):]

        ground_truth = dataset_rec.get("ground_truth")
        if ground_truth is not None and stem:
            task["targets"] = tool_calling_ground_truth_to_targets(ground_truth, stem)

        tasks_list.append(task)

        for model_id in all_model_ids:
            score_rec = score_map.get(model_id, {}).get(task_id)
            result_rec = result_map.get(model_id, {}).get(task_id)

            if score_rec is None and result_rec is None:
                continue

            # Absent from score file means the task passed for this model.
            is_valid = score_rec is None
            error_type = None if is_valid else score_rec.get("error_type")
            error = None if is_valid else score_rec.get("error")

            sev_value, sev_numeric, sev_display = derive_severity(is_valid, error_type)

            # Build output message. Try to parse tool calls from the raw result string.
            # For passing tasks with no parseable result, use the target as a proxy.
            raw_result = (result_rec or {}).get("result", "")
            model_result_raw = (
                (score_rec or {}).get("model_result", raw_result)
                if not is_valid else raw_result
            )
            tool_calls = parse_tool_calls(
                model_result_raw if isinstance(model_result_raw, str) else ""
            )
            output_msg: dict = {"role": "assistant"}
            if tool_calls:
                output_msg["tool_calls"] = tool_calls
            elif not is_valid:
                output_msg["content"] = (
                    model_result_raw
                    if isinstance(model_result_raw, str)
                    else json.dumps(model_result_raw)
                )
            else:
                # Passing task, raw result not a parseable call — use target as proxy.
                targets = task.get("targets", [])
                if targets and targets[0].get("calls"):
                    output_msg["tool_calls"] = targets[0]["calls"]
                else:
                    output_msg["content"] = (
                        raw_result if isinstance(raw_result, str) else json.dumps(raw_result)
                    )

            status, status_def = message_status_and_definition(output_msg)
            if status:
                output_msg["metadata"] = {"status": status, "statusDefinition": status_def}

            scores: dict = {
                "ace_correctness": {
                    "ace": {
                        "value": "correct" if is_valid else "incorrect",
                        "numeric_value": 1 if is_valid else 0,
                    }
                },
                "ace_error_severity": {
                    "ace": {
                        "value": sev_value,
                        "numeric_value": sev_numeric,
                        "display_value": sev_display,
                    }
                },
                "ace_error_type": {"ace": {"value": error_type or "none"}},
                "ace_error": {"ace": {"value": flatten_error(error)}},
            }

            results_list.append({
                "task_id": task_id,
                "model_id": model_id,
                "output": [output_msg],
                "scores": scores,
            })

    ace_categories = sorted({t.get("ace_category", "") for t in tasks_list if t.get("ace_category")})
    models = [{"model_id": mid, "name": display_names.get(mid, mid), "owner": ""} for mid in all_model_ids]

    output_doc: dict = {
        "schema_version": SCHEMA_VERSION,
        "name": output_name,
        "models": models,
        "metrics": build_tool_calling_metrics(),
        "tasks": tasks_list,
        "results": results_list,
    }
    if ace_categories:
        output_doc["filters"] = ["ace_category"]
    return output_doc


# ---------------------------------------------------------------------------
# Core conversion: agentic task type
# ---------------------------------------------------------------------------

def convert_agentic(runs_dir: Path, dataset_dir: Path, output_name: str) -> dict:
    """
    Walk runs_dir and produce an InspectorRAGet document for all agentic categories.

    Agentic score files use integer IDs (the task index suffix); result and dataset
    files use string IDs ("agent_multi_step_3"). The converter derives integer
    indices from task ID suffixes for score and process file lookups.
    """
    result_dir = runs_dir / "result"
    score_dir = runs_dir / "score"
    hist_dir = runs_dir / "dialogue_history"

    if not result_dir.exists():
        sys.exit(f"Error: result/ directory not found under {runs_dir}")

    config_dirs = sorted(d for d in result_dir.iterdir() if d.is_dir())
    if not config_dirs:
        sys.exit(f"Error: no config directories found under {result_dir}")

    print(f"Found {len(config_dirs)} config(s) under {result_dir}")

    result_map: dict[str, dict[str, dict]] = {}    # model_id -> task_id -> record
    score_map: dict[str, dict[str, dict]] = {}    # model_id -> task_id (string) -> record
    process_map: dict[str, dict[str, dict]] = {}  # model_id -> task_id (string) -> process_record

    for config_dir in config_dirs:
        model_id = config_dir.name
        result_map.setdefault(model_id, {})
        score_map.setdefault(model_id, {})
        process_map.setdefault(model_id, {})
        print(f"\nProcessing: {model_id}")

        for stem in AGENTIC_STEMS:
            result_file = config_dir / f"{stem}_result.json"
            if not result_file.exists():
                continue
            recs = load_jsonl(result_file)
            for r in recs:
                if r.get("id"):
                    result_map[model_id][r["id"]] = r
            print(f"  Loaded {len(recs)} result records from {result_file.name}")

        score_config_dir = score_dir / model_id if score_dir.exists() else None
        if score_config_dir and score_config_dir.exists():
            for stem in AGENTIC_STEMS:
                score_file = score_config_dir / f"{stem}_score.json"
                if score_file.exists():
                    recs = load_jsonl(score_file)
                    failures = [r for r in recs if "id" in r]
                    # Reconstruct string task IDs from the stem prefix and integer ID.
                    # Agentic score files store integer IDs; task IDs in result/dataset files
                    # are strings like "agent_multi_step_3". We rebuild them here so the
                    # score_map key space does not collide across stems (multi_step indices
                    # 0-19 vs multi_turn indices 0-29 would otherwise clobber each other).
                    stem_prefix = stem[len("data_"):] if stem.startswith("data_") else stem
                    for r in failures:
                        try:
                            idx = int(r["id"])
                        except (ValueError, TypeError):
                            continue
                        reconstructed_id = f"{stem_prefix}_{idx}"
                        score_map[model_id][reconstructed_id] = r
                    print(f"  Loaded {len(failures)} failure records from {score_file.name}")

                process_file = score_config_dir / f"{stem}_process.json"
                if process_file.exists():
                    recs = load_jsonl(process_file)
                    for rec in recs:
                        # Each line: {"agent_multi_step_N": {process_accuracy, model_output, call_process}}
                        for tid_str, proc_data in rec.items():
                            process_map[model_id][tid_str] = proc_data
                    print(f"  Loaded process records from {process_file.name}")

    dataset_records = load_dataset(dataset_dir, AGENTIC_STEMS)
    print(f"\nLoaded {len(dataset_records)} task definitions from {dataset_dir}")

    all_failed_ids: set[str] = set()
    for m in score_map.values():
        all_failed_ids.update(m.keys())

    if dataset_records:
        task_ids_to_emit = set(dataset_records.keys())
    else:
        task_ids_to_emit = {tid for m in result_map.values() for tid in m}

    all_model_ids = sorted(result_map.keys())
    display_names = shorten_names(all_model_ids)
    print(f"\nBuilding output for {len(task_ids_to_emit)} tasks across {len(all_model_ids)} model(s)...")

    tasks_list: list[dict] = []
    results_list: list[dict] = []

    for task_id in sorted(task_ids_to_emit):
        task_idx = task_id_to_index(task_id)
        stem = stem_for_task_id(task_id, AGENTIC_STEMS)
        dataset_rec = dataset_records.get(task_id, {})

        task: dict = {"task_id": task_id, "task_type": "agentic"}

        question = dataset_rec.get("question", "")
        if question:
            task["input"] = [{"role": "user", "content": question.strip()}]

        initial_config = dataset_rec.get("initial_config")
        if initial_config is not None:
            task["contexts"] = [{"title": "Initial State", "text": json.dumps(initial_config)}]

        raw_functions = dataset_rec.get("function", [])
        if raw_functions:
            task["tools"] = [normalize_tool_def(f) for f in raw_functions]

        if stem:
            task["ace_category"] = stem[len("data_"):]

        ground_truth = dataset_rec.get("ground_truth")
        milestone = dataset_rec.get("mile_stone")
        if ground_truth is not None or milestone is not None:
            task["targets"] = agentic_ground_truth_to_targets(ground_truth, milestone)

        tasks_list.append(task)

        for model_id in all_model_ids:
            score_rec = score_map.get(model_id, {}).get(task_id)
            result_rec = result_map.get(model_id, {}).get(task_id)
            proc_data = process_map.get(model_id, {}).get(task_id)

            if score_rec is None and result_rec is None:
                continue

            is_valid = score_rec is None
            error_type = None if is_valid else score_rec.get("error_type")
            error = None if is_valid else score_rec.get("error")

            sev_value, sev_numeric, sev_display = derive_severity(is_valid, error_type)

            process_accuracy = 1.0 if is_valid else float(
                proc_data.get("process_accuracy", 0.0) if proc_data else 0.0
            )

            # Build execution thread: prefer dialogue history, fall back to process array.
            output_messages: list[dict] = []
            if hist_dir.exists() and task_idx is not None and stem:
                subdir = "multi_turn" if "multi_turn" in stem else "multi_step"
                hist_file = hist_dir / model_id / subdir / f"{task_idx}_dialogue_history.txt"
                if hist_file.exists():
                    try:
                        output_messages = parse_dialogue_history(hist_file)
                    except Exception as e:
                        print(f"  Warning: failed to parse {hist_file}: {e}", file=sys.stderr)

            if not output_messages and result_rec:
                process = result_rec.get("process", [])
                if process:
                    output_messages = process_to_messages(process)

            if not output_messages:
                output_messages = [{"role": "assistant", "content": "(No execution trace available.)"}]

            scores: dict = {
                "ace_correctness": {
                    "ace": {
                        "value": "correct" if is_valid else "incorrect",
                        "numeric_value": 1 if is_valid else 0,
                    }
                },
                "ace_process_accuracy": {
                    "ace": {
                        "value": process_accuracy,
                        "numeric_value": process_accuracy,
                    }
                },
                "ace_error_severity": {
                    "ace": {
                        "value": sev_value,
                        "numeric_value": sev_numeric,
                        "display_value": sev_display,
                    }
                },
                "ace_error_type": {"ace": {"value": error_type or "none"}},
                "ace_error": {"ace": {"value": flatten_error(error)}},
            }

            results_list.append({
                "task_id": task_id,
                "model_id": model_id,
                "output": output_messages,
                "scores": scores,
            })

    ace_categories = sorted({t.get("ace_category", "") for t in tasks_list if t.get("ace_category")})
    models = [{"model_id": mid, "name": display_names.get(mid, mid), "owner": ""} for mid in all_model_ids]

    output_doc: dict = {
        "schema_version": SCHEMA_VERSION,
        "name": output_name,
        "models": models,
        "metrics": build_agentic_metrics(),
        "tasks": tasks_list,
        "results": results_list,
    }
    if ace_categories:
        output_doc["filters"] = ["ace_category"]
    return output_doc


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert ACEBench evaluation output to InspectorRAGet JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--runs-dir",
        required=True,
        type=Path,
        help="Experiment directory containing result/, score/, dialogue_history/.",
    )
    parser.add_argument(
        "--dataset-dir",
        required=True,
        type=Path,
        help="Dataset directory produced by download_dataset.sh.",
    )
    parser.add_argument(
        "--task-type",
        choices=["tool_calling", "agentic", "all"],
        default="tool_calling",
        help="Task type to convert (default: tool_calling).",
    )
    parser.add_argument(
        "--name",
        default="ACEBench Evaluation",
        help="Display name shown in InspectorRAGet (default: 'ACEBench Evaluation').",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=(
            "Output file path. With --task-type all, treated as a stem: "
            "<stem>_tool_calling.json and <stem>_agentic.json are written. "
            "Defaults to acebench_<task_type>.json inside --runs-dir."
        ),
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Cross-check computed accuracy against score file headers after conversion.",
    )
    args = parser.parse_args()

    runs_dir: Path = args.runs_dir.resolve()
    dataset_dir: Path = args.dataset_dir.resolve()

    if not runs_dir.exists():
        sys.exit(f"Error: --runs-dir does not exist: {runs_dir}")
    if not dataset_dir.exists():
        sys.exit(f"Error: --dataset-dir does not exist: {dataset_dir}")

    task_types: list[str] = (
        ["tool_calling", "agentic"] if args.task_type == "all" else [args.task_type]
    )

    for task_type in task_types:
        print(f"\n{'=' * 60}")
        print(f"Converting task type: {task_type}")
        print(f"{'=' * 60}")

        if args.output:
            if args.task_type == "all":
                stem = str(args.output)
                if stem.endswith(".json"):
                    stem = stem[:-5]
                out_path = Path(f"{stem}_{task_type}.json")
            else:
                out_path = args.output
        else:
            out_path = runs_dir / f"acebench_{task_type}.json"

        if task_type == "tool_calling":
            doc = convert_tool_calling(runs_dir, dataset_dir, args.name)
        else:
            doc = convert_agentic(runs_dir, dataset_dir, args.name)

        if args.validate:
            validate_accuracy(runs_dir, task_type, doc)

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)

        print(f"\nWrote {out_path}")
        print(
            f"  Tasks: {len(doc.get('tasks', []))}, "
            f"Results: {len(doc.get('results', []))}, "
            f"Models: {len(doc.get('models', []))}"
        )


if __name__ == "__main__":
    main()
