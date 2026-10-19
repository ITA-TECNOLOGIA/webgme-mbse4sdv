# WebGME core patches

MBSE4SDV is built as a WebGME application on top of the **unmodified** `webgme` npm package.
Everything is implemented as WebGME components (plugins, decorators, visualizers, styles) except the
small set of changes below, which cannot be done from outside the core.

They are kept in [`patches/webgme+2.43.0.patch`](patches/webgme+2.43.0.patch) and applied automatically by
[patch-package](https://github.com/ds300/patch-package) on `npm install`. Because WebGME serves a pre-built
client bundle, `postinstall` then rebuilds it ([`scripts/build-webgme-dist.js`](scripts/build-webgme-dist.js)).
Every patched line is marked with `[MBSE4SDV]`.

| # | Change | Files | Why it needs the core |
|---|--------|-------|-----------------------|
| 1 | Show `(instance <prototype>)` after the name of nodes that are instances of a non-meta prototype | `js/Utils/DisplayFormat.js`, `decorators/ModelDecorator/Core/ModelDecorator.Core.js`, `decorators/SVGDecorator/Core/SVGDecorator.Core.js`, `js/Panels/ObjectBrowser/TreeBrowserControl.js` | The default decorators and the tree browser are core components used by every model. |
| 2 | Double-clicking an instance of a non-meta prototype opens the prototype | `js/Panels/ModelEditor/ModelEditorControl.DiagramDesignerWidgetEventHandlers.js` | Core Composition (ModelEditor) visualizer behaviour. |
| 3 | When the tree root is loaded, the active node is revealed in the tree | `js/Widgets/TreeBrowser/TreeBrowserWidget.js`, `js/Panels/ObjectBrowser/TreeBrowserControl.js` | Core tree browser behaviour. |

All three are generic improvements and are candidates to be proposed upstream to
[webgme/webgme](https://github.com/webgme/webgme), after which this file and the patch can be removed.

## Updating the patch

```bash
# edit the files under node_modules/webgme/src/client, then:
npx patch-package webgme --exclude "^package\.json$|src/client/bower_components/|src/client/dist/"
node scripts/build-webgme-dist.js
```

## Changes from the original fork that are no longer core changes

| Original core change | Now |
|----------------------|-----|
| Theme colours, toolbar, project navigator, visualizer list, part browser sizing (CSS) | [`src/styles/mbse4sdv-theme.css`](src/styles/mbse4sdv-theme.css), loaded via `gmeConfig.visualization.extraCss` |
| `DiagramDesignerWidget.addRegions/addBackground` | Implemented in the app widgets (`ScenarioEditorWidget`, `DiagramDesignerImageWidget`) |
| `SVGDecorator` "htmlEngine" option | `mbse4sdvSVGHTMLDecorator` overrides `_updateName` |
| `NodePropertyNames.Attributes.type` | Literal attribute name in the Kanban visualizer |
| Plugin results dialog: inline / new-window traceability matrix | The traceability plugin also returns the matrix as an HTML artifact (`traceability-matrix.html`) |
| Image/zoom DiagramDesigner variants added inside core folders | `src/visualizers/widgets/DiagramDesignerImage` |
| `html2canvas` path in `main.js` | `gmeConfig.requirejsPaths` |

## Removed

- Audio attribute (`isAudio`) and speech-to-text recording widget.
- `config` attribute type editor in the property grid (`ConfigJsonWidget`); the Excel visualizer still
  finds its configuration attribute by its meta type.
- Project branding (logos, EU emblem in the footer) and debugging leftovers (`console.log`, commented code).
