# Converters

Standalone Python scripts that transform benchmark output directories into InspectorRAGet JSON files.

Each converter reads the native output format of a specific benchmark runner and produces a single JSON file that can be uploaded directly to InspectorRAGet.

## Available converters

| Converter                  | Benchmark                                    | Task type                 | Status    |
| -------------------------- | -------------------------------------------- | ------------------------- | --------- |
| [`bfcl/`](bfcl/)           | Berkeley Function-Calling Leaderboard (BFCL) | `tool_calling`, `agentic` | Available |
| [`acebench/`](acebench/)   | ACEBench                                     | `tool_calling`, `agentic` | Available |
| [`tau2bench/`](tau2bench/) | tau^2-bench                                  | `agentic`                 | Available |

## Requirements

Python 3.10 or later. Converters use stdlib only unless noted in their README.

## Usage pattern

Each converter is a self-contained script with its own README. The general pattern:

```bash
python converters/<name>/convert.py \
    --input /path/to/benchmark/output \
    --output my_results.json
```

See each converter's README for the exact flags and input file structure.
