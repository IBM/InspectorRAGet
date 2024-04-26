/**
 *
 * Copyright 2023-2024 InspectorRAGet Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 **/

class ConfusionMatrix {
  private matrix: number[][];
  private headers: any[];

  constructor(headers: any[]) {
    this.headers = headers;
    this.matrix = Array(headers.length)
      .fill(0)
      .map((row) => new Array(headers.length).fill(0));
  }

  addToElement(val1, val2) {
    const row: number = this.headers.indexOf(val1);
    const col: number = this.headers.indexOf(val2);
    this.matrix[row][col] += 1;
  }

  diagonalSum() {
    const size = this.matrix.length;
    let diagSum = 0;

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (i === j) {
          diagSum += this.matrix[i][j];
        }
      }
    }
    return diagSum;
  }

  rowSum(index: number) {
    let rowSum = 0;
    for (let i = 0; i < this.matrix.length; i++) {
      rowSum += this.matrix[index][i];
    }
    return rowSum;
  }

  columnSum(index: number) {
    let columnSum = 0;
    for (let i = 0; i < this.matrix.length; i++) {
      columnSum += this.matrix[i][index];
    }
    return columnSum;
  }

  cohenKappaScore() {
    const size = this.matrix.length;
    let rowSums: number[] = [];
    let columnSums: number[] = [];
    for (let i = 0; i < this.matrix.length; i++) {
      rowSums.push(this.rowSum(i));
      columnSums.push(this.columnSum(i));
    }
    const total = rowSums.reduce((total, v) => (total = total + v), 0);
    if (total > 0) {
      const p_o = this.diagonalSum() / total;
      let p_e = 0;
      for (let i = 0; i < this.matrix.length; i++) {
        // sum of multiplications of respective columns and rows
        p_e += (rowSums[i] / total) * (columnSums[i] / total);
      }
      if (p_e < 1) {
        const cohen_kappa_score = (p_o - p_e) / (1 - p_e);
        return cohen_kappa_score;
      }
    }
    return null;
  }
}

export default ConfusionMatrix;
