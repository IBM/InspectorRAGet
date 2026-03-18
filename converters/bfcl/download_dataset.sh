#!/usr/bin/env bash
#
# Copyright 2023-present InspectorRAGet Team
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# ---------------------------------------------------------------------------
# Download BFCL dataset files into converters/bfcl/dataset/
#
# Usage:
#   ./download_dataset.sh          # downloads v4 (default)
#   ./download_dataset.sh v3       # downloads v3
#   ./download_dataset.sh v4       # downloads v4
#
# The dataset/ directory is gitignored. Run this script once before
# using convert.py with --dataset-dir dataset/
# ---------------------------------------------------------------------------

set -euo pipefail

VERSION="${1:-v4}"

if [[ "$VERSION" != "v3" && "$VERSION" != "v4" ]]; then
  echo "Error: unknown version '$VERSION'. Use v3 or v4." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$SCRIPT_DIR/dataset/$VERSION"
mkdir -p "$DEST"

if [[ "$VERSION" == "v3" ]]; then
  BASE_URL="https://raw.githubusercontent.com/ShishirPatil/gorilla/cd9429ccf3d4d04156affe883c495b3b047e6b64/berkeley-function-call-leaderboard/bfcl_eval/data"
  FILES=(
    # Single-turn (tool_calling task type)
    "BFCL_v3_simple.json"
    "BFCL_v3_multiple.json"
    "BFCL_v3_parallel.json"
    "BFCL_v3_parallel_multiple.json"
    "BFCL_v3_irrelevance.json"
    "BFCL_v3_java.json"
    "BFCL_v3_javascript.json"
    "BFCL_v3_live_simple.json"
    "BFCL_v3_live_multiple.json"
    "BFCL_v3_live_parallel.json"
    "BFCL_v3_live_parallel_multiple.json"
    "BFCL_v3_live_relevance.json"
    "BFCL_v3_live_irrelevance.json"
    # Multi-turn (agentic task type — not yet supported by convert.py)
    "BFCL_v3_multi_turn_base.json"
    "BFCL_v3_multi_turn_miss_func.json"
    "BFCL_v3_multi_turn_miss_param.json"
    "BFCL_v3_multi_turn_long_context.json"
  )
  # Ground-truth answer files live under possible_answer/ within the same data directory.
  # These are required to populate targets for passing tasks (score files only contain failures).
  ANSWER_FILES=(
    "possible_answer/BFCL_v3_simple.json"
    "possible_answer/BFCL_v3_multiple.json"
    "possible_answer/BFCL_v3_parallel.json"
    "possible_answer/BFCL_v3_parallel_multiple.json"
    "possible_answer/BFCL_v3_java.json"
    "possible_answer/BFCL_v3_javascript.json"
    "possible_answer/BFCL_v3_live_simple.json"
    "possible_answer/BFCL_v3_live_multiple.json"
    "possible_answer/BFCL_v3_live_parallel.json"
    "possible_answer/BFCL_v3_live_parallel_multiple.json"
  )
else
  BASE_URL="https://raw.githubusercontent.com/ShishirPatil/gorilla/main/berkeley-function-call-leaderboard/bfcl_eval/data"
  FILES=(
    # Single-turn (tool_calling task type)
    "BFCL_v4_simple_python.json"
    "BFCL_v4_multiple.json"
    "BFCL_v4_parallel.json"
    "BFCL_v4_parallel_multiple.json"
    "BFCL_v4_irrelevance.json"
    "BFCL_v4_simple_java.json"
    "BFCL_v4_simple_javascript.json"
    "BFCL_v4_live_multiple.json"
    "BFCL_v4_live_parallel.json"
    "BFCL_v4_live_irrelevance.json"
    "BFCL_v4_live_relevance.json"
    "BFCL_v4_format_sensitivity.json"
    # Multi-turn (agentic task type — not yet supported by convert.py)
    "BFCL_v4_multi_turn_base.json"
    "BFCL_v4_multi_turn_miss_func.json"
    "BFCL_v4_multi_turn_miss_param.json"
    "BFCL_v4_multi_turn_long_context.json"
    # V4 agentic categories (agentic task type — not yet supported by convert.py)
    "BFCL_v4_web_search.json"
    "BFCL_v4_memory.json"
  )
  ANSWER_FILES=(
    "possible_answer/BFCL_v4_simple_python.json"
    "possible_answer/BFCL_v4_multiple.json"
    "possible_answer/BFCL_v4_parallel.json"
    "possible_answer/BFCL_v4_parallel_multiple.json"
    "possible_answer/BFCL_v4_simple_java.json"
    "possible_answer/BFCL_v4_simple_javascript.json"
    "possible_answer/BFCL_v4_live_simple.json"
    "possible_answer/BFCL_v4_live_multiple.json"
    "possible_answer/BFCL_v4_live_parallel.json"
    "possible_answer/BFCL_v4_live_parallel_multiple.json"
  )
fi

echo "Downloading BFCL $VERSION dataset files to $DEST/"
echo ""

mkdir -p "$DEST/possible_answer"

for FILE in "${FILES[@]}" "${ANSWER_FILES[@]}"; do
  URL="$BASE_URL/$FILE"
  DEST_FILE="$DEST/$FILE"
  if [[ -f "$DEST_FILE" ]]; then
    echo "  Skipping $FILE (already exists)"
  else
    echo "  Downloading $FILE..."
    curl -fsSL -o "$DEST_FILE" "$URL" || {
      echo "  Error: failed to download $FILE" >&2
      rm -f "$DEST_FILE"
      exit 1
    }
  fi
done

echo ""
echo "Done. Pass --dataset-dir $DEST to convert.py"
