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

tau2bench -> InspectorRAGet converter.

Reads one tau2bench experiment directory containing one subdirectory per
model, and writes a single InspectorRAGet JSON file.

Usage:
    python convert.py \\
        --runs-dir runs/my_experiment \\
        --output tau2bench.json

See README.md for full documentation.
"""

import argparse
import json
import sys
import uuid
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 2

DOMAINS = ("airline", "retail", "telecom")

# Termination reasons that indicate the runner aborted before evaluation ran.
# reward_breakdown is None for these cases.
PREMATURE_TERMINATIONS = {"too_many_errors", "max_steps"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_domain_file(model_dir: Path, domain: str) -> Path | None:
    """
    Return the first JSON file in model_dir whose name contains the domain
    string, or None if no match is found.

    Matching is case-insensitive and anchored to the domain token so that
    "airline" matches "airline.json" and
    "exp01_model_tau2_airline.json" but not "airline_extra_retail.json".
    """
    for candidate in model_dir.glob("*.json"):
        stem = candidate.stem.lower()
        if domain in stem:
            return candidate
    return None


def _shorten_model_names(names: list[str]) -> dict[str, str]:
    """
    Strip the longest common prefix and suffix from a list of names to produce
    shorter display names. Falls back to full names if stripping would leave
    any name empty.
    """
    if len(names) <= 1:
        return {n: n for n in names}

    def common_prefix(strs):
        prefix = strs[0]
        for s in strs[1:]:
            while not s.startswith(prefix):
                prefix = prefix[:-1]
                if not prefix:
                    return ""
        return prefix

    def common_suffix(strs):
        return common_prefix([s[::-1] for s in strs])[::-1]

    prefix = common_prefix(names)
    suffix = common_suffix(names)
    # Trim suffix from prefix-stripped names to avoid over-stripping.
    short = {}
    for n in names:
        trimmed = n[len(prefix):]
        if suffix and trimmed.endswith(suffix):
            trimmed = trimmed[: -len(suffix)]
        trimmed = trimmed.strip("_- ")
        short[n] = trimmed if trimmed else n
    # If any display name is empty, fall back to full names.
    if any(not v for v in short.values()):
        return {n: n for n in names}
    return short


def _build_target(actions: list[dict]) -> dict | None:
    """
    Build a single InspectorRAGet TaskTarget of type 'state' from the
    evaluation_criteria.actions list.

    Each action becomes one entry in the target value dict, keyed by
    action_id, so the researcher can see exactly which tool calls were
    expected and with what arguments.
    """
    if not actions:
        return None
    value = {
        a["action_id"]: {"name": a["name"], "arguments": a["arguments"]}
        for a in actions
    }
    return {"type": "state", "value": value}


def _build_message(raw: dict, status: str | None = None, status_def: str | None = None) -> dict:
    """
    Convert one tau2bench message dict to an InspectorRAGet Message.

    tau2bench messages carry:
      role       — "assistant", "user", or "tool"
      content    — text or None
      tool_calls — list of {id, name, arguments} or None (assistant only)
      id         — tool call id (tool role only)
      error      — bool (tool role only)

    Some assistant messages in the telecom domain include both content and
    tool_calls (the agent narrates while also invoking a tool). Both are
    preserved; InspectorRAGet renders content first, then tool_calls.

    status/status_def are injected by the caller for the last assistant message
    to encode how the conversation ended (derived from the terminal signal that
    follows it, which is stripped from the output).
    """
    role = raw["role"]
    msg: dict = {"role": role}

    if raw.get("content"):
        msg["content"] = raw["content"]

    if role == "assistant" and raw.get("tool_calls"):
        msg["tool_calls"] = [
            {
                "id": tc.get("id", str(uuid.uuid4())),
                "name": tc["name"],
                "arguments": tc.get("arguments") or {},
            }
            for tc in raw["tool_calls"]
        ]

    if role == "tool":
        # Preserve the tool-call id so the UI can correlate calls and responses.
        if raw.get("id"):
            msg["id"] = raw["id"]
        if raw.get("error"):
            msg["metadata"] = {
                "status": "fail",
                "statusDefinition": "Tool execution returned an error.",
            }
        else:
            msg["metadata"] = {
                "status": "pass",
                "statusDefinition": "Tool executed successfully.",
            }

    # Terminal status injected by _strip_and_annotate via sentinel keys.
    injected_status = raw.get("_terminal_status") or status
    injected_def = raw.get("_terminal_def") or status_def
    if injected_status and role == "assistant":
        msg["metadata"] = {"status": injected_status, "statusDefinition": injected_def or ""}

    return msg


# Terminal signal tokens emitted by the tau2bench user simulator as the last
# message when a conversation ends. Each maps to:
#   - termination value used in tau2_termination score
#   - status badge on the last assistant message
#   - human-readable status definition
_TERMINAL_SIGNALS: dict[str, tuple[str, str, str]] = {
    "###STOP###": (
        "user_stop",
        "pass",
        "Task completed: the user simulator confirmed the goal was satisfied.",
    ),
    "###TRANSFER###": (
        "user_transfer",
        "warn",
        "Transferred to human agent: the request exceeded the agent's policy scope.",
    ),
    "###OUT-OF-SCOPE###": (
        "user_out_of_scope",
        "warn",
        "Out of scope: the user simulator ran out of scenario information and could not continue.",
    ),
}


def _strip_and_annotate(
    messages: list[dict], termination_reason: str
) -> tuple[list[dict], str]:
    """
    Strip the constant opening assistant greeting and the terminal user signal,
    then stamp the last assistant message with an appropriate status.

    Returns (processed_messages, termination_value) where termination_value is
    the specific signal token name (user_stop, user_transfer, user_out_of_scope)
    or the raw termination_reason for aborted runs.

    Opening message: tau2bench always starts with a fixed assistant greeting
    ("Hi! How can I help you today?") before the user speaks. It carries no
    task-specific information and is removed.

    Terminal signal: user_stop runs end with a bare signal token from the user
    simulator (###STOP###, ###TRANSFER###, ###OUT-OF-SCOPE###). This is runner
    bookkeeping, not user speech. It is stripped and its meaning is encoded as
    a status badge on the preceding assistant message.

    For premature terminations (max_steps, too_many_errors) there is no signal
    to strip; the last assistant message receives status: fail.
    """
    msgs = list(messages)

    # Strip the constant opening assistant greeting.
    if msgs and msgs[0]["role"] == "assistant" and not msgs[0].get("tool_calls"):
        content = (msgs[0].get("content") or "").strip()
        if content == "Hi! How can I help you today?":
            msgs = msgs[1:]

    if not msgs:
        return msgs, termination_reason

    # Determine terminal status from the last message or termination reason.
    last = msgs[-1]
    last_content = (last.get("content") or "").strip()

    termination_value = termination_reason
    terminal_status = None
    terminal_def = None

    for token, (term_value, status, definition) in _TERMINAL_SIGNALS.items():
        if token in last_content:
            termination_value = term_value
            terminal_status = status
            terminal_def = definition
            # Strip the signal message entirely.
            msgs = msgs[:-1]
            break

    # For aborted runs with no signal, mark the last assistant message as fail.
    if terminal_status is None and termination_reason in PREMATURE_TERMINATIONS:
        terminal_status = "fail"
        terminal_def = f"Run aborted: {termination_reason.replace('_', ' ')}."

    # Record the terminal status on the last assistant message so the caller
    # can inject it when building that message.
    if terminal_status:
        for i in range(len(msgs) - 1, -1, -1):
            if msgs[i]["role"] == "assistant":
                # Tag the raw dict with sentinel keys; _build_message reads these.
                msgs[i] = dict(msgs[i])
                msgs[i]["_terminal_status"] = terminal_status
                msgs[i]["_terminal_def"] = terminal_def
                break

    return msgs, termination_value


def _reward_detail(sim: dict) -> str:
    """
    Build a human-readable reward detail string from reward_breakdown.

    For premature terminations where reward_breakdown is None, returns
    the termination reason instead so the detail field is never empty.
    """
    breakdown = sim["reward_info"].get("reward_breakdown")
    if breakdown:
        parts = [f"{k}: {'pass' if v == 1.0 else 'fail'}" for k, v in breakdown.items()]
        return ", ".join(parts)
    reason = sim.get("termination_reason", "unknown")
    return f"terminated: {reason}"


# ---------------------------------------------------------------------------
# Per-model loading
# ---------------------------------------------------------------------------

def load_model(model_dir: Path) -> dict[str, dict]:
    """
    Load all three domain files for one model directory.

    Returns a dict keyed by domain name, each value being the parsed JSON.
    Prints a warning and skips any domain whose file is missing.
    """
    result = {}
    for domain in DOMAINS:
        path = _find_domain_file(model_dir, domain)
        if path is None:
            print(
                f"  Warning: no {domain} file found in {model_dir.name} — skipping domain.",
                file=sys.stderr,
            )
            continue
        with open(path) as f:
            result[domain] = json.load(f)
        print(f"  Loaded {domain}: {path.name}", file=sys.stderr)
    return result


# ---------------------------------------------------------------------------
# Conversion
# ---------------------------------------------------------------------------

def convert(runs_dir: Path, name: str, output: Path) -> None:
    # Discover model directories: immediate subdirs containing at least one
    # domain JSON file.
    model_dirs = sorted(
        d for d in runs_dir.iterdir()
        if d.is_dir() and any(_find_domain_file(d, dom) for dom in DOMAINS)
    )
    if not model_dirs:
        print(
            f"Error: no model directories found under {runs_dir}.\n"
            "Each model must be a subdirectory containing files matching "
            "*airline*.json, *retail*.json, and *telecom*.json.",
            file=sys.stderr,
        )
        sys.exit(1)

    model_names = [d.name for d in model_dirs]
    display_names = _shorten_model_names(model_names)
    print(f"Found {len(model_dirs)} model(s): {model_names}", file=sys.stderr)

    # Load all domain data per model.
    # Structure: model_data[model_name][domain] = parsed JSON
    model_data: dict[str, dict[str, dict]] = {}
    for model_dir in model_dirs:
        print(f"Loading {model_dir.name}...", file=sys.stderr)
        model_data[model_dir.name] = load_model(model_dir)

    # Build the unified task + simulation index.
    # task_id in InspectorRAGet is "{domain}_{original_id}".
    # We need every model to have scores for every task, so we collect all
    # task IDs across all models and domains first.

    # tasks_by_key[domain_task_id] = task definition dict (from any model;
    # task definitions are identical across models for the same benchmark run)
    tasks_by_key: dict[str, dict] = {}

    # sims_by_key[domain_task_id][model_name] = simulation dict
    sims_by_key: dict[str, dict[str, dict]] = {}

    for model_name, domains in model_data.items():
        for domain, data in domains.items():
            # Index tasks (build once; all models share the same task set).
            for task in data["tasks"]:
                key = f"{domain}_{task['id']}"
                if key not in tasks_by_key:
                    tasks_by_key[key] = {"domain": domain, "task": task}

            # Index simulations.
            for sim in data["simulations"]:
                key = f"{domain}_{sim['task_id']}"
                if key not in sims_by_key:
                    sims_by_key[key] = {}
                sims_by_key[key][model_name] = sim

    # Build InspectorRAGet tasks list.
    ig_tasks = []
    for key, entry in sorted(tasks_by_key.items()):
        domain = entry["domain"]
        task = entry["task"]
        ec = task.get("evaluation_criteria") or {}
        instructions = (task.get("user_scenario") or {}).get("instructions") or {}

        # Input: the reason_for_call is the closest thing to an initial user
        # prompt. If absent, fall back to the task purpose description.
        reason = instructions.get("reason_for_call") or (
            (task.get("description") or {}).get("purpose") or ""
        )
        input_messages = [{"role": "user", "content": reason}]

        # Contexts: known_info (what the user knows going in) and the domain
        # policy from environment_info, if we can retrieve it. Since policies
        # are identical across models for the same domain, pull from any model.
        contexts = []
        if instructions.get("known_info"):
            contexts.append({
                "context": instructions["known_info"],
                "title": "User Known Info",
            })

        # Target: expected tool calls from evaluation_criteria.actions.
        target = _build_target(ec.get("actions") or [])

        ig_task = {
            "task_id": key,
            "task_type": "agentic",
            "domain": domain,
            "input": input_messages,
        }
        if contexts:
            ig_task["contexts"] = contexts
        if target:
            ig_task["targets"] = [target]

        ig_tasks.append(ig_task)

    # Build models list (one entry per unique model directory).
    ig_models = [
        {"model_id": n, "name": display_names[n], "owner": ""}
        for n in model_names
    ]

    # Build InspectorRAGet results list.
    ig_results = []
    for model_name, domains in model_data.items():
        for domain, data in domains.items():
            for sim in data["simulations"]:
                key = f"{domain}_{sim['task_id']}"
                ri = sim["reward_info"]
                reward = ri.get("reward", 0.0)
                termination = sim.get("termination_reason", "unknown")
                detail = _reward_detail(sim)

                raw_messages, termination_value = _strip_and_annotate(
                    sim.get("messages") or [], termination
                )
                result = {
                    "task_id": key,
                    "model_id": model_name,
                    "output": [_build_message(m) for m in raw_messages],
                    "scores": {
                        "tau2_reward": {
                            "tau2": {
                                "value": "pass" if reward == 1.0 else "fail",
                                "numeric_value": reward,
                                "display_value": "Pass" if reward == 1.0 else "Fail",
                            }
                        },
                        "tau2_reward_detail": {
                            "tau2": {
                                "value": detail,
                                "display_value": detail,
                            }
                        },
                        "tau2_termination": {
                            "tau2": {
                                "value": termination_value,
                                "display_value": termination_value.replace("_", " ").title(),
                            }
                        },
                    },
                }
                ig_results.append(result)

    # Assemble final output.
    output_data = {
        "schema_version": SCHEMA_VERSION,
        "name": name,
        "task_type": "agentic",
        "models": ig_models,
        "metrics": [
            {
                "name": "tau2_reward",
                "display_name": "Reward",
                "description": "Whether the agent completed the task according to tau2bench evaluation.",
                "author": "algorithm",
                "type": "categorical",
                "aggregator": "majority",
                "order": "ascending",
                "values": [
                    {"value": "pass", "numeric_value": 1.0, "display_value": "Pass"},
                    {"value": "fail", "numeric_value": 0.0, "display_value": "Fail"},
                ],
            },
            {
                "name": "tau2_reward_detail",
                "display_name": "Reward Detail",
                "description": "Per-basis reward breakdown (e.g. DB: pass, COMMUNICATE: fail) or termination reason for aborted runs.",
                "author": "algorithm",
                "type": "text",
            },
            {
                "name": "tau2_termination",
                "display_name": "Termination Reason",
                "description": "How the simulation ended. Conversations that ran to completion (any user_stop variant) score 0.5; runs aborted by the runner (max_steps, too_many_errors) score 0.25.",
                "author": "algorithm",
                "type": "categorical",
                "aggregator": "majority",
                "order": "ascending",
                "values": [
                    {"value": "user_stop",          "numeric_value": 0.5, "display_value": "User Stop"},
                    {"value": "user_transfer",      "numeric_value": 0.5, "display_value": "User Transfer"},
                    {"value": "user_out_of_scope",  "numeric_value": 0.5, "display_value": "User Out of Scope"},
                    {"value": "max_steps",          "numeric_value": 0.25, "display_value": "Max Steps"},
                    {"value": "too_many_errors",    "numeric_value": 0.25, "display_value": "Too Many Errors"},
                ],
            },
        ],
        "filters": ["domain"],
        "tasks": ig_tasks,
        "results": ig_results,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    with open(output, "w") as f:
        json.dump(output_data, f)
    print(
        f"\nWrote {len(ig_tasks)} tasks × {len(model_dirs)} model(s) → {output}",
        file=sys.stderr,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert tau2bench run output to an InspectorRAGet JSON file."
    )
    parser.add_argument(
        "--runs-dir",
        required=True,
        type=Path,
        metavar="DIR",
        help=(
            "Experiment directory. Each immediate subdirectory is one model "
            "and must contain files matching *airline*.json, *retail*.json, "
            "and *telecom*.json."
        ),
    )
    parser.add_argument(
        "--name",
        default="tau2bench Evaluation",
        help="Display name shown in InspectorRAGet (default: 'tau2bench Evaluation').",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=(
            "Output file path. Defaults to tau2bench.json inside --runs-dir."
        ),
    )
    args = parser.parse_args()

    runs_dir = args.runs_dir.resolve()
    if not runs_dir.is_dir():
        print(f"Error: --runs-dir {runs_dir} does not exist.", file=sys.stderr)
        sys.exit(1)

    output = args.output or (runs_dir / "tau2bench.json")

    convert(runs_dir, args.name, output)


if __name__ == "__main__":
    main()
