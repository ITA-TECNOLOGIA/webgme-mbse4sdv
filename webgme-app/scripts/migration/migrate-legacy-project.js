/*jshint node: true, esversion: 11*/
/**
 * Migrates a project created with the pre-release tool so that it works with the MBSE4SDV components,
 * WITHOUT changing the meta-model or the model structure. Only identifiers stored in the model change:
 *
 *  - registry "validVisualizers", "decorator", "validPlugins": renamed according to rename-map.json
 *    (removed plugins are dropped from "validPlugins")
 *  - registry keys itac4ev* -> mbse4sdv*
 *  - the obsolete "isAudio" flag is removed from attribute definitions
 *  - library info: the owner in the origin project id is replaced by "mbse4sdv" (anonymisation)
 *  - icons of removed image files (registry SVGIcon..., attributes pathimage...) replaced by Material Design
 *    icons according to rename-map.json "icons" (nodes of the libraries listed in icons.excludeLibraries,
 *    e.g. "hfsm", keep their icons)
 *
 * The same changes are applied inside libraries (also nested ones). The core does not allow editing library
 * elements, so the library roots are temporarily unmarked (attribute "_libraryInfo", with temporary object ids), migrated and marked
 * again before persisting; persisting recomputes every hash, so the result is a consistent project in which
 * libraries keep their position, base (FCO) and GUIDs.
 *
 * The source project is not modified; the result is written to a new project. Finally the script verifies
 * that, undoing the renames, every node (GUID, base, attributes, registry, meta, pointers, sets, children)
 * is identical to the source.
 *
 *   MONGO_URI=... node scripts/migration/migrate-legacy-project.js <owner+source> <targetName> --user <user>
 *       [--from <source.webgmex>]   (reads the objects from the package the source was imported from, which is
 *                                    much faster than serializing large projects from the database)
 */
'use strict';

var Q = require('q'),
    crypto = require('crypto'),
    AdmZip = require('adm-zip'),
    webgme = require('webgme'),
    storageUtils = webgme.requirejs('common/storage/util'),
    openSession = require('../lib/project-session').openSession,
    renameMap = require('./rename-map.json');

var VISUALIZERS = renameMap.visualizers,
    DECORATORS = renameMap.decorators,
    PLUGINS = renameMap.plugins,
    REMOVED_PLUGINS = renameMap.removedPlugins,
    REGISTRY_KEYS = renameMap.registryKeys,
    ICONS = renameMap.icons || {registry: {}, attributes: {}, registryKeys: [], attributeNames: [],
        excludeLibraries: []},
    LIBRARY_INFO = '_libraryInfo',
    ANONYMOUS_OWNER = 'mbse4sdv';

// ---- renaming rules ---------------------------------------------------------------------------------

function renameList(value, map, removed) {
    return value.split(' ')
        .filter(function (id) {
            return !removed || removed.indexOf(id) === -1;
        })
        .map(function (id) {
            return map[id] || id;
        })
        .join(' ');
}

function renameRegistryValue(reg, value) {
    if (reg === 'validVisualizers' && typeof value === 'string') {
        return renameList(value, VISUALIZERS);
    }
    if (reg === 'decorator' && DECORATORS[value]) {
        return DECORATORS[value];
    }
    if (reg === 'validPlugins' && typeof value === 'string') {
        return renameList(value, PLUGINS, REMOVED_PLUGINS);
    }
    return value;
}

function replaceRegistryIcon(reg, value) {
    return ICONS.registryKeys.indexOf(reg) > -1 && ICONS.registry[value] ? ICONS.registry[value] : value;
}

function replaceAttributeIcon(attr, value) {
    return ICONS.attributeNames.indexOf(attr) > -1 && ICONS.attributes[value] ? ICONS.attributes[value] : value;
}

function isExcluded(path, excludedPaths) {
    return excludedPaths.some(function (p) {
        return path === p || path.indexOf(p + '/') === 0;
    });
}

function anonymiseLibraryInfo(info) {
    var clean = Object.assign({}, info || {});
    if (typeof clean.projectId === 'string' && clean.projectId.indexOf('+') > -1) {
        clean.projectId = ANONYMOUS_OWNER + '+' + clean.projectId.split('+')[1];
    }
    return clean;
}

function migrateNode(core, node, stats, excluded) {
    core.getOwnRegistryNames(node).forEach(function (reg) {
        var value = core.getOwnRegistry(node, reg),
            renamed = renameRegistryValue(reg, value);

        if (!excluded && replaceRegistryIcon(reg, renamed) !== renamed) {
            renamed = replaceRegistryIcon(reg, renamed);
            stats.icons += 1;
            stats[reg] = (stats[reg] || 0) - 1; // counted as icon, not as identifier rename
        }

        if (REGISTRY_KEYS[reg]) {
            core.setRegistry(node, REGISTRY_KEYS[reg], value);
            core.delRegistry(node, reg);
            stats.registryKeys += 1;
        } else if (JSON.stringify(renamed) !== JSON.stringify(value)) {
            core.setRegistry(node, reg, renamed);
            stats[reg] += 1;
        }
    });

    if (!excluded) {
        core.getOwnAttributeNames(node).forEach(function (attr) {
            var value = core.getOwnAttribute(node, attr);
            if (replaceAttributeIcon(attr, value) !== value) {
                core.setAttribute(node, attr, replaceAttributeIcon(attr, value));
                stats.icons += 1;
            }
        });
    }

    // any node may hold attribute definitions (not only the ones in the META sheet, e.g. inside libraries)
    core.getOwnValidAttributeNames(node).forEach(function (attr) {
        var meta = core.getAttributeMeta(node, attr);
        if (meta && Object.hasOwn(meta, 'isAudio')) {
            delete meta.isAudio;
            core.setAttributeMeta(node, attr, meta);
            stats.isAudio += 1;
        }
    });
}

/**
 * Removes the library marker from the library roots of a serialized project. The modified objects (and their
 * ancestors, whose child references change) get new temporary ids, so they never clash with the real hashes
 * that the core computes when the markers are restored and the tree is persisted.
 * @returns {Array<{hash: string, info: object}>} the (temporary) hash and info of each library root
 */
function unmarkLibraryRoots(json) {
    var byId = new Map(json.objects.map(function (o) {
            return [o._id, o];
        })),
        libs = [],
        queue = [];

    json.objects.forEach(function (obj) {
        if (obj.atr && Object.hasOwn(obj.atr, LIBRARY_INFO)) {
            libs.push({obj: obj, info: obj.atr[LIBRARY_INFO]});
            delete obj.atr[LIBRARY_INFO];
            queue.push(obj);
        }
    });

    while (queue.length > 0) {
        var obj = queue.shift(),
            oldId = obj._id,
            newId = '#' + crypto.randomBytes(20).toString('hex');

        byId.delete(oldId);
        obj._id = newId;
        byId.set(newId, obj);
        if (json.rootHash === oldId) {
            json.rootHash = newId;
        }
        byId.forEach(function (parent) { // jshint ignore:line
            var touched = false;
            if (parent === obj) {
                return;
            }
            Object.keys(parent).forEach(function (key) {
                if (key !== '_id' && parent[key] === oldId) {
                    parent[key] = newId;
                    touched = true;
                }
            });
            if (touched && queue.indexOf(parent) === -1) {
                queue.push(parent);
            }
        });
    }

    json.objects = Array.from(byId.values());
    return libs.map(function (lib) {
        return {hash: lib.obj._id, info: lib.info};
    });
}

// ---- fingerprint used to prove that only the identifiers changed --------------------------------------

function fingerprint(core, root, excludedPaths) {
    return core.loadSubTree(root)
        .then(function (nodes) {
            var result = {};
            nodes.forEach(function (node) {
                var registry = {},
                    excluded = isExcluded(core.getPath(node), excludedPaths),
                    meta = core.getOwnJsonMeta(node);

                core.getOwnRegistryNames(node).forEach(function (reg) {
                    var value = renameRegistryValue(reg, core.getOwnRegistry(node, reg));
                    registry[REGISTRY_KEYS[reg] || reg] = excluded ? value : replaceRegistryIcon(reg, value);
                });
                if (meta && meta.attributes) {
                    Object.keys(meta.attributes).forEach(function (attr) {
                        delete meta.attributes[attr].isAudio;
                    });
                }

                result[core.getPath(node)] = JSON.stringify({
                    guid: core.getGuid(node),
                    base: core.getBase(node) ? core.getPath(core.getBase(node)) : null,
                    attributes: core.getOwnAttributeNames(node).sort().map(function (a) {
                        var value = core.getOwnAttribute(node, a);
                        if (a === LIBRARY_INFO) {
                            value = anonymiseLibraryInfo(value);
                        } else if (!excluded) {
                            value = replaceAttributeIcon(a, value);
                        }
                        return [a, value];
                    }),
                    registry: Object.keys(registry).sort().map(function (r) {
                        return [r, registry[r]];
                    }),
                    pointers: core.getOwnPointerNames(node).sort().map(function (p) {
                        return [p, core.getPointerPath(node, p)];
                    }),
                    sets: core.getSetNames(node).sort().map(function (s) {
                        return [s, core.getMemberPaths(node, s).sort()];
                    }),
                    children: core.getChildrenRelids(node).sort(),
                    meta: meta
                });
            });
            return result;
        });
}

// ---- main ------------------------------------------------------------------------------------------

var started = Date.now();

function phase(name) {
    console.log('[' + ((Date.now() - started) / 1000).toFixed(1) + 's] ' + name);
}

function main(argv) {
    var sourceId = argv[2],
        targetName = argv[3],
        username = argv[argv.indexOf('--user') + 1],
        targetId = username + '+' + targetName,
        stats = {nodes: 0, validVisualizers: 0, decorator: 0, validPlugins: 0, registryKeys: 0, isAudio: 0, icons: 0},
        excludedPaths = [],
        libraryRoots = [],
        session,
        before;

    if (!sourceId || !targetName || argv.indexOf('--user') === -1) {
        throw new Error('Usage: migrate-legacy-project.js <owner+source> <targetName> --user <user>');
    }

    return openSession({username: username})
        .then(function (s) {
            session = s;
            return session.open(sourceId);
        })
        .then(function (source) {
            phase('source opened');
            // nodes of excluded libraries (e.g. hfsm, also nested as sdv.hfsm) keep their icons
            excludedPaths = source.core.getLibraryNames(source.root)
                .filter(function (name) {
                    return ICONS.excludeLibraries.indexOf(name.split('.').pop()) > -1;
                })
                .map(function (name) {
                    return source.core.getPath(source.core.getLibraryRoot(source.root, name));
                });
            return fingerprint(source.core, source.root, excludedPaths)
                .then(function (fp) {
                    var rootHash = source.core.getHash(source.root);
                    before = fp;
                    phase('source fingerprint');
                    var fromIdx = argv.indexOf('--from'),
                        json;

                    if (fromIdx > -1) {
                        json = JSON.parse(new AdmZip(argv[fromIdx + 1]).readAsText('project.json'));
                        if (json.rootHash !== rootHash) {
                            throw new Error('The package root ' + json.rootHash + ' is not the source root ' + rootHash);
                        }
                        return json;
                    }
                    return storageUtils.getProjectJson(source.project, {rootHash: rootHash})
                        .then(function (json) {
                            json.rootHash = rootHash;
                            return json;
                        });
                });
        })
        // 1. copy the objects, temporarily unmarking the library roots
        .then(function (json) {
            phase('source serialized (' + json.objects.length + ' objects)');
            libraryRoots = unmarkLibraryRoots(json);
            return session.storage.deleteProject({projectId: targetId, username: username})
                .catch(function () {
                    return null; // did not exist
                })
                .then(function () {
                    return session.storage.createProject({projectName: targetName, username: username});
                })
                .then(function (project) {
                    return storageUtils.insertProjectJson(project, json, {commitMessage: 'Copy of ' + sourceId});
                });
        })
        .then(function (commitResult) {
            phase('copy inserted');
            return session.storage.createBranch({projectId: targetId, branchName: 'master',
                hash: commitResult.hash, username: username});
        })
        .then(function () {
            return session.open(targetId);
        })
        // 2. rename identifiers everywhere and mark the library roots again
        .then(function (target) {
            var core = target.core;
            return core.loadSubTree(target.root)
                .then(function (nodes) {
                    var toMark = [];

                    // identify library roots by their original hash, before any node is modified
                    nodes.forEach(function (node) {
                        var lib = libraryRoots.filter(function (l) {
                            return l.hash === core.getHash(node);
                        })[0];
                        if (lib) {
                            toMark.push({node: node, info: lib.info});
                        }
                    });
                    if (toMark.length !== libraryRoots.length) {
                        throw new Error('Found ' + toMark.length + ' of ' + libraryRoots.length + ' library roots');
                    }

                    phase('target loaded');
                    // first rename everywhere (libraries are not protected while unmarked) ...
                    nodes.forEach(function (node) {
                        stats.nodes += 1;
                        migrateNode(core, node, stats, isExcluded(core.getPath(node), excludedPaths));
                    });

                    // ... then mark the library roots again, innermost (nested) libraries first
                    toMark.sort(function (a, b) {
                        return core.getPath(b.node).split('/').length - core.getPath(a.node).split('/').length;
                    });
                    toMark.forEach(function (item) {
                        core.setAttribute(item.node, LIBRARY_INFO, anonymiseLibraryInfo(item.info));
                    });
                    phase('renamed');
                    return session.commit(target, 'Migrate identifiers to MBSE4SDV (no meta-model changes)');
                });
        })
        // 3. verify the committed result against the source
        .then(function () {
            return session.open(targetId);
        })
        .then(function (committed) {
            phase('committed and reopened');
            return Q.all([fingerprint(committed.core, committed.root, excludedPaths), committed]);
        })
        .then(function (res) {
            var after = res[0],
                committed = res[1],
                paths = Object.keys(before),
                diffs = paths.filter(function (p) {
                    return before[p] !== after[p];
                }),
                extra = Object.keys(after).filter(function (p) {
                    return !Object.hasOwn(before, p);
                });

            console.log(targetId + ': nodes=' + stats.nodes + ' validVisualizers=' + stats.validVisualizers +
                ' decorator=' + stats.decorator + ' validPlugins=' + stats.validPlugins + ' registryKeys=' +
                stats.registryKeys + ' isAudio=' + stats.isAudio + ' icons=' + stats.icons +
                ' (icons kept in: ' + (excludedPaths.join(', ') || 'none') + ')');
            console.log('Libraries:', committed.core.getLibraryNames(committed.root).map(function (l) {
                return l + ' ' + JSON.stringify(committed.core.getLibraryInfo(committed.root, l));
            }).join(' | ') || 'none');
            console.log('Verification: ' + paths.length + ' nodes in source, ' + Object.keys(after).length +
                ' in result, ' + diffs.length + ' changed beyond the renames, ' + extra.length + ' new.');
            diffs.slice(0, 5).forEach(function (p) {
                console.log('  DIFF ' + p + '\n    source: ' + before[p].slice(0, 400) +
                    '\n    result: ' + (after[p] || '(missing)').slice(0, 400));
            });
            if (diffs.length || extra.length) {
                process.exitCode = 2;
            }
            return session.close();
        });
}

if (require.main === module) {
    main(process.argv).catch(function (err) {
        console.error(err);
        process.exit(1);
    });
}
