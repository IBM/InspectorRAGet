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
# Download ACEBench dataset files into converters/acebench/dataset/
#
# Usage:
#   ./download_dataset.sh
#
# The dataset/ directory is gitignored. Run this script once before
# using convert.py with --dataset-dir dataset/
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$SCRIPT_DIR/dataset"
BASE_URL="https://raw.githubusercontent.com/chenchen0103/ACEBench/main/data_all/data_en"

# Task definition files (one per category).
FILES=(
  # Atomic single-parameter categories
  "data_normal_atom_bool.json"
  "data_normal_atom_enum.json"
  "data_normal_atom_list.json"
  "data_normal_atom_number.json"
  "data_normal_atom_object_short.json"
  "data_normal_atom_object_deep.json"
  # Single-turn categories
  "data_normal_single_turn_single_function.json"
  "data_normal_single_turn_parallel_function.json"
  # Multi-turn tool-calling categories
  "data_normal_multi_turn_user_adjust.json"
  "data_normal_multi_turn_user_switch.json"
  # Other normal categories
  "data_normal_similar_api.json"
  "data_normal_preference.json"
  # Special categories
  "data_special_error_param.json"
  "data_special_incomplete.json"
  "data_special_irrelevant.json"
  # Agentic categories
  "data_agent_multi_step.json"
  "data_agent_multi_turn.json"
)

# Ground-truth answer files (one per category, same names under possible_answer/).
# Required to populate targets for passing tasks (score files only record failures).
ANSWER_FILES=(
  "possible_answer/data_normal_atom_bool.json"
  "possible_answer/data_normal_atom_enum.json"
  "possible_answer/data_normal_atom_list.json"
  "possible_answer/data_normal_atom_number.json"
  "possible_answer/data_normal_atom_object_short.json"
  "possible_answer/data_normal_atom_object_deep.json"
  "possible_answer/data_normal_single_turn_single_function.json"
  "possible_answer/data_normal_single_turn_parallel_function.json"
  "possible_answer/data_normal_multi_turn_user_adjust.json"
  "possible_answer/data_normal_multi_turn_user_switch.json"
  "possible_answer/data_normal_similar_api.json"
  "possible_answer/data_normal_preference.json"
  "possible_answer/data_special_error_param.json"
  "possible_answer/data_special_incomplete.json"
  "possible_answer/data_special_irrelevant.json"
  "possible_answer/data_agent_multi_step.json"
  "possible_answer/data_agent_multi_turn.json"
)

echo "Downloading ACEBench dataset files to $DEST/"
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
