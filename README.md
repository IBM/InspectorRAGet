# InspectorRAGet

InspectorRAGet, an introspection platform for LLM-based system evaluation. InspectorRAGet allows the user to analyze aggregate and instance-level performance of RAG systems, text generation models, and chat/tool-calling systems, using both human and algorithmic metrics as well as annotator quality.

InspectorRAGet has been developed as a [React](https://react.dev/) web application built with [NextJS 14](https://nextjs.org/) framework and the [Carbon Design System](https://carbondesignsystem.com/).

## 🎥 Demo

[![InspectorRAGet on the case!](https://img.youtube.com/vi/vB7mJnSNx7s/0.jpg)](https://www.youtube.com/watch?v=vB7mJnSNx7s)

## 🏗️ Build & Deploy

To install and run InspectorRAGet follow the steps below:

### Installation

```shell
npm install
```

⚠️ node version must be `24.0.0` or higher.

### Development server

To start InspectorRAGet in development mode, please run the following command.

```shell
npm run dev
```

### Build

To build a static production bundle, please run the following command.

```shell
npm run build
```

### Production server

To start InspectorRAGet in production mode, please run the following command.

```shell
npm start
```

## Usage

Once you have started InspectorRAGet, the next step is import a json file with the evaluation results in the format expected by the platform. You can do this in two ways:

- Use one of our [integration notebooks](#use-inspectorraget-through-integration-notebooks), showing how to use InspectorRAGet in combination with popular evaluation frameworks.
- Manually convert the evaluation results into the expected format by consulting the [documentation of InspectorRAGet's file format](#use-inspectorraget-by-manually-creating-input-file).

## Use InspectorRAGet through integration notebooks

To make it easier to get started, we have created notebooks showcasing how InspectorRAGet can be used in combination with popular evaluation frameworks. Each notebook demonstrates how to use the corresponding framework to run an evaluation experiment and transform its output to the input format expected by InspectorRAGet for analysis. We provide notebooks demonstrating integrations of InspectorRAGet with the following popular frameworks:

| Framework                         | Description                                                                                                                          | Integration Notebook                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Language Model Evaluation Harness | Popular evaluation framework used to evaluate language models on different tasks                                                     | [LM_Eval_Demonstration.ipynb](notebooks/LM_Eval_Demonstration.ipynb)         |
| Ragas                             | Popular evaluation framework specifically designed for the evaluation of RAG systems through LLM-as-a-judge techniques               | [Ragas_Demonstration.ipynb](notebooks/Ragas_Demonstration.ipynb)             |
| HuggingFace                       | Offers libraries and assets (incl. datasets, models, and metric evaluators) that can be used to both create and evaluate RAG systems | [HuggingFace_Demonstration.ipynb](notebooks/HuggingFace_Demonstration.ipynb) |

## Use InspectorRAGet by manually creating input file

If you want to use your own code/framework, not covered by the integration notebooks above, to run the evaluation, you can manually transform the evaluation results to the input format expected by InspectorRAGet, described below. Examples of input files in the expected format can be found in the [data](data) folder.

The experiment results json file expected by InspectorRAGet can be broadly split into six sections along their functional boundaries. The first section captures general details about the experiment in `name`, `description` and `timestamp` fields. The second and third sections describe the sets of models and metrics used in the experiment via the `models` and `metrics` fields, respectively. The last three sections cover the dataset and the outcome of the evaluation experiment in the form of `documents`, `tasks` and `results` fields.

#### 1. Metadata

```json
{
    "name": "Sample experiment name",
    "description": "Sample example description",
    ...
```

#### 2. Models

```json
    "models": [
      {
        "model_id": "model_1",
        "name": "Model 1",
        "owner": "Model 1 owner",
      },
      {
        "model_id": "model_2",
        "name": "Model 2",
        "owner": "Model 2 owner",
      }
    ],
```

Notes:

1. Each model must have a unique `model_id` and `name`.

#### 3. Metrics

```json
      "numerical": [
            {
            "name": "metric_a",
            "display_name": "Metric A",
            "description": "Metric A description",
            "author": "algorithm | human",
            "type": "numerical",
            "aggregator": "average",
            "range": [0, 1, 0.1]
            },
            {
            "name": "metric_b",
            "display_name": "Metric B",
            "description": "Metric B description",
            "author": "algorithm | human",
            "type": "categorical",
            "aggregator": "majority | average",
            "values": [
                  {
                        "value": "value_a",
                        "display_value": "A",
                        "numeric_value": 1
                  },
                  {
                        "value": "value_b",
                        "display_value": "B",
                        "numeric_value": 0
                  }
                ]
            },
            {
            "name": "metric_c",
            "display_name": "Metric C",
            "description": "Metric C description",
            "author": "algorithm | human",
            "type": "text"
            }
      ],
```

Notes:

1. Each metric must have a unique name.
2. Metric can be of `numerical`, `categorical`, or `text` type.
3. Numerical type metrics must specify `range` field in `[start, end, bin_size]` format.
4. Categoricl type metrics must specify `values` field where each value must have `value` and `numerical_value` fields.
5. Text type metric are only accesible in instance level view and not used in any experiment level aggregate statistics and visual elements.

#### 4. Documents

```json
      "documents": [
            {
                  "document_id": "GUID 1",
                  "text": "document text 1",
                  "title": "document title 1"
            },
            {
                  "document_id": "GUID 2",
                  "text": "document text 2",
                  "title": "document title 2"
            },
            {
                  "document_id": "GUID 3",
                  "text": "document text 3",
                  "title": "document title 3"
            }
      ],
```

Notes:

1. Each document must have a unique `document_id` field.
2. Each document must have a `text` field.

#### 5. Tasks

```json
      "filters": ["category"],
      "tasks": [
            {
                  "task_id": "task_1",
                  "task_type": "qa",
                  "category": "grounded",
                  "input": [
                        {
                              "speaker": "user",
                              "text": "Sample user query"
                        }
                  ],
                  "contexts": [
                        {
                              "document_id": "GUID 1"
                        }
                  ],
                  "targets": [
                        {
                              "type": "text",
                              "value": "Sample response"
                        }
                  ]
            },
            {
                  "task_id": "task_2",
                  "task_type": "generation",
                  "category": "random",
                  "input": [
                        {
                              "speaker": "user",
                              "text": "Hello"
                        }
                  ],
                  "targets": [
                        {
                              "type": "text",
                              "value": "How can I help you?"
                        }
                  ]
            }
      ],
```

Notes:

1. Each task must have a unique `task_id`.
2. Task type can be `qa` (single-turn retrieval QA), `generation` (text/JSON generation), `rag` (multi-turn retrieval conversation), or `tool_calling` (function-calling evaluation).
3. For `qa`, `generation`, and `rag` tasks, `input` is an array of utterances where each utterance has a `speaker` (`user` or `agent`) and a `text` field.
4. For `tool_calling` tasks, `input` must be an array of messages following the OpenAI chat completion format.
5. For `qa` and `rag` tasks, the `contexts` field is an array of document references (subset of `documents`) available to the model.
6. `targets` is an array of expected outputs. Each target is a typed object: `{ "type": "text", "value": "..." }` for text outputs, or `{ "type": "tool_calls", "calls": [...] }` for tool-calling ground truth.
7. `category` is an optional field for grouping similar tasks.
8. `filters` is a top-level field (parallel to `tasks`) specifying an array of task fields to expose as filters during analysis.

#### 6. Results

```json
"results": [
      {
            "task_id": "task_1 | task_2",
            "model_id": "model_1 | model_2",
            "output": {
                  "type": "text",
                  "value": "Model response text"
            },
            "scores": {
                  "metric_a": {
                        "system": {
                              "value": 0.233766233766233
                        }
                  },
                  "metric_b": {
                        "system": {
                              "value": "value_a | value_b"
                        }
                  },
                  "metric_c": {
                        "system": {
                              "value": "text"
                        }
                  }
            }
      }
]
```

Notes:

1. `results` must contain one entry for every model defined in `models` and every task in `tasks`. Total number of results equals number of models (M) × number of tasks (T).
2. Each result must be associated with a single task and a single model.
3. `output` is a typed object representing the model's response. For text responses use `{ "type": "text", "value": "..." }`. For tool-calling tasks use `{ "type": "tool_calls", "calls": [...] }`.
4. `scores` captures ratings for the model on a given task, for every metric specified in the `metrics` field.
5. Each metric score is a dictionary with evaluator/worker IDs as keys. In the example above, `system` is the worker ID for an automated scorer.
6. Each per-worker score must be a dictionary containing at minimum a `value` key with the numeric or categorical rating.

## Citation

If you use InspectorRAGet in your research, please cite our paper:

```
@misc{fadnis2024inspectorraget,
      title={InspectorRAGet: An Introspection Platform for RAG Evaluation},
      author={Kshitij Fadnis and Siva Sankalp Patel and Odellia Boni and Yannis Katsis and Sara Rosenthal and Benjamin Sznajder and Marina Danilevsky},
      year={2024},
      eprint={2404.17347},
      archivePrefix={arXiv},
      primaryClass={cs.SE}
}
```
