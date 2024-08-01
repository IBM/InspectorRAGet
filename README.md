# InspectorRAGet

InspectorRAGet, an introspection platform for RAG evaluation. InspectorRAGet allows the user to analyze aggregate and instance-level performance of RAG systems, using both human and algorithmic metrics as well as annotator quality.

## 🎥 Demo
[![InspectorRAGet on the case!](https://img.youtube.com/vi/MJhe8QIXcEc/0.jpg)](https://www.youtube.com/watch?v=MJhe8QIXcEc)

InspectorRAGet is a a [React](https://react.dev/) web application built with [NextJS 14](https://nextjs.org/) framework. We extensively use the [Carbon Design System](https://carbondesignsystem.com/), an open-source design system with a wide range of assets including react and web components, styling guidelines,
custom icons, and others

## 🏗️ Build & Deploy
### Installation
We use yarn as a default package manager. 

```shell
yarn install
```
⚠️ node version must be `20.12.0` or higher.

### Development server
To start InspectorRAGet in development mode, please run the following command.

```shell
yarn dev
```

### Build
To build a static production bundle, please run the following command.
```shell
yarn dev
```

### Production server
To start InspectorRAGet in production mode, please run the following command.
```shell
yarn start
```

##  Usage

Once you've started the InspectorRAGet application, then next step is to format experiment results in a prescribed format. 

The experiment result file can be broadly split into six sections along the functional boundaries. The first section captures general details about the experiment in `name`, `description` and `timestamp` fields. The second and third sections describe the
sets of models and metrics used in the experiment via the `models` and `metrics` fields, respectively. The last three sections cover the dataset and the outcome of evaluation experiment in the form of `documents`, `tasks` and `evaluations` fields.

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
                  "task_type": "rag",
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
                              "text": "Sample response"
                        }
                  ]
            },
            {
                  "task_id": "task_2",
                  "task_type": "rag",
                  "category": "random",
                  "input": [
                        {
                              "speaker": "user", 
                              "text": "Hello"
                        }
                  ],
                  "contexts": [
                        {
                              "document_id": "GUID 2"
                        }
                  ],
                  "targets": [
                        {
                              "text": "How can I help you?"
                        }
                  ]
            }
      ],
```
Notes: 

1. Each task must have a unique `task_id`.
2. Task type can be of `question_answering`, `conversation`, or of `rag` type.
3. `input` is an array of utterances. An utterance's speaker could be either `user` or `agent`. Each utterance must have a `text` field.
4. `contexts` field represents a subset of documents from the `documents` field relevant to the `input` and is available to the generative models. 
5. `targets` field is an array of expected gold or reference texts. 
6. `category` is an optional field that represents the type of task for grouping similar tasks.
7. `filters` is a top-level field (parallel to `tasks`) which specifies an array of fields defined inside `tasks` for filtering tasks during analysis. 

#### 6. Evaluations

```json
"evaluations": [
      {
            "task_id": "task_1 | task_2",
            "model_id": "model_1 | model_2",
            "model_response": "Model response",
            "annotations": {
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
                  },
            }
      }
]
```
Notes:

1. `evaluations` field must contain evaluation for every model defined in `models` section and on every task in `tasks` section. Thus, total number of evaluations is equal to number of models (M) X number of tasks (T) = M X T
2. Each evaluation must be associated with single task and single model.
3. Each evaluation must have model prediction on a task captured in the `model_response` field. 
4. `annotations` field captures ratings on the model for a given task and for every metric specified in the `metrics` field.
5. Each metric annotation is a dictionary containing worker ids as keys. In the example above, `system` is a worker id. 
6. Annotation from any worker on all metrics must be in the form of a dictionary. At minimum, such dictionary contains `value` key capturing model's rating for the metric by the worker. 

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
