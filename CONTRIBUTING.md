# Contributing

Contributions are welcome: bug reports, documentation, metamodel improvements, visualisers and plugins.

1. Open an issue describing the problem or the proposal before large changes.
2. Fork the repository and create a branch from `main`.
3. Follow the structure of a WebGME application (`webgme-app/src/plugins`, `visualizers`, `decorators`,
   `routers`, `seeds`) and avoid changes to the WebGME core; if unavoidable, update
   `webgme-app/patches` and [webgme-app/PATCHES.md](webgme-app/PATCHES.md).
4. Check that the application starts with `docker compose up --build` and that the example project opens.
5. Open a pull request explaining what changes and why.

Code, comments and documentation are written in English. By contributing you agree that your contribution is
licensed under the [MIT License](LICENSE).
