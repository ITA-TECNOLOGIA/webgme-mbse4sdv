/*jshint node: true*/
// Registers the MBSE4SDV components on top of the unmodified WebGME configuration.
'use strict';

var path = require('path'),
    config = require('webgme/config/config.default'),
    root = path.join(__dirname, '..'),
    hfsm = path.join(root, 'node_modules/webgme-hfsm');

// Plugins
config.plugin.basePaths.push(path.join(root, 'src/plugins'));
config.plugin.basePaths.push(path.join(hfsm, 'src/plugins'));

// REST routers
config.rest.components.Mbse4sdvApi = {
    src: path.join(root, 'src/routers/Mbse4sdvApi/Mbse4sdvApi.js'),
    mount: 'mbse4sdv/api',
    options: {}
};

// Seeds (offered when creating a new project)
['SdvMeta', 'HfsmMeta', 'Mbse4sdvExample'].forEach(function (seed) {
    config.seedProjects.basePaths.push(path.join(root, 'src/seeds', seed));
});
config.seedProjects.defaultProject = 'SdvMeta';

// Decorators
config.visualization.decoratorPaths.push(path.join(root, 'src/decorators'));
config.visualization.decoratorPaths.push(path.join(hfsm, 'src/decorators'));

// Visualizers
config.visualization.panelPaths.push(path.join(root, 'src/visualizers/panels'));
config.visualization.panelPaths.push(path.join(hfsm, 'src/visualizers/panels'));
config.visualization.panelPaths.push(path.join(root, 'node_modules/webgme-codeeditor/src/visualizers/panels'));
config.visualization.visualizerDescriptors.push(path.join(root, 'src/visualizers/Visualizers.json'));

// Look & feel (loaded after the core styles)
config.visualization.extraCss.push('mbse4sdv-styles/mbse4sdv-theme');

// SVG icons (the folder name is part of the icon path stored in the models: svgs/... from webgme-hfsm,
// material-design/...)
config.visualization.svgDirs.push(path.join(root, 'src/material-design'));
config.visualization.svgDirs.push(path.join(hfsm, 'src/svgs'));

// Client-side module paths (served by webgme under /extlib, relative to the app root)
config.requirejsPaths.panels = './src/visualizers/panels';
config.requirejsPaths.widgets = './src/visualizers/widgets';
config.requirejsPaths.mbse4sdv = './src/common/mbse4sdv';
config.requirejsPaths['mbse4sdv-styles'] = './src/styles';
config.requirejsPaths.vendor = './src/vendor';
// webgme-hfsm (HFSM visualizer, simulator, decorators and code generator); its client libraries are the ones
// in src/vendor, which it loads as bower/...
config.requirejsPaths.hfsm = './node_modules/webgme-hfsm/src/common';
config.requirejsPaths['panels/HFSMViz'] = './node_modules/webgme-hfsm/src/visualizers/panels/HFSMViz';
config.requirejsPaths['widgets/HFSMViz'] = './node_modules/webgme-hfsm/src/visualizers/widgets/HFSMViz';
config.requirejsPaths.bower = './src/vendor';
config.requirejsPaths.codemirror = './node_modules/codemirror';
config.requirejsPaths.html2canvas = './src/vendor/html2canvas';
config.requirejsPaths['cytoscape-edgehandles'] = './src/vendor/cytoscape-edgehandles/cytoscape-edgehandles';
config.requirejsPaths['cytoscape-context-menus'] = './src/vendor/cytoscape-context-menus/cytoscape-context-menus';
config.requirejsPaths['cytoscape-panzoom'] = './src/vendor/cytoscape-panzoom/cytoscape-panzoom';
config.requirejsPaths['webgme-to-json'] = './node_modules/webgme-to-json';
config.requirejsPaths['panels/CodeEditor'] = './node_modules/webgme-codeeditor/src/visualizers/panels/CodeEditor';
config.requirejsPaths['widgets/CodeEditor'] = './node_modules/webgme-codeeditor/src/visualizers/widgets/CodeEditor';
config.requirejsPaths['webgme-codeeditor'] = './node_modules/webgme-codeeditor/src/common';
config.requirejsPaths.CodeEditor = './node_modules/webgme-codeeditor/src/visualizers/panels/CodeEditor/CodeEditorPanel';

module.exports = config;
