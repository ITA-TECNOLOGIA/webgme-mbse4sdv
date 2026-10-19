/*jshint node: true, esversion: 11*/
/**
 * Prints a summary of a WebGME project: libraries, meta types, content, legacy names and values that
 * may contain personal or project-specific data. Used to prepare clean seeds/examples.
 *
 *   node scripts/analyze-project.js <owner+project> [--user <name>] [--values] [--pattern <regexp>]
 *
 * --pattern: case-insensitive regular expression of values to report (e.g. names of people, organisations or
 *            internal projects). By default only e-mail addresses are reported.
 */
'use strict';

var openSession = require('./lib/project-session').openSession,
    rename = require('./migration/rename-map.json');

var EMAIL = '[a-z0-9._%+-]+@[a-z0-9-]+\\.[a-z.]+',
    LEGACY = new RegExp(Object.keys(Object.assign({}, rename.visualizers, rename.decorators, rename.plugins,
        rename.registryKeys)).concat(rename.removedPlugins).join('|'));

function main(argv) {
    var projectId = argv[2],
        userIdx = argv.indexOf('--user'),
        patternIdx = argv.indexOf('--pattern'),
        showValues = argv.indexOf('--values') > -1,
        SUSPICIOUS = new RegExp(patternIdx > -1 ? argv[patternIdx + 1] : EMAIL, 'i'),
        session;

    return openSession({username: userIdx > -1 ? argv[userIdx + 1] : undefined})
        .then(function (s) {
            session = s;
            return session.open(projectId);
        })
        .then(function (ctx) {
            var core = ctx.core,
                stats = {nodes: 0, metaNodes: [], legacy: {}, suspicious: [], isAudio: 0, configAttrs: [],
                    metaTypesUsed: {}, topLevel: []};

            return core.loadSubTree(ctx.root)
                .then(function (nodes) {
                    var libraries = core.getLibraryNames(ctx.root);

                    nodes.forEach(function (node) {
                        var path = core.getPath(node),
                            inLibrary = core.isLibraryElement(node) || core.isLibraryRoot(node),
                            metaType = core.getMetaType(node),
                            name = core.getAttribute(node, 'name');

                        stats.nodes += 1;
                        if (core.isMetaNode(node) && !inLibrary) {
                            stats.metaNodes.push(name);
                        }
                        if (!core.isMetaNode(node) && metaType && !inLibrary) {
                            stats.metaTypesUsed[core.getAttribute(metaType, 'name')] =
                                (stats.metaTypesUsed[core.getAttribute(metaType, 'name')] || 0) + 1;
                        }
                        if (core.getParent(node) === ctx.root && !core.isLibraryRoot(node)) {
                            stats.topLevel.push(name + ' : ' + (metaType ? core.getAttribute(metaType, 'name') : '-') +
                                ' (' + core.getChildrenPaths(node).length + ' children)');
                        }

                        core.getOwnRegistryNames(node).forEach(function (reg) {
                            var value = JSON.stringify(core.getOwnRegistry(node, reg));
                            if (LEGACY.test(reg) || LEGACY.test(value)) {
                                stats.legacy['registry.' + reg] = (stats.legacy['registry.' + reg] || 0) + 1;
                            }
                        });
                        core.getOwnAttributeNames(node).forEach(function (attr) {
                            var value = core.getOwnAttribute(node, attr);
                            if (typeof value === 'string' && SUSPICIOUS.test(value)) {
                                stats.suspicious.push(path + ' [' + name + '] .' + attr + ' = ' +
                                    (showValues ? value.slice(0, 160).replace(/\s+/g, ' ') : '(' + value.length + ' chars)'));
                            }
                            if (typeof value === 'string' && LEGACY.test(value)) {
                                stats.legacy['attribute.' + attr] = (stats.legacy['attribute.' + attr] || 0) + 1;
                            }
                        });
                        if (core.isMetaNode(node)) {
                            core.getOwnValidAttributeNames(node).forEach(function (attr) {
                                var meta = core.getAttributeMeta(node, attr);
                                if (meta && Object.hasOwn(meta, 'isAudio')) {
                                    stats.isAudio += 1;
                                }
                                if (meta && meta.type === 'config') {
                                    stats.configAttrs.push(name + '.' + attr);
                                }
                            });
                        }
                    });

                    console.log('Project       :', projectId, '@', ctx.commitHash);
                    console.log('Libraries     :', libraries.length ? libraries.map(function (l) {
                        return l + ' ' + JSON.stringify(core.getLibraryInfo(ctx.root, l) || {});
                    }).join(', ') : 'none');
                    console.log('Nodes         :', stats.nodes);
                    console.log('Meta types    :', stats.metaNodes.length, stats.metaNodes.slice(0, 60).join(', '),
                        stats.metaNodes.length > 60 ? '...' : '');
                    console.log('Top level     :\n  ' + stats.topLevel.join('\n  '));
                    console.log('Instances by meta type:', JSON.stringify(stats.metaTypesUsed));
                    console.log('Legacy names  :', JSON.stringify(stats.legacy));
                    console.log('isAudio flags :', stats.isAudio);
                    console.log('config attrs  :', stats.configAttrs.join(', ') || 'none');
                    console.log('Suspicious values (' + stats.suspicious.length + '):\n  ' +
                        stats.suspicious.slice(0, 40).join('\n  '));
                });
        })
        .then(function () {
            return session.close();
        });
}

if (require.main === module) {
    main(process.argv).catch(function (err) {
        console.error(err);
        process.exit(1);
    });
}
