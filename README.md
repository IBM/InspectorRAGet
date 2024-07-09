
# Emotional AI Project
### by: MOCavada
[![User App In-Development](https://maap.one)]

## Overview

The Emotional AI project aims to create a comprehensive platform for introspection and emotional analysis. The project is structured to serve multiple purposes, including acting as an API server, providing an admin UI for data management and analysis, and planning for future expansion to include a cross-platform mobile version for public users.

## Why We Are Using IBM InspectorRAGet as Our Base for Building Our Own AI Data Model

**1. Proven Framework and Tools:**
   IBM InspectorRAGet is a robust platform designed specifically for the introspection and evaluation of Retrieval-Augmented Generation (RAG) models. Its advanced framework provides tools for performance benchmarking, combined aggregate and instance-level analysis, and offers a holistic view of results through various metrics. This ensures a solid foundation for developing and refining our AI models.

**2. Advanced Metrics and Evaluation:**
   InspectorRAGet enables detailed performance benchmarking and comprehensive evaluation techniques, which are crucial for identifying the strengths and weaknesses of our AI models. These capabilities help in targeting improvements more accurately and achieving better results.

**3. Customizable and Scalable:**
   The platform’s modular and scalable design allows for extensive customization to meet specific project requirements. This flexibility ensures that we can tailor the tool to fit the unique needs of our introspection and AI data model development.

**4. Integration Capabilities:**
   InspectorRAGet’s ability to integrate with other tools and platforms allows for seamless incorporation into our broader AI development ecosystem. This integration is essential for creating comprehensive AI solutions that leverage multiple data sources and tools efficiently.

**5. Community and Support:**
   As an IBM product, InspectorRAGet benefits from extensive community support and detailed documentation. This support is invaluable for troubleshooting, learning best practices, and staying updated with the latest advancements in AI and machine learning.

### Official Description of IBM InspectorRAGet

> "An introspection Platform for RAG Evaluation enabling performance benchmarking, a combined aggregate and instance-level analysis, a holistic view of results via a mix of metrics, annotator qualification, and dataset characterization. Our goal is to help accelerate the transition from idea to product."

### Additional Benefits

- **Data Management**: Robust data management features ensure efficient and secure handling of data.
- **Performance Benchmarking**: Enables detailed performance benchmarking, critical for developing high-quality AI models.
- **Holistic Analysis**: Provides a holistic analysis of AI models, leading to more comprehensive and reliable results.

### Conclusion

Using IBM InspectorRAGet as the base for building our AI data model offers significant advantages, including a proven framework, advanced metrics, scalability, integration capabilities, and strong community support. These benefits make it an ideal foundation for developing a sophisticated and effective AI solution.

For more information, refer to the [IBM InspectorRAGet documentation](https://www.ibm.com/docs/en).

## Project Structure

### Current Components

1. **API Server and Admin UI**:
   - **API Server**: The current `emotional AI` app serves as the backend API server, providing endpoints for data management, user authentication, and other necessary backend services.
   - **Admin UI**: This application includes an admin UI for managing and analyzing data, built using the `@carbon/themes` library.

### Future Components

2. **Public Web App**:
   - A future project will be initiated for the public-facing web app, utilizing UI libraries like Tailwind CSS or `schadcdn/ui` to design the user interface.
   
3. **Mobile App**:
   - A cross-platform mobile app will be developed using frameworks such as React Native or Flutter, ensuring optimized mobile experiences for public users.

## Benefits

- **Separation of Concerns**: Keeping the admin UI and the public-facing UI separate allows for tailored interfaces for each audience without unnecessary complexity.
- **Scalability**: The backend API can serve multiple clients (admin UI, public web app, mobile app), making the architecture scalable.
- **Flexibility**: Different UI libraries can be used for different parts of the project, providing flexibility in tool choice.
- **Maintainability**: Separation of the admin and public interfaces makes the codebase easier to maintain and update.

## Implementation Steps

### API Server

- Ensure the backend (currently part of the `emotional AI` app) is designed as a RESTful API or GraphQL API.
- Secure the API with authentication and authorization mechanisms.

### Admin UI

- Build the admin interface using `@carbon/themes` within the same application.
- Implement features for data management and analysis accessible only to authorized admin users.

### Public Web App

- Start a new project for the public-facing web app.
- Use Tailwind CSS or `schadcdn/ui` to design the UI.
- Connect the web app to the backend API for data and user interactions.

### Mobile App

- Plan for a future cross-platform mobile app using frameworks like React Native or Flutter.
- Ensure the mobile app interacts with the same backend API for a consistent user experience across platforms.

## Example Directory Structure

```plaintext
emotional-AI/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── ...
├── admin-ui/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── Dockerfile
│   └── ...
├── public-web-app/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
├── mobile-app/
│   ├── src/
│   ├── android/
│   ├── ios/
│   ├── package.json
│   └── ...
└── docker-compose.yml
```

## Summary

This approach maintains a clear separation between the API server, admin UI, and public-facing applications. It allows for the use of different UI libraries and frameworks as needed, providing flexibility and scalability for the project.

By structuring your project this way, you can ensure clean separation of concerns, scalability, flexibility in UI design, and maintainability of the codebase.


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
