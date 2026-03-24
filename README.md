# InspectorRAGet

InspectorRAGet is an introspection platform for evaluating LLM-based systems. It lets researchers upload evaluation result files and explore aggregate and instance-level performance across models, metrics, and annotators. It supports retrieval-augmented generation (RAG), text generation, multi-turn conversation, function-calling, and agentic task evaluation.

InspectorRAGet is built with [React](https://react.dev/), [Next.js 16](https://nextjs.org/), and the [IBM Carbon Design System](https://carbondesignsystem.com/).

## Demo

[![InspectorRAGet on the case!](https://img.youtube.com/vi/vB7mJnSNx7s/0.jpg)](https://www.youtube.com/watch?v=vB7mJnSNx7s)

## Build and Deploy

### Requirements

Node.js >= 24.0.0

### Installation

```shell
npm install
```

### Development server

```shell
npm run dev
```

### Production build

```shell
npm run build
```

### Production server

```shell
npm start
```

## Usage

Once InspectorRAGet is running, import a JSON file with evaluation results. Two paths are available:

- Use one of the [integration notebooks](#integration-notebooks) to convert output from a popular evaluation framework.
- Manually convert your results using the [file format reference](#file-format-reference) below.

## Integration Notebooks

The notebooks below show how to run an evaluation experiment with a popular framework and transform its output into the format InspectorRAGet expects.

| Framework                         | Description                                     | Notebook                                                                     |
| --------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Language Model Evaluation Harness | General-purpose LM evaluation framework         | [LM_Eval_Demonstration.ipynb](notebooks/LM_Eval_Demonstration.ipynb)         |
| Ragas                             | LLM-as-a-judge evaluation for RAG systems       | [Ragas_Demonstration.ipynb](notebooks/Ragas_Demonstration.ipynb)             |
| HuggingFace                       | Datasets, models, and metric evaluators for RAG | [HuggingFace_Demonstration.ipynb](notebooks/HuggingFace_Demonstration.ipynb) |

## Benchmark Converters

Stand-alone Python converters for specific benchmarks live in the `converters/` directory.

| Benchmark                | Task type      | Converter                            |
| ------------------------ | -------------- | ------------------------------------ |
| BFCL v3/v4 (single-turn) | `tool_calling` | [converters/bfcl/](converters/bfcl/) |
| BFCL v3/v4 (multi-turn)  | `agentic`      | [converters/bfcl/](converters/bfcl/) |

## File Format Reference

The JSON file InspectorRAGet accepts is structured in six sections. Examples are in the [`data/`](data/) directory.

### 1. Metadata

```json
{
  "schema_version": 2,
  "name": "My experiment",
  "description": "Optional description",
  "timestamp": 1700000000
}
```

### 2. Models

```json
"models": [
  { "model_id": "model_a", "name": "Model A", "owner": "Owner A" },
  { "model_id": "model_b", "name": "Model B", "owner": "Owner B" }
]
```

Each model must have a unique `model_id` and `name`.

### 3. Metrics

```json
"metrics": [
  {
    "name": "accuracy",
    "display_name": "Accuracy",
    "description": "Fraction of correct answers",
    "author": "algorithm",
    "type": "numerical",
    "aggregator": "average",
    "range": [0, 1, 0.1]
  },
  {
    "name": "quality",
    "display_name": "Quality",
    "author": "human",
    "type": "categorical",
    "aggregator": "majority",
    "values": [
      { "value": "poor",       "display_value": "Poor",       "numeric_value": 0 },
      { "value": "acceptable", "display_value": "Acceptable", "numeric_value": 1 },
      { "value": "good",       "display_value": "Good",       "numeric_value": 2 }
    ]
  },
  {
    "name": "error_detail",
    "display_name": "Error Detail",
    "author": "algorithm",
    "type": "text"
  }
]
```

Notes:

1. Each metric must have a unique `name`.
2. `type` is one of `numerical`, `categorical`, or `text`.
3. Numerical metrics require a `range` field in `[start, end, bin_size]` format. Values below `start` are grouped into a `<start` bin and values above `end` into a `>end` bin, so outliers never create unbounded individual bars in the distribution chart.
4. Categorical metrics require a `values` array. Every entry must have a `value` (string label) and a `numeric_value` (number). Assign values so that higher means better (e.g. `poor=0, good=2`). The platform uses `numeric_value` for aggregation, sorting, and chart scaling.
5. Text metrics appear only in the instance view and are excluded from aggregate statistics.

### 4. Documents

```json
"documents": [
  { "document_id": "doc-1", "text": "Document text", "title": "Optional title" }
]
```

Each document must have a unique `document_id` and a `text` field. Documents are referenced from task `contexts`.

### 5. Tasks

The `task_type` field determines how a task is displayed and what fields are expected.

```json
"filters": ["category"],
"tasks": [
  {
    "task_id": "task-1",
    "task_type": "qa",
    "category": "factual",
    "input": [{ "role": "user", "content": "What is the capital of France?" }],
    "contexts": [{ "document_id": "doc-1" }],
    "targets": [{ "type": "text", "value": "Paris" }]
  },
  {
    "task_id": "task-2",
    "task_type": "generation",
    "input": [{ "role": "user", "content": "Summarise this document." }],
    "targets": [{ "type": "text", "value": "Expected summary..." }]
  },
  {
    "task_id": "task-3",
    "task_type": "rag",
    "input": [
      { "role": "user",      "content": "First question" },
      { "role": "assistant", "content": "First answer" },
      { "role": "user",      "content": "Follow-up question" }
    ],
    "contexts": [{ "document_id": "doc-1" }],
    "targets": [{ "type": "text", "value": "Expected answer" }]
  },
  {
    "task_id": "task-4",
    "task_type": "tool_calling",
    "input": [{ "role": "user", "content": "What is the weather in Paris?" }],
    "tools": [
      {
        "name": "get_weather",
        "description": "Get current weather for a city",
        "parameters": {
          "type": "object",
          "properties": {
            "city": { "type": "string", "description": "City name" }
          },
          "required": ["city"]
        }
      }
    ],
    "targets": [
      {
        "type": "tool_calls",
        "calls": [{ "id": "c1", "name": "get_weather", "arguments": { "city": "Paris" } }]
      }
    ]
  },
  {
    "task_id": "task-5",
    "task_type": "agentic",
    "input": [{ "role": "user", "content": "Book a flight from NYC to London on June 10." }],
    "contexts": [{ "document_id": "policy-doc-1" }],
    "tools": [
      { "name": "search_flights", "description": "Search available flights", "parameters": { "type": "object", "properties": { "origin": { "type": "string" }, "destination": { "type": "string" }, "date": { "type": "string" } }, "required": ["origin", "destination", "date"] } },
      { "name": "book_flight",    "description": "Book a selected flight",   "parameters": { "type": "object", "properties": { "flight_id": { "type": "string" } }, "required": ["flight_id"] } }
    ],
    "targets": [{ "type": "state", "value": { "booking_confirmed": true, "flight_date": "2025-06-10" } }]
  }
]
```

**Task types:**

| Type           | Description                              | `input`                                  | `targets`                                               |
| -------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `qa`           | Single-turn retrieval QA                 | `Message[]` (one user message)           | `{ type: "text", value }`                               |
| `generation`   | Text or structured generation            | `Message[]` (one user message)           | `{ type: "text", value }`                               |
| `rag`          | Multi-turn retrieval conversation        | `Message[]` (alternating user/assistant) | `{ type: "text", value }`                               |
| `tool_calling` | Single-turn function-calling prediction  | `Message[]`                              | `{ type: "tool_calls", calls, alternatives? }`          |
| `agentic`      | Goal-directed multi-turn agent execution | `Message[]` (goal as last user message)  | `{ type: "state", value }` or `{ type: "text", value }` |

All `input` arrays use OpenAI-compatible message objects: `{ "role": "user"|"assistant"|"tool"|"system", "content": "..." }`. Assistant messages may include `"tool_calls"` and tool messages must include `"tool_call_id"`.

The `filters` array (parallel to `tasks`) names task fields to expose as filter controls during analysis.

### 6. Results

```json
"results": [
  {
    "task_id": "task-1",
    "model_id": "model_a",
    "output": [
      { "role": "assistant", "content": "Paris" }
    ],
    "scores": {
      "accuracy": { "system": { "value": 1.0 } },
      "quality":  { "annotator_1": { "value": "good" } }
    }
  },
  {
    "task_id": "task-4",
    "model_id": "model_a",
    "output": [
      {
        "role": "assistant",
        "tool_calls": [{ "id": "c1", "name": "get_weather", "arguments": { "city": "Paris" } }]
      }
    ],
    "scores": {
      "accuracy": { "system": { "value": 1.0 } }
    }
  },
  {
    "task_id": "task-5",
    "model_id": "model_a",
    "output": [
      { "role": "assistant", "tool_calls": [{ "id": "c1", "name": "search_flights", "arguments": { "origin": "JFK", "destination": "LHR", "date": "2025-06-10" } }] },
      { "role": "tool", "tool_call_id": "c1", "content": "[{\"flight_id\": \"BA112\", \"price\": 450}]" },
      { "role": "assistant", "tool_calls": [{ "id": "c2", "name": "book_flight", "arguments": { "flight_id": "BA112" } }] },
      { "role": "tool", "tool_call_id": "c2", "content": "{\"booking_confirmed\": true}" },
      { "role": "assistant", "content": "Your flight has been booked." }
    ],
    "scores": {
      "task_success": { "system": { "value": 1.0 } }
    }
  }
]
```

Notes:

1. `results` must contain one entry for every (model, task) pair. Total entries equal number of models times number of tasks.
2. `output` is an array of `Message` objects.
   - For `qa`, `generation`, `rag`, and `tool_calling` tasks this is a single-element array containing the model's response.
   - For `agentic` tasks this is the full execution thread: interleaved `assistant`, `tool`, and `user` messages in turn order.
   - Assistant messages may optionally carry `"steps"` (thinking/execution trace) and `"retries"` (rejected attempts before the final output).
3. `scores` contains per-metric ratings. Each metric entry is a map from evaluator or annotator ID to `{ "value": <number or string> }`.

## Citation

If you use InspectorRAGet in your research, please cite our paper:

```
@inproceedings{fadnis-etal-2025-inspectorraget,
    title = "{I}nspector{RAG}et: An Introspection Platform for {RAG} Evaluation",
    author = "Fadnis, Kshitij P  and
      Patel, Siva Sankalp  and
      Boni, Odellia  and
      Katsis, Yannis  and
      Rosenthal, Sara  and
      Sznajder, Benjamin  and
      Danilevsky, Marina",
    editor = "Dziri, Nouha  and
      Ren, Sean (Xiang)  and
      Diao, Shizhe",
    booktitle = "Proceedings of the 2025 Conference of the Nations of the Americas Chapter of the Association for Computational Linguistics: Human Language Technologies (System Demonstrations)",
    month = apr,
    year = "2025",
    address = "Albuquerque, New Mexico",
    publisher = "Association for Computational Linguistics",
    url = "https://aclanthology.org/2025.naacl-demo.13/",
    doi = "10.18653/v1/2025.naacl-demo.13",
    pages = "125--134",
    ISBN = "979-8-89176-191-9",
    abstract = "Large Language Models (LLM) have become a popular approach for implementing Retrieval Augmented Generation (RAG) systems, and a significant amount of effort has been spent on building good models and metrics. In spite of increased recognition of the need for rigorous evaluation of RAG systems, few tools exist that go beyond the creation of model output and automatic calculation. We present InspectorRAGet, an introspection platform for performing a comprehensive analysis of the quality of RAG system output. InspectorRAGet allows the user to analyze aggregate and instance-level performance of RAG systems, using both human and algorithmic metrics as well as annotator quality. InspectorRAGet is suitable for multiple use cases and is available publicly to the community.A live instance of the platform is available at https://ibm.biz/InspectorRAGet"
}
```
