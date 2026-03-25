# tau2bench Converter

Converts [tau^2-bench](https://github.com/sierra-research/tau2-bench) run output into an InspectorRAGet JSON file for instance-level analysis.

---

## Quick Start

```bash
# Convert one experiment (all domains, all models):
python convert.py \
    --runs-dir runs/my_experiment \
    --name "My tau2bench Evaluation"

# Output defaults to tau2bench.json inside --runs-dir.
# Specify an explicit path with --output:
python convert.py \
    --runs-dir runs/my_experiment \
    --output /path/to/results.json
```

> **Do not write output to `data/`.** The `data/` directory is reserved for pre-loaded examples shipped with the app. tau2bench outputs are per-run artifacts: use the default path (inside `--runs-dir`) or an explicit path outside `data/`.

### All Options

| Flag         | Required | Default                              | Description                                                |
| ------------ | -------- | ------------------------------------ | ---------------------------------------------------------- |
| `--runs-dir` | Yes      |                                      | Experiment directory containing one subdirectory per model |
| `--name`     | No       | `tau2bench Evaluation`               | Display name in InspectorRAGet                             |
| `--output`   | No       | `tau2bench.json` inside `--runs-dir` | Output file path                                           |

---

## What Is tau2bench?

tau^2-bench (tau-squared bench) is an agentic evaluation framework that measures how well an LLM-based customer service agent handles realistic service interactions across three domains:

| Domain    | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `airline` | Flight booking, modification, cancellation, and compensation |
| `retail`  | Order management, returns, refunds, and account inquiries    |
| `telecom` | Mobile device troubleshooting and network diagnostics        |

Each task is a full simulated conversation between an LLM agent and an LLM-driven user simulator. The agent operates against a live tool environment; correctness is judged by whether the required tool calls were made with the correct arguments and whether the final environment state matches the expected outcome.

The official tau2bench score is the mean binary reward across tasks (pass rate). There is no partial credit.

---

## Run Directory Layout

Each invocation of `convert.py` converts one experiment. `--runs-dir` points to the experiment directory. Each model evaluated in that experiment is an immediate subdirectory inside `--runs-dir`.

Each model subdirectory must contain exactly three domain result files. The converter matches files by looking for the domain name anywhere in the filename (case-insensitive), so both flat filenames and longer prefixed filenames are accepted:

```
runs/
└── my_experiment/               ← pass this as --runs-dir
    ├── ModelA/
    │   ├── airline.json
    │   ├── retail.json
    │   └── telecom.json
    └── ModelB/
        ├── exp01_modelB_airline.json
        ├── exp01_modelB_retail.json
        └── exp01_modelB_telecom.json
```

The tau2bench runner saves one file per domain via the `--save-to` flag. Run it three times (once per domain) pointing `--save-to` at the same model directory:

```bash
for DOMAIN in airline retail telecom; do
  tau2 run \
    --domain ${DOMAIN} \
    --save-to runs/my_experiment/ModelA/${DOMAIN}.json \
    ...
done
```

`converters/tau2bench/runs/` is gitignored and is a convenient local scratch space.

---

## Metrics

| Metric               | Type        | Aggregator | Description                                                                       |
| -------------------- | ----------- | ---------- | --------------------------------------------------------------------------------- |
| `tau2_reward`        | categorical | majority   | Binary pass/fail: `pass` (1.0) or `fail` (0.0)                                    |
| `tau2_reward_detail` | text        |            | Per-basis breakdown (e.g., `"DB: pass, COMMUNICATE: fail"`) or termination reason |
| `tau2_termination`   | categorical | majority   | How the simulation ended: `user_stop`, `max_steps`, or `too_many_errors`          |

### Domain Filter

Each task carries a `domain` field (`airline`, `retail`, or `telecom`). The output JSON declares `"filters": ["domain"]`, which tells InspectorRAGet to expose domain as a filter selector in the UI. Domain is a task attribute, not a scored metric.

### Reward Basis

tau2bench evaluates correctness against one or more reward bases depending on the domain and task. All bases are binary; the overall reward is 1.0 only if every applicable basis passes.

| Basis           | Description                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `DB`            | Database check: the tool calls made match the expected calls with the correct arguments        |
| `COMMUNICATE`   | Communication check: the agent verbally communicated required information to the user          |
| `ENV_ASSERTION` | Environment assertion: the final environment state satisfies the declared assertions (telecom) |

### Termination Reasons

| Value               | Numeric | Meaning                                                               |
| ------------------- | ------- | --------------------------------------------------------------------- |
| `user_stop`         | 0.5     | User simulator confirmed goal satisfied (`###STOP###`)                |
| `user_transfer`     | 0.5     | Agent transferred to a human agent (`###TRANSFER###`)                 |
| `user_out_of_scope` | 0.5     | User simulator ran out of scenario information (`###OUT-OF-SCOPE###`) |
| `max_steps`         | 0.25    | Runner hit the maximum step budget before the conversation completed  |
| `too_many_errors`   | 0.25    | Runner aborted after too many consecutive tool errors                 |

All three `user_stop` variants score 0.5: the conversation reached a natural end but that does not imply correctness — a transferred or out-of-scope run can still fail evaluation. The abort reasons (0.25) indicate the runner had to cut the conversation short before evaluation could complete. No value scores 1.0 because termination reason is not a reliable quality signal on its own; use `tau2_reward` for that.

For `max_steps` and `too_many_errors`, reward is always `fail` and `tau2_reward_detail` shows `"terminated: <reason>"` because the evaluation was never run.

---

## Data Mapping

### Task Fields

| InspectorRAGet Field | Source                                       | Notes                                                    |
| -------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `task_id`            | `"{domain}_{task.id}"`                       | Domain prefix prevents collisions across domains         |
| `task_type`          | hardcoded                                    | `"agentic"`                                              |
| `domain`             | domain filename match                        | `airline`, `retail`, or `telecom`; used as a filter      |
| `input`              | `user_scenario.instructions.reason_for_call` | The initial user goal as a single `user`-role message    |
| `contexts`           | `user_scenario.instructions.known_info`      | What the simulated user knows at the start of the call   |
| `targets`            | `evaluation_criteria.actions`                | Expected tool calls as a `state`-type target (see below) |

### ModelResult Fields

| InspectorRAGet Field        | Source                          | Notes                                                                         |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `model_id`                  | Model subdirectory name         | Full directory name; display name shortened by stripping common prefix/suffix |
| `output`                    | `simulation.messages`           | Full conversation as `Message[]` (see Message Mapping below)                  |
| `scores.tau2_reward`        | `reward_info.reward`            | `"pass"` / `1.0` or `"fail"` / `0.0`                                          |
| `scores.tau2_reward_detail` | `reward_info.reward_breakdown`  | Per-basis summary or `"terminated: <reason>"` for premature exits             |
| `scores.tau2_termination`   | `simulation.termination_reason` | Raw termination reason string                                                 |

### Target Format

The `targets` field on each task holds a single `state`-type target built from `evaluation_criteria.actions`. Each expected action becomes one entry in the target value object, keyed by its `action_id`:

```json
{
  "type": "state",
  "value": {
    "2_0": {
      "name": "get_user_details",
      "arguments": { "user_id": "noah_muller_9847" }
    },
    "2_1": {
      "name": "get_reservation_details",
      "arguments": { "reservation_id": "SDZQKO" }
    },
    "2_2": {
      "name": "send_certificate",
      "arguments": { "user_id": "noah_muller_9847", "amount": 50 }
    }
  }
}
```

This gives researchers a clear view of what the agent was supposed to do, which can be compared against the actual tool calls in the execution thread.

Tasks with no expected actions (e.g., tasks evaluated purely on environment assertions) have no `targets` field.

### Message Mapping

tau2bench messages map directly to InspectorRAGet messages:

| tau2bench `role` | InspectorRAGet `role` | Notes                                                              |
| ---------------- | --------------------- | ------------------------------------------------------------------ |
| `user`           | `user`                | Simulated user turn                                                |
| `assistant`      | `assistant`           | Agent turn; may carry `tool_calls`, `content`, or both             |
| `tool`           | `tool`                | Environment response; `metadata.status` is `fail` if `error: true` |

Some assistant messages in the telecom domain include both natural-language content and tool calls in the same turn (the agent narrates while invoking a tool). InspectorRAGet renders the content first, followed by the tool calls.

### Model Display Names

Model subdirectory names are used as `model_id`. The `name` field shown in the UI is shortened by stripping the longest common prefix and suffix shared across all model directory names in the experiment. If stripping would produce an empty name for any model, all models fall back to their full directory names.
