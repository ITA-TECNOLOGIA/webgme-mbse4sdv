# Migrating projects from the pre-release tool

Projects created with the pre-release version of the tool store old component identifiers (visualizer,
decorator and plugin ids). These scripts convert such projects so they work with MBSE4SDV, **without changing
the meta-model or the model structure**. They were used to produce the seeds in [`src/seeds`](../../src/seeds).

What changes (see [`rename-map.json`](rename-map.json)):

- registry `validVisualizers`, `decorator`, `validPlugins`: old ids renamed, removed plugins dropped;
- registry keys of the interaction visualizer (`itac4evSrcPort`, ...) renamed;
- the obsolete `isAudio` flag removed from attribute definitions;
- library info: the owner in the origin project id replaced by `mbse4sdv`.
- icons of image files that are no longer distributed (`SVGIcon` registry, `pathimage` attribute) replaced by
  Material Design icons; nodes of the `hfsm` library keep their icons.

The same changes are applied inside libraries (also nested ones). After committing, the script compares every
node of the result with the source (GUID, base, attributes, registry, meta, pointers, sets, children) and fails
if anything other than the renames differs.

## Usage

```bash
export MONGO_URI=mongodb://127.0.0.1:27017/mbse4sdv

# 1. import the old package
node node_modules/webgme-engine/src/bin/import.js old-project.webgmex -p OldProject -u <user>

# 2. migrate into a new project (the source is not modified); --from is optional but much faster
node scripts/migration/migrate-legacy-project.js <user>+OldProject NewProject --user <user> --from old-project.webgmex

# 3. (optional) export it as a seed of this application
node scripts/migration/export-seed.js <user>+NewProject NewProject --user <user>
```

`scripts/analyze-project.js <owner+project>` prints libraries, meta types, legacy identifiers and values that may
contain personal or project-specific data; use it to review a project before publishing it.
