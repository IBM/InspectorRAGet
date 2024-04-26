# Change Log

## v1.0 (2024-04-26)


### 🚀 Release Highlight

- InspectorRAGet has gone open source! https://github.com/IBM/InspectorRAGet
 
### 💅 Features


- Functionality - Supported Evaluations: InspectorRAGet supports any human and automatic evaluations in a unified interface, from numerical metrics such as F1 and Rouge-L, to LLM-as-a-judge metrics such as faithfulness or answer relevance, to any human evaluation metrics, whether numerical or categorical.
- Integration - Experiment Runner: Python notebook demonstrating how to run experiments using Hugging Face assets (datasets, models, and metric evaluators) and output the results in the JSON format expected by InspectorRAGet
- Functionality - Input Validator: Validate input file on load and return informative error messages if any data is missing or incorrectly formatted
- Views - Data Characteristics: New view! Displays several informative visualizations of the input data
- Views - Predictions: New view! Sortable list of the input text and all corresponding model responses, filterable on all available data enrichments
- Views - Performance Overview: Aggregate values show mean, std and agreement levels, for all human and automatic metrics
  - Functionality - Aggregate: Aggregator function can be specified for each metric independently
- Views - Model Behavior: Filter evaluations on any available enrichments and analyze per-metric performance across all models; display a sortable and filtered table of all tasks, with access to ever tasks Detail view
- Views - Task Detail: Examine all detailed task information including the context(s), input text, all model outputs, and all evaluation metric values
  - Functionality - Sympathetic Highlighting: In the Task Detail view, click to highlight the common text between the response and the context(s)
  - Functionality - Annotate: In the Task Detail view, flag a task instance, or add comments to individual components, which will persist for the rest of the session
  - Functionality - Copy to Clipboard: In the Task Detail view, instantly copy all individual task detail information in text, JSON or LaTeX format
- Views - Model Comparator: Calculate statistical similarity between the distributions of two models on a given metric; display a table of all tasks with different model aggregate scores, with access to every task's Detail view
- Views - Metric Behavior: Show correlations of any selected metrics, optionally for a subset of all models, to provide insights on metric definitions and relationships
- Functionality - Export: Export the evaluation file, including all new annotations of comments and flag, to save your enriched file for future analysis
- Functionality - Dark Mode: Switch the entire UI to dark mode!
