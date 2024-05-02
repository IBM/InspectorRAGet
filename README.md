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
