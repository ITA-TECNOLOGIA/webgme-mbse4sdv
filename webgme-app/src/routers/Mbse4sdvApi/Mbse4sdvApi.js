/*jshint node:true*/
/**
 * MBSE4SDV REST API (WebGME REST router).
 *
 * Model query and editing endpoints used by the MBSE4SDV MCP server and other clients.
 * Mounted by gmeConfig.rest.components (see config/config.webgme.js), by default at /mbse4sdv/api.
 *
 *  - POST /login            -> {tokenType: 'Bearer', token} (no authentication required)
 *  - POST /<operation>      -> requires "Authorization: Bearer <token>" (or the WebGME session cookie)
 *  - GET  /openapi          -> OpenAPI 3 specification
 *  - GET  /health           -> {status: 'ok'}
 */
'use strict';

var express = require('express'),
    Q = require('q'),
    webgme = require('webgme'),
    StorageUtil = webgme.requirejs('common/storage/util'),
    Core = webgme.requirejs('common/core/coreQ'),
    router = express.Router();

/**
 * Called when the server is created but before it starts to listen to incoming requests.
 * @param {object} middlewareOpts - WebGME middleware options (gmeAuth, safeStorage, ensureAuthenticated, ...).
 */
function initialize(middlewareOpts) {
    var logger = middlewareOpts.logger.fork('Mbse4sdvApi'),
        gmeAuth = middlewareOpts.gmeAuth,
        safeStorage = middlewareOpts.safeStorage,
        ensureAuthenticated = middlewareOpts.ensureAuthenticated,
        gmeConfig = middlewareOpts.gmeConfig,
        getUserId = middlewareOpts.getUserId;

    // Marks the responses as API responses: WebGME then answers 401 instead of redirecting to the login page.
    router.use('*', function (req, res, next) {
        res.setHeader('X-WebGME-Media-Type', 'webgme.v1');
        next();
    });

    function getProto(req) {
        // Honour reverse proxies (e.g. https termination)
        return req.headers['x-forwarded-proto'] || req.protocol;
    }

    function getProjectId(projectInput, ownerIdInput, projectNameInput) {
        var ownerId = ownerIdInput,
            projectName = projectNameInput,
            project = projectInput;

        if (typeof project === 'string') {
            if (project.indexOf('+') > -1) {
                return project;
            }

            if (project.indexOf('/') > -1) {
                ownerId = project.split('/')[0];
                projectName = project.split('/')[1];
            } else {
                projectName = project;
            }
        } else if (project && typeof project === 'object') {
            ownerId = ownerId || project.ownerId || project.owner || project.username;
            projectName = projectName || project.projectName || project.name;
        }

        if (!ownerId || !projectName) {
            throw new Error('project is required. Use "owner+project" or ownerId/projectName.');
        }

        return StorageUtil.getProjectIdFromOwnerIdAndProjectName(ownerId, projectName);
    }

    function getBranchOrCommit(requestBody) {
        requestBody = requestBody || {};

        var value = requestBody.branchCommit || requestBody.branch_commit ||
            requestBody.branchOrCommit || requestBody['branch-commit'] ||
            requestBody.branch || requestBody.commit;

        if (!value || typeof value !== 'string') {
            return 'master';
        }

        return value;
    }

    function getFilterValues(metaElementType) {
        if (Array.isArray(metaElementType)) {
            return metaElementType;
        }

        if (typeof metaElementType === 'string' && metaElementType.trim() !== '') {
            return metaElementType.split(',').map(function (item) {
                return item.trim();
            }).filter(function (item) {
                return item.length > 0;
            });
        }

        return [];
    }

    function isMetaTypeIncluded(metaName, filterValues) {
        if (!filterValues || filterValues.length === 0) {
            return true;
        }

        return filterValues.indexOf(metaName) > -1;
    }

    function getProjectContext(userId, data) {
        var projectId,
            branchOrCommit = getBranchOrCommit(data),
            context = {};

        try {
            projectId = getProjectId(data.project, data.ownerId, data.projectName);
        } catch (err) {
            return Q.reject(err);
        }

        context.projectId = projectId;
        context.branchOrCommit = branchOrCommit;

        return safeStorage.openProject({
            username: userId,
            projectId: projectId
        })
            .then(function (project) {
                context.project = project;
                context.core = new Core(project, {
                    globConf: gmeConfig,
                    logger: logger.fork('core')
                });

                if (branchOrCommit.indexOf('#') === 0) {
                    return StorageUtil.getHashTaggedHash(branchOrCommit);
                }

                return safeStorage.getBranchHash({
                    username: userId,
                    projectId: projectId,
                    branchName: branchOrCommit
                });
            })
            .then(function (commitHash) {
                if (!commitHash) {
                    throw new Error('Branch does not exist ' + branchOrCommit);
                }

                context.commitHash = StorageUtil.getHashTaggedHash(commitHash);

                return safeStorage.getCommits({
                    username: userId,
                    projectId: projectId,
                    before: context.commitHash,
                    number: 1
                });
            })
            .then(function (commits) {
                if (!commits || commits.length === 0) {
                    throw new Error('Commit does not exist');
                }

                context.commitObject = commits[0];
                return context.core.loadRoot(context.commitObject.root);
            })
            .then(function (root) {
                context.root = root;
                context.metaNodes = context.core.getAllMetaNodes(root);
                return context;
            });
    }

    function getModelFromMeta(core, metaNodes, metaElementType) {
        var model = {
                elementList: []
            },
            metaNodePaths = Object.keys(metaNodes),
            filterValues = getFilterValues(metaElementType);

        function toLimit(value) {
            return typeof value === 'number' ? value : -1;
        }

        function getMetaNodeName(nodePath) {
            if (metaNodes[nodePath]) {
                return core.getAttribute(metaNodes[nodePath], 'name') || nodePath;
            }

            return nodePath;
        }

        function hasNonEmptyValue(value) {
            if (value === null || typeof value === 'undefined') {
                return false;
            }

            if (typeof value === 'string') {
                return value.trim() !== '';
            }

            if (Array.isArray(value)) {
                return value.length > 0;
            }

            if (typeof value === 'object') {
                return Object.keys(value).length > 0;
            }

            return true;
        }

        function getMetaAttribute(attrName, attrMeta) {
            var attribute = {
                name: attrName,
                type: attrMeta.type || ''
            };

            if ((attrMeta.type === 'integer' || attrMeta.type === 'float' || attrMeta.type === 'number') &&
                typeof attrMeta.min === 'number') {
                attribute.min = attrMeta.min;
            }

            if ((attrMeta.type === 'integer' || attrMeta.type === 'float' || attrMeta.type === 'number') &&
                typeof attrMeta.max === 'number') {
                attribute.max = attrMeta.max;
            }

            if (attrMeta.type === 'string' && Array.isArray(attrMeta.enum) && attrMeta.enum.length > 0) {
                attribute.enum = attrMeta.enum.slice();
            }

            if (hasNonEmptyValue(attrMeta.default)) {
                attribute.default = attrMeta.default;
            }

            if (hasNonEmptyValue(attrMeta.regexp)) {
                attribute.regexp = attrMeta.regexp;
            }

            if (hasNonEmptyValue(attrMeta.constraints)) {
                attribute.constraints = attrMeta.constraints;
            }

            return attribute;
        }

        function pushPointerOrSet(targetList, name, pointerMeta) {
            var itemPaths = pointerMeta.items || [],
                i;

            if (itemPaths.length === 0) {
                return;
            }

            for (i = 0; i < itemPaths.length; i += 1) {
                targetList.push({
                    name: name,
                    destinationElementName: getMetaNodeName(itemPaths[i]),
                    min: toLimit(pointerMeta.min),
                    max: toLimit(pointerMeta.max)
                });
            }
        }

        metaNodePaths.forEach(function (metaNodePath) {
            var metaNode = metaNodes[metaNodePath],
                metaName = core.getAttribute(metaNode, 'name') || '',
                baseNode = core.getBase(metaNode),
                ownMeta = core.getOwnJsonMeta(metaNode) || {},
                attributeNames = Object.keys(ownMeta.attributes || {}),
                pointerNames = core.getValidPointerNames(metaNode),
                setNames = core.getValidSetNames(metaNode),
                childMeta = ownMeta.children || {},
                childItems = childMeta.items || [],
                element = {
                    metaPackage: core.getAttribute(metaNode, 'metapackage') ||
                        core.getAttribute(metaNode, 'metaPackage') || '',
                    metaName: metaName,
                    metaBase: baseNode ? (core.getAttribute(baseNode, 'name') || '') : '',
                    isAbstract: core.isAbstract(metaNode) === true,
                    isPort: core.getRegistry(metaNode, 'isPort') === true,
                    attributeList: [],
                    pointerList: [],
                    setList: [],
                    aggroupationList: []
                };

            if (!isMetaTypeIncluded(metaName, filterValues)) {
                return;
            }

            attributeNames.forEach(function (attrName) {
                element.attributeList.push(getMetaAttribute(attrName, ownMeta.attributes[attrName] || {}));
            });

            pointerNames.forEach(function (pointerName) {
                pushPointerOrSet(element.pointerList, pointerName, core.getPointerMeta(metaNode, pointerName) || {});
            });

            setNames.forEach(function (setName) {
                pushPointerOrSet(element.setList, setName, core.getPointerMeta(metaNode, setName) || {});
            });

            childItems.forEach(function (childPath) {
                element.aggroupationList.push({
                    destinationElementName: getMetaNodeName(childPath),
                    min: toLimit(childMeta.min),
                    max: toLimit(childMeta.max)
                });
            });

            if (hasNonEmptyValue(ownMeta.constraints)) {
                element.constraints = ownMeta.constraints;
            }

            model.elementList.push(element);
        });

        return model;
    }

    function getQueryOptions(data) {
        data = data || {};

        return {
            showChildren: data.showChildren === true,
            showPointers: data.showPointers === true,
            showSets: data.showSets === true,
            showLargeData: data.showLargeData === true
        };
    }

    function getAttributeValue(value, options) {
        if (typeof value === 'string' && options.showLargeData !== true && value.length > 200) {
            return value.substring(0, 100) + ' -> data truncated - too large';
        }

        return value;
    }

    function getAttributes(core, node, options) {
        var attributeNames = core.getAttributeNames(node),
            attributes = {};

        attributeNames.forEach(function (attrName) {
            attributes[attrName] = getAttributeValue(core.getAttribute(node, attrName), options);
        });

        return attributes;
    }

    function getModelFromInstances(core, root, metaElementType, options, projectRoot) {
        var filterValues = getFilterValues(metaElementType),
            model = {
                elementList: []
            };

        options = options || getQueryOptions();
        projectRoot = projectRoot || root;

        return core.loadSubTree(root)
            .then(function (nodes) {
                return Q.all(nodes.map(function (node) {
                    var nodePath = core.getPath(node),
                        metaTypeNode,
                        metaName;

                    if (nodePath === '' || core.isMetaNode(node)) {
                        return null;
                    }

                    metaTypeNode = core.getMetaType(node);
                    metaName = metaTypeNode ? (core.getAttribute(metaTypeNode, 'name') || '') : '';

                    if (!isMetaTypeIncluded(metaName, filterValues)) {
                        return null;
                    }

                    return getInstanceElement(core, node, options, projectRoot);
                }));
            })
            .then(function (items) {
                model.elementList = items.filter(function (item) {
                    return item !== null;
                });

                return model;
            });
    }

    function getNodeFromId(core, root, idNode) {
        if (!idNode || (typeof idNode === 'string' && idNode.trim() === '')) {
            return Q(root);
        }

        if (typeof idNode !== 'string') {
            return Q.reject(new Error('idNode must be a string path'));
        }

        return core.loadByPath(root, idNode)
            .then(function (node) {
                if (!node) {
                    throw new Error('Node does not exist ' + idNode);
                }

                return node;
            });
    }

    function getInstanceElement(core, node, options, projectRoot) {
        var metaTypeNode = core.getMetaType(node),
            parentNode = core.getParent(node),
            element = {
                id: core.getPath(node),
                name: core.getAttribute(node, 'name') || '',
                metaName: metaTypeNode ? (core.getAttribute(metaTypeNode, 'name') || '') : '',
                parentId: parentNode ? core.getPath(parentNode) : '',
                attributes: getAttributes(core, node, options || getQueryOptions())
            },
            expansions = [];

        options = options || getQueryOptions();

        if (options.showChildren) {
            expansions.push(getDirectChildrenElements(core, node, options)
                .then(function (children) {
                    element.children = children;
                }));
        }

        if (projectRoot && options.showPointers) {
            expansions.push(getPointerElements(core, projectRoot, node, options)
                .then(function (pointers) {
                    element.pointers = pointers;
                }));
        }

        if (projectRoot && options.showSets) {
            expansions.push(getSetElements(core, projectRoot, node, options)
                .then(function (sets) {
                    element.sets = sets;
                }));
        }

        return Q.all(expansions)
            .then(function () {
                return element;
            });
    }

    function getDirectChildrenElements(core, node, options) {
        return core.loadChildren(node)
            .then(function (children) {
                return Q.all(children.map(function (childNode) {
                    if (core.isMetaNode(childNode)) {
                        return null;
                    }

                    return getInstanceElement(core, childNode, options);
                }));
            })
            .then(function (items) {
                return items.filter(function (item) {
                    return item !== null;
                });
            });
    }

    function getChildrenElements(core, node, options) {
        options = options || getQueryOptions();

        return core.loadChildren(node)
            .then(function (children) {
                return Q.all(children.map(function (childNode) {
                    if (core.isMetaNode(childNode)) {
                        return null;
                    }

                    return getChildrenElements(core, childNode, options)
                        .then(function (nestedChildren) {
                            return getInstanceElement(core, childNode, options)
                                .then(function (element) {
                                    element.children = nestedChildren;
                                    return element;
                                });
                        });
                }));
            })
            .then(function (items) {
                return items.filter(function (item) {
                    return item !== null;
                });
            });
    }

    function getPointerElements(core, root, node, options) {
        var pointerNames = core.getPointerNames(node).filter(function (pointerName) {
            return pointerName !== 'base';
        });

        options = options || getQueryOptions();

        return Q.all(pointerNames.map(function (pointerName) {
            var targetPath = core.getPointerPath(node, pointerName);

            if (!targetPath) {
                return null;
            }

            return core.loadByPath(root, targetPath)
                .then(function (targetNode) {
                    if (!targetNode || core.isMetaNode(targetNode)) {
                        return null;
                    }

                    return getInstanceElement(core, targetNode, options)
                        .then(function (element) {
                            element.pointerName = pointerName;
                            return element;
                        });
                });
        }))
            .then(function (items) {
                return items.filter(function (item) {
                    return item !== null;
                });
            });
    }

    function getSetElements(core, root, node, options) {
        var setNames = core.getSetNames(node).filter(function (setName) {
            return setName !== 'MetaAspectSet';
        });

        options = options || getQueryOptions();

        return Q.all(setNames.map(function (setName) {
            var memberPaths = core.getMemberPaths(node, setName) || [];

            return Q.all(memberPaths.map(function (memberPath) {
                return core.loadByPath(root, memberPath)
                    .then(function (memberNode) {
                        if (!memberNode || core.isMetaNode(memberNode)) {
                            return null;
                        }

                        return getInstanceElement(core, memberNode, options)
                            .then(function (element) {
                                element.setName = setName;
                                return element;
                            });
                    });
            }));
        }))
            .then(function (items) {
                return Array.prototype.concat.apply([], items).filter(function (item) {
                    return item !== null;
                });
            });
    }

    function getNameFilterValues(elementName) {
        if (Array.isArray(elementName)) {
            return elementName;
        }

        if (typeof elementName === 'string' && elementName.trim() !== '') {
            return elementName.split(',').map(function (item) {
                return item.trim();
            }).filter(function (item) {
                return item.length > 0;
            });
        }

        return [];
    }

    function filterModelByElementName(model, elementName) {
        var filterValues = getNameFilterValues(elementName);

        if (filterValues.length === 0) {
            return model;
        }

        return {
            elementList: model.elementList.filter(function (element) {
                return filterValues.indexOf(element.name) > -1;
            })
        };
    }

    function getMetaNodeByName(core, metaNodes, metaType) {
        var keys = Object.keys(metaNodes),
            i,
            node,
            name;

        for (i = 0; i < keys.length; i += 1) {
            node = metaNodes[keys[i]];
            name = core.getAttribute(node, 'name');
            if (name === metaType) {
                return node;
            }
        }

        return null;
    }

    function createNodes(context, parentNode, nodeElementList) {
        var createdNodes = [],
            tempIdMap = {},
            tempIdToNode = {},
            tempIdToDef = {},
            createdCount = 0,
            total = nodeElementList.length;

        nodeElementList.forEach(function (def) {
            if (!def || typeof def !== 'object') {
                throw new Error('Each nodeElementList item must be an object');
            }
            if (!def.tempId || typeof def.tempId !== 'string') {
                throw new Error('Each nodeElementList item must define a string tempId');
            }
            if (Object.hasOwn(tempIdToDef, def.tempId)) {
                throw new Error('Duplicated tempId: ' + def.tempId);
            }
            tempIdToDef[def.tempId] = def;
        });

        while (createdCount < total) {
            var progress = false;

            nodeElementList.forEach(function (def) {
                var parentRef,
                    parentForNode,
                    metaType,
                    baseNode,
                    node;

                if (Object.hasOwn(tempIdToNode, def.tempId)) {
                    return;
                }

                parentRef = def.parentRef || 'ROOT';
                if (parentRef === 'ROOT') {
                    parentForNode = parentNode;
                } else {
                    parentForNode = tempIdToNode[parentRef];
                }

                if (!parentForNode) {
                    return;
                }

                metaType = def.metaType;
                if (!metaType || typeof metaType !== 'string') {
                    throw new Error('metaType is required for tempId: ' + def.tempId);
                }

                baseNode = getMetaNodeByName(context.core, context.metaNodes, metaType);
                if (!baseNode) {
                    throw new Error('Unknown metaType "' + metaType + '" for tempId: ' + def.tempId);
                }

                node = context.core.createNode({
                    parent: parentForNode,
                    base: baseNode
                });

                if (typeof def.name === 'string') {
                    context.core.setAttribute(node, 'name', def.name);
                }

                if (def.attributes && typeof def.attributes === 'object') {
                    Object.keys(def.attributes).forEach(function (key) {
                        context.core.setAttribute(node, key, def.attributes[key]);
                    });
                }

                if (def.registry && typeof def.registry === 'object') {
                    Object.keys(def.registry).forEach(function (key) {
                        context.core.setRegistry(node, key, def.registry[key]);
                    });
                }

                tempIdToNode[def.tempId] = node;
                tempIdMap[def.tempId] = context.core.getPath(node);
                createdNodes.push({
                    tempId: def.tempId,
                    idNode: context.core.getPath(node)
                });
                createdCount += 1;
                progress = true;
            });

            if (!progress) {
                throw new Error('Cannot resolve parentRef for remaining nodes. Check parentRef and tempId values.');
            }
        }

        nodeElementList.forEach(function (def) {
            var node = tempIdToNode[def.tempId],
                pointers = def.pointers || {},
                sets = def.sets || {};

            Object.keys(pointers).forEach(function (pointerName) {
                var targetTempId = pointers[pointerName],
                    targetNode = tempIdToNode[targetTempId];

                if (typeof targetTempId !== 'string' || !targetNode) {
                    throw new Error('Pointer target must be a valid tempId. tempId: ' + def.tempId +
                        ', pointer: ' + pointerName + ', target: ' + targetTempId);
                }

                context.core.setPointer(node, pointerName, targetNode);
            });

            Object.keys(sets).forEach(function (setName) {
                var targetTempIds = sets[setName];

                if (!Array.isArray(targetTempIds)) {
                    throw new Error('Set targets must be an array of tempId. tempId: ' + def.tempId +
                        ', set: ' + setName);
                }

                targetTempIds.forEach(function (targetTempId) {
                    var targetNode = tempIdToNode[targetTempId];
                    if (typeof targetTempId !== 'string' || !targetNode) {
                        throw new Error('Set target must be a valid tempId. tempId: ' + def.tempId +
                            ', set: ' + setName + ', target: ' + targetTempId);
                    }

                    context.core.addMember(node, setName, targetNode);
                });
            });
        });

        return {
            createdNodes: createdNodes,
            tempIdMap: tempIdMap
        };
    }

    function getDeletionRootPaths(idNodeList) {
        var uniquePaths = {},
            sortedPaths;

        idNodeList.forEach(function (path) {
            if (typeof path !== 'string' || path.trim() === '') {
                throw new Error('Each idNodeList item must be a non-empty string path');
            }
            uniquePaths[path] = true;
        });

        sortedPaths = Object.keys(uniquePaths).sort(function (a, b) {
            return a.length - b.length;
        });

        return sortedPaths.filter(function (path, index) {
            var i,
                candidate;

            for (i = 0; i < index; i += 1) {
                candidate = sortedPaths[i];
                if (path === candidate || path.indexOf(candidate + '/') === 0) {
                    return false;
                }
            }

            return true;
        });
    }

    function getResolvedPath(path, movedPathMap) {
        var resolved = path,
            previous = null;

        while (movedPathMap[resolved] && movedPathMap[resolved] !== previous) {
            previous = resolved;
            resolved = movedPathMap[resolved];
        }

        return resolved;
    }

    function getNodeFromReference(context, reference, state) {
        var path;

        if (reference === undefined || reference === null) {
            return Q.reject(new Error('Missing node reference'));
        }

        if (typeof reference === 'object') {
            if (reference.tempId) {
                reference = reference.tempId;
            } else if (reference.idNode || reference.nodeId || reference.path || reference.node) {
                reference = reference.idNode || reference.nodeId || reference.path || reference.node;
            } else {
                return Q.reject(new Error('Invalid node reference object'));
            }
        }

        if (typeof reference !== 'string' || reference.trim() === '') {
            return Q.reject(new Error('Invalid node reference'));
        }

        if (Object.hasOwn(state.tempIdToNode, reference)) {
            return Q(state.tempIdToNode[reference]);
        }

        if (reference.indexOf('/') === 0) {
            path = getResolvedPath(reference, state.movedPathMap);
            if (Object.hasOwn(state.nodeByPathCache, path)) {
                return Q(state.nodeByPathCache[path]);
            }

            return context.core.loadByPath(context.root, path)
                .then(function (node) {
                    if (!node) {
                        throw new Error('Node does not exist ' + path);
                    }
                    state.nodeByPathCache[path] = node;
                    return node;
                });
        }

        return Q.reject(new Error('Unknown tempId reference ' + reference));
    }

    function getParentNodeForCreate(context, op, state) {
        var parentRef = op.parentRef || op.parentId || op.parentNodeId || op.parentNode || 'ROOT';

        if (parentRef === 'ROOT') {
            return Q({resolved: true, node: state.defaultParentNode});
        }

        if (typeof parentRef === 'string' &&
            parentRef.indexOf('/') !== 0 &&
            !Object.hasOwn(state.tempIdToNode, parentRef)) {
            return Q({resolved: false, node: null});
        }

        return getNodeFromReference(context, parentRef, state)
            .then(function (parentNode) {
                return {resolved: true, node: parentNode};
            });
    }

    function setTempNode(state, tempId, node, core) {
        state.tempIdToNode[tempId] = node;
        state.tempIdMap[tempId] = core.getPath(node);
    }

    function updateTempNodeAfterMove(state, oldPath, movedNode, core) {
        var tempIds = Object.keys(state.tempIdToNode),
            i,
            tempId;

        for (i = 0; i < tempIds.length; i += 1) {
            tempId = tempIds[i];
            if (state.tempIdMap[tempId] === oldPath || state.tempIdToNode[tempId] === movedNode) {
                state.tempIdToNode[tempId] = movedNode;
                state.tempIdMap[tempId] = core.getPath(movedNode);
            }
        }
    }

    function getNonEmptyArray(value, fieldName) {
        if (!Array.isArray(value) || value.length === 0) {
            throw new Error(fieldName + ' must be a non-empty array');
        }

        return value;
    }

    function buildPointerOperations(pointerElementList, operationName) {
        return getNonEmptyArray(pointerElementList, 'pointerElementList')
            .map(function (element, index) {
                var targetRef;

                if (!element || typeof element !== 'object') {
                    throw new Error('Invalid pointerElementList item at index ' + index);
                }

                if (!element.idNode || typeof element.idNode !== 'string') {
                    throw new Error('pointerElementList item at index ' + index + ' requires string idNode');
                }

                if (!element.pointerName || typeof element.pointerName !== 'string') {
                    throw new Error('pointerElementList item at index ' + index + ' requires string pointerName');
                }

                if (operationName === 'clearPointer') {
                    return {
                        op: operationName,
                        idNode: element.idNode,
                        pointerName: element.pointerName
                    };
                }

                targetRef = element.targetRef || element.targetNode || element.targetIdNode || element.target;
                if (targetRef === undefined || targetRef === null) {
                    throw new Error('pointerElementList item at index ' + index + ' requires targetRef');
                }

                return {
                    op: operationName,
                    idNode: element.idNode,
                    pointerName: element.pointerName,
                    targetRef: targetRef
                };
            });
    }

    function buildSetCreateOperations(setElementList) {
        var operations = [];

        getNonEmptyArray(setElementList, 'setElementList')
            .forEach(function (element, index) {
                var members = element.targetRefs || element.targetNodes || element.targetIdNodes ||
                    element.members || element.targets;

                if (!element || typeof element !== 'object') {
                    throw new Error('Invalid setElementList item at index ' + index);
                }

                if (!element.idNode || typeof element.idNode !== 'string') {
                    throw new Error('setElementList item at index ' + index + ' requires string idNode');
                }

                if (!element.setName || typeof element.setName !== 'string') {
                    throw new Error('setElementList item at index ' + index + ' requires string setName');
                }

                operations.push({
                    op: 'createSet',
                    idNode: element.idNode,
                    setName: element.setName
                });

                if (members !== undefined) {
                    if (!Array.isArray(members)) {
                        throw new Error('setElementList item at index ' + index + ' requires members array');
                    }

                    operations.push({
                        op: 'addSetMembers',
                        idNode: element.idNode,
                        setName: element.setName,
                        targetRefs: members
                    });
                }
            });

        return operations;
    }

    function buildSetReplaceOperations(setElementList) {
        return getNonEmptyArray(setElementList, 'setElementList')
            .map(function (element, index) {
                var members = element.targetRefs || element.targetNodes || element.targetIdNodes ||
                    element.members || element.targets;

                if (!element || typeof element !== 'object') {
                    throw new Error('Invalid setElementList item at index ' + index);
                }

                if (!element.idNode || typeof element.idNode !== 'string') {
                    throw new Error('setElementList item at index ' + index + ' requires string idNode');
                }

                if (!element.setName || typeof element.setName !== 'string') {
                    throw new Error('setElementList item at index ' + index + ' requires string setName');
                }

                if (!Array.isArray(members)) {
                    throw new Error('setElementList item at index ' + index + ' requires members array');
                }

                return {
                    op: 'replaceSetMembers',
                    idNode: element.idNode,
                    setName: element.setName,
                    targetRefs: members
                };
            });
    }

    function buildSetDeleteOperations(setElementList) {
        return getNonEmptyArray(setElementList, 'setElementList')
            .map(function (element, index) {
                if (!element || typeof element !== 'object') {
                    throw new Error('Invalid setElementList item at index ' + index);
                }

                if (!element.idNode || typeof element.idNode !== 'string') {
                    throw new Error('setElementList item at index ' + index + ' requires string idNode');
                }

                if (!element.setName || typeof element.setName !== 'string') {
                    throw new Error('setElementList item at index ' + index + ' requires string setName');
                }

                return {
                    op: 'deleteSet',
                    idNode: element.idNode,
                    setName: element.setName
                };
            });
    }

    function commitModifyRequest(userId, data, defaultCommitMessage) {
        var branchName = getBranchOrCommit(data),
            commitMessage = data.commitMessage || defaultCommitMessage,
            context = {},
            modifyResult;

        if (branchName.indexOf('#') === 0) {
            return Q.reject(new Error(defaultCommitMessage +
                ' requires a branch name in branch-commit, commit hash is not allowed'));
        }

        return getProjectContext(userId, data)
            .then(function (loadedContext) {
                context = loadedContext;
                return executeModifyOperations(context, data);
            })
            .then(function (result) {
                var persisted;

                modifyResult = result;
                persisted = context.core.persist(context.root);

                return context.project.makeCommit(
                    branchName,
                    [context.commitObject._id],
                    persisted.rootHash,
                    persisted.objects,
                    commitMessage
                );
            })
            .then(function (commitResult) {
                var err;

                if (!commitResult || commitResult.status !== 'SYNCED') {
                    err = new Error('Cannot update branch. Commit status: ' +
                        (commitResult && commitResult.status ? commitResult.status : 'UNKNOWN'));
                    err.status = 409;
                    throw err;
                }

                return {
                    commitHash: commitResult.hash,
                    status: commitResult.status,
                    createdNodes: modifyResult.createdNodes,
                    tempIdMap: modifyResult.tempIdMap,
                    appliedOperations: modifyResult.appliedOperations
                };
            });
    }

    function executeModifyOperations(context, data) {
        var operations = data.operations,
            createOps = [],
            moveOps = [],
            updateAttrOps = [],
            updateRegOps = [],
            setCreateOps = [],
            pointerOps = [],
            setAddOps = [],
            setRemoveOps = [],
            setReplaceOps = [],
            setDeleteOps = [],
            deleteOps = [],
            state = {
                defaultParentNode: null,
                tempIdToNode: {},
                tempIdMap: {},
                movedPathMap: {},
                nodeByPathCache: {},
                createdNodes: [],
                appliedOperations: []
            };

        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('operations must be a non-empty array');
        }

        operations.forEach(function (op, index) {
            if (!op || typeof op !== 'object' || typeof op.op !== 'string') {
                throw new Error('Invalid operation at index ' + index);
            }

            switch (op.op) {
                case 'createNode':
                    createOps.push(op);
                    break;
                case 'moveNode':
                    moveOps.push(op);
                    break;
                case 'updateAttributes':
                    updateAttrOps.push(op);
                    break;
                case 'updateRegistry':
                    updateRegOps.push(op);
                    break;
                case 'createSet':
                    setCreateOps.push(op);
                    break;
                case 'setPointer':
                case 'clearPointer':
                    pointerOps.push(op);
                    break;
                case 'addSetMembers':
                    setAddOps.push(op);
                    break;
                case 'removeSetMembers':
                    setRemoveOps.push(op);
                    break;
                case 'replaceSetMembers':
                    setReplaceOps.push(op);
                    break;
                case 'deleteSet':
                    setDeleteOps.push(op);
                    break;
                case 'deleteNode':
                    deleteOps.push(op);
                    break;
                default:
                    throw new Error('Unsupported operation "' + op.op + '" at index ' + index);
            }
        });

        function runSequential(items, handler) {
            return items.reduce(function (promise, item) {
                return promise.then(function () {
                    return handler(item);
                });
            }, Q());
        }

        function createPending(pendingOps) {
            var nextPending = [],
                progress = false;

            if (pendingOps.length === 0) {
                return Q();
            }

            return Q.all(pendingOps.map(function (op) {
                return getParentNodeForCreate(context, op, state)
                    .then(function (parentInfo) {
                        var baseNode,
                            node;

                        if (!parentInfo.resolved) {
                            nextPending.push(op);
                            return;
                        }

                        if (!op.tempId || typeof op.tempId !== 'string') {
                            throw new Error('createNode requires tempId');
                        }
                        if (Object.hasOwn(state.tempIdToNode, op.tempId)) {
                            throw new Error('Duplicated tempId: ' + op.tempId);
                        }
                        if (!op.metaType || typeof op.metaType !== 'string') {
                            throw new Error('createNode requires metaType for tempId: ' + op.tempId);
                        }

                        baseNode = getMetaNodeByName(context.core, context.metaNodes, op.metaType);
                        if (!baseNode) {
                            throw new Error('Unknown metaType "' + op.metaType + '" for tempId: ' + op.tempId);
                        }

                        node = context.core.createNode({
                            parent: parentInfo.node,
                            base: baseNode
                        });

                        if (typeof op.name === 'string') {
                            context.core.setAttribute(node, 'name', op.name);
                        }
                        if (op.attributes && typeof op.attributes === 'object') {
                            Object.keys(op.attributes).forEach(function (key) {
                                context.core.setAttribute(node, key, op.attributes[key]);
                            });
                        }
                        if (op.registry && typeof op.registry === 'object') {
                            Object.keys(op.registry).forEach(function (key) {
                                context.core.setRegistry(node, key, op.registry[key]);
                            });
                        }

                        setTempNode(state, op.tempId, node, context.core);
                        state.createdNodes.push({
                            tempId: op.tempId,
                            idNode: context.core.getPath(node)
                        });
                        state.appliedOperations.push(op.op);

                        if (op.pointers && typeof op.pointers === 'object') {
                            Object.keys(op.pointers).forEach(function (pointerName) {
                                pointerOps.push({
                                    op: 'setPointer',
                                    idNode: {tempId: op.tempId},
                                    pointerName: pointerName,
                                    targetRef: op.pointers[pointerName]
                                });
                            });
                        }

                        if (op.sets && typeof op.sets === 'object') {
                            Object.keys(op.sets).forEach(function (setName) {
                                setAddOps.push({
                                    op: 'addSetMembers',
                                    idNode: {tempId: op.tempId},
                                    setName: setName,
                                    targetRefs: op.sets[setName]
                                });
                            });
                        }

                        progress = true;
                    });
            }))
                .then(function () {
                    if (nextPending.length > 0) {
                        if (!progress) {
                            throw new Error('Cannot resolve createNode parent references');
                        }
                        return createPending(nextPending);
                    }
                });
        }

        function getDeleteTargets() {
            return Q.all(deleteOps.map(function (op) {
                return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                    .then(function (node) {
                        var nodePath = context.core.getPath(node);
                        if (nodePath === '') {
                            throw new Error('Cannot delete project root node');
                        }
                        return nodePath;
                    });
            }));
        }

        function cleanupReferencesToDeletedPaths(deletedPathMap) {
            return context.core.loadSubTree(context.root)
                .then(function (allNodes) {
                    allNodes.forEach(function (node) {
                        var nodePath = context.core.getPath(node),
                            pointerNames,
                            setNames;

                        if (deletedPathMap[nodePath]) {
                            return;
                        }

                        pointerNames = context.core.getPointerNames(node);
                        pointerNames.forEach(function (pointerName) {
                            var targetPath = context.core.getPointerPath(node, pointerName);
                            if (pointerName !== 'base' && targetPath && deletedPathMap[targetPath]) {
                                context.core.setPointer(node, pointerName, null);
                            }
                        });

                        setNames = context.core.getSetNames(node);
                        setNames.forEach(function (setName) {
                            var memberPaths = context.core.getMemberPaths(node, setName);
                            memberPaths.forEach(function (memberPath) {
                                if (deletedPathMap[memberPath]) {
                                    context.core.delMember(node, setName, memberPath);
                                }
                            });
                        });
                    });
                });
        }

        return getNodeFromId(context.core, context.root, data.idParentNode || data.parentNode || '')
            .then(function (defaultParentNode) {
                state.defaultParentNode = defaultParentNode;
            })
            .then(function () {
                return createPending(createOps);
            })
            .then(function () {
                return runSequential(moveOps, function (op) {
                    return Q.all([
                        getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state),
                        getNodeFromReference(context,
                            op.parentRef || op.parentId || op.parentNodeId || op.parentNode, state)
                    ])
                        .then(function (nodes) {
                            var node = nodes[0],
                                parentNode = nodes[1],
                                oldPath = context.core.getPath(node),
                                movedNode = context.core.moveNode(node, parentNode),
                                newPath = context.core.getPath(movedNode);

                            state.movedPathMap[oldPath] = newPath;
                            state.nodeByPathCache[newPath] = movedNode;
                            updateTempNodeAfterMove(state, oldPath, movedNode, context.core);
                            state.appliedOperations.push(op.op);
                        });
                });
            })
            .then(function () {
                return runSequential(updateAttrOps, function (op) {
                    if (!op.attributes || typeof op.attributes !== 'object') {
                        throw new Error('updateAttributes requires attributes object');
                    }

                    return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                        .then(function (node) {
                            Object.keys(op.attributes).forEach(function (key) {
                                context.core.setAttribute(node, key, op.attributes[key]);
                            });
                            state.appliedOperations.push(op.op);
                        });
                });
            })
            .then(function () {
                return runSequential(updateRegOps, function (op) {
                    if (!op.registry || typeof op.registry !== 'object') {
                        throw new Error('updateRegistry requires registry object');
                    }

                    return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                        .then(function (node) {
                            Object.keys(op.registry).forEach(function (key) {
                                context.core.setRegistry(node, key, op.registry[key]);
                            });
                            state.appliedOperations.push(op.op);
                        });
                });
            })
            .then(function () {
                return runSequential(setCreateOps, function (op) {
                    var setName = op.setName || op.name;

                    if (!setName) {
                        throw new Error('createSet requires setName');
                    }

                    return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                        .then(function (node) {
                            context.core.createSet(node, setName);
                            state.appliedOperations.push(op.op);
                        });
                });
            })
            .then(function () {
                return runSequential(pointerOps, function (op) {
                    var pointerName = op.pointerName || op.name;
                    if (!pointerName) {
                        throw new Error(op.op + ' requires pointerName');
                    }

                    return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                        .then(function (node) {
                            if (op.op === 'clearPointer') {
                                context.core.setPointer(node, pointerName, null);
                                state.appliedOperations.push(op.op);
                                return;
                            }

                            return getNodeFromReference(context, op.targetRef || op.target || op.targetNode, state)
                                .then(function (targetNode) {
                                    context.core.setPointer(node, pointerName, targetNode);
                                    state.appliedOperations.push(op.op);
                                });
                        });
                });
            })
            .then(function () {
                return runSequential(setAddOps, function (op) {
                    var setName = op.setName || op.name,
                        targetRefs = op.targetRefs || op.targets || op.members;

                    if (!setName) {
                        throw new Error('addSetMembers requires setName');
                    }
                    if (!Array.isArray(targetRefs)) {
                        throw new Error('addSetMembers requires targetRefs array');
                    }

                    return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                        .then(function (node) {
                            return runSequential(targetRefs, function (targetRef) {
                                return getNodeFromReference(context, targetRef, state)
                                    .then(function (targetNode) {
                                        context.core.addMember(node, setName, targetNode);
                                    });
                            });
                        })
                        .then(function () {
                            state.appliedOperations.push(op.op);
                        });
                });
            })
            .then(function () {
                return runSequential(setRemoveOps, function (op) {
                    var setName = op.setName || op.name,
                        targetRefs = op.targetRefs || op.targets || op.members;

                    if (!setName) {
                        throw new Error('removeSetMembers requires setName');
                    }
                    if (!Array.isArray(targetRefs)) {
                        throw new Error('removeSetMembers requires targetRefs array');
                    }

                    return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                        .then(function (node) {
                            return runSequential(targetRefs, function (targetRef) {
                                return getNodeFromReference(context, targetRef, state)
                                    .then(function (targetNode) {
                                        context.core.delMember(node, setName, context.core.getPath(targetNode));
                                    });
                            });
                        })
                        .then(function () {
                            state.appliedOperations.push(op.op);
                        });
                });
            })
            .then(function () {
                return runSequential(setReplaceOps, function (op) {
                    var setName = op.setName || op.name,
                        targetRefs = op.targetRefs || op.targets || op.members;

                    if (!setName) {
                        throw new Error('replaceSetMembers requires setName');
                    }
                    if (!Array.isArray(targetRefs)) {
                        throw new Error('replaceSetMembers requires targetRefs array');
                    }

                    return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                        .then(function (node) {
                            var currentMemberPaths = context.core.getMemberPaths(node, setName) || [],
                                desiredPathMap = {};

                            return runSequential(targetRefs, function (targetRef) {
                                return getNodeFromReference(context, targetRef, state)
                                    .then(function (targetNode) {
                                        var targetPath = context.core.getPath(targetNode);
                                        desiredPathMap[targetPath] = true;
                                        if (currentMemberPaths.indexOf(targetPath) === -1) {
                                            context.core.addMember(node, setName, targetNode);
                                        }
                                    });
                            })
                                .then(function () {
                                    currentMemberPaths.forEach(function (memberPath) {
                                        if (!desiredPathMap[memberPath]) {
                                            context.core.delMember(node, setName, memberPath);
                                        }
                                    });
                                    state.appliedOperations.push(op.op);
                                });
                        });
                });
            })
            .then(function () {
                return runSequential(setDeleteOps, function (op) {
                    var setName = op.setName || op.name;

                    if (!setName) {
                        throw new Error('deleteSet requires setName');
                    }

                    return getNodeFromReference(context, op.idNode || op.nodeId || op.node || op.target, state)
                        .then(function (node) {
                            context.core.deleteSet(node, setName);
                            state.appliedOperations.push(op.op);
                        });
                });
            })
            .then(function () {
                if (deleteOps.length === 0) {
                    return;
                }

                return getDeleteTargets()
                    .then(function (deleteTargetPaths) {
                        var deleteRoots = getDeletionRootPaths(deleteTargetPaths),
                            deleteRootNodes = [];

                        return Q.all(deleteRoots.map(function (nodePath) {
                            return context.core.loadByPath(context.root, nodePath)
                                .then(function (node) {
                                    if (!node) {
                                        throw new Error('Node does not exist ' + nodePath);
                                    }
                                    deleteRootNodes.push(node);
                                });
                        }))
                            .then(function () {
                                return Q.all(deleteRootNodes.map(function (node) {
                                    return context.core.loadSubTree(node)
                                        .then(function (subTreeNodes) {
                                            subTreeNodes.forEach(function (subNode) {
                                                state.deletedPathMap = state.deletedPathMap || {};
                                                state.deletedPathMap[context.core.getPath(subNode)] = true;
                                            });
                                        });
                                }));
                            })
                            .then(function () {
                                return cleanupReferencesToDeletedPaths(state.deletedPathMap || {});
                            })
                            .then(function () {
                                deleteRootNodes.forEach(function (node) {
                                    context.core.deleteNode(node);
                                });
                                state.appliedOperations.push('deleteNode');
                            });
                    });
            })
            .then(function () {
                return {
                    createdNodes: state.createdNodes,
                    tempIdMap: state.tempIdMap,
                    appliedOperations: state.appliedOperations
                };
            });
    }

    function getOpenApiSpec(req) {
        var serverUrl = getProto(req) + '://' + req.headers.host + middlewareOpts.getMountedPath(req) + req.baseUrl;

        return {
            openapi: '3.0.3',
            info: {
                title: 'MBSE4SDV API',
                version: '1.0.0',
                description: 'Model query and editing endpoints of the MBSE4SDV (Model-Based Systems Engineering for ' +
                    'Software-Defined Vehicles) WebGME application. All POST endpoints except /login require Bearer auth.'
            },
            servers: [
                {
                    url: serverUrl
                }
            ],
            paths: {
                '/login': {
                    post: {
                        summary: 'Login and get Bearer token',
                        description: 'Authenticates with username and password and returns a JWT Bearer token. ' +
                            'Pass the token in the Authorization header as "Bearer <token>" for all other endpoints. ' +
                            'Only required when authentication is enabled in the deployment.',
                        tags: ['Auth'],
                        requestBody: {$ref: '#/components/requestBodies/LoginBody'},
                        responses: {
                            200: {$ref: '#/components/responses/LoginSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            401: {$ref: '#/components/responses/Unauthorized'}
                        }
                    }
                },
                '/getMetaElementsByMetatype': {
                    post: {
                        summary: 'Get meta type definitions filtered by name',
                        description: 'Returns the meta-model element definitions (types, their attributes with ' +
                            'types/defaults/constraints, pointers, sets and containment rules) for the given ' +
                            'project and branch. If metaElementType is omitted all meta types are returned. ' +
                            'Accepts a single string or an array of strings for metaElementType.',
                        tags: ['Query'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/MetaQueryBody'},
                        responses: {
                            200: {$ref: '#/components/responses/MetaModelSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/getMetaDescription': {
                    post: {
                        summary: 'Get all meta type definitions for a project',
                        description: 'Returns the full meta-model: all type definitions with their attribute ' +
                            'schemas, pointer rules, set rules and containment rules. ' +
                            'Equivalent to calling getMetaElementsByMetatype without a metaElementType filter.',
                        tags: ['Query'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/ProjectBranchBody'},
                        responses: {
                            200: {$ref: '#/components/responses/MetaModelSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/getElementsByMetatype': {
                    post: {
                        summary: 'Get instance elements filtered by meta type',
                        description: 'Returns all non-meta instance nodes in the project whose meta type name ' +
                            'matches metaElementType. Accepts a single string or an array of strings. ' +
                            'If metaElementType is omitted all instances are returned. ' +
                            'Use showChildren/showPointers/showSets to expand related data inline.',
                        tags: ['Query'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/MetaQueryBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModelSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/getElementsByName': {
                    post: {
                        summary: 'Get instance elements filtered by node name',
                        description: 'Returns instances whose "name" attribute matches elementName (alias: name). ' +
                            'Accepts a single string or an array of strings for exact matching. ' +
                            'Optionally pre-filter by metaElementType before applying the name filter. ' +
                            'Use showChildren/showPointers/showSets to expand related data inline.',
                        tags: ['Query'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/ElementsByNameBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModelSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/getElementsByNode': {
                    post: {
                        summary: 'Get instance elements under a subtree',
                        description: 'Returns all non-meta instances reachable under the node at idNode ' +
                            '(aliases: nodeId, node). If idNode is omitted the search starts from the project root. ' +
                            'Optionally filter by metaElementType. ' +
                            'Use showChildren/showPointers/showSets to expand related data inline.',
                        tags: ['Query'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/ElementsByNodeBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModelSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/getChildrenElements': {
                    post: {
                        summary: 'Get direct and nested containment children of a node',
                        description: 'Recursively traverses the containment tree rooted at idNode ' +
                            '(aliases: nodeId, node) and returns all descendant instances with their ' +
                            'nested children already attached. Each node includes id, name, metaName, ' +
                            'parentId, attributes and a children array.',
                        tags: ['Query'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/ElementsByNodeBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ChildrenSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/getPointerElements': {
                    post: {
                        summary: 'Get elements pointed to by a node',
                        description: 'Returns all pointer targets of the node at idNode (aliases: nodeId, node), ' +
                            'excluding the "base" inheritance pointer. Each entry in elementList is a full ' +
                            'instance element object keyed by pointer name.',
                        tags: ['Query'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/ElementsByNodeBody'},
                        responses: {
                            200: {$ref: '#/components/responses/PointerSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/getSetElements': {
                    post: {
                        summary: 'Get set members of a node',
                        description: 'Returns all set members of the node at idNode (aliases: nodeId, node). ' +
                            'Each entry in elementList is an object keyed by set name, containing an array ' +
                            'of full instance element objects for each member.',
                        tags: ['Query'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/ElementsByNodeBody'},
                        responses: {
                            200: {$ref: '#/components/responses/SetSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/createNodes': {
                    post: {
                        summary: 'Create one or more nodes in a single commit',
                        description: 'Creates nodes described by nodeElementList under idParentNode (default: root). ' +
                            'Each entry must have a tempId (unique within the request), a metaType name, ' +
                            'and optionally name, attributes, registry, pointers, sets, and a parentRef. ' +
                            'parentRef can reference another tempId or the literal "ROOT". ' +
                            'The response includes the new node paths in createdNodes and a tempId→path map in tempIdMap.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/CreateNodesBody'},
                        responses: {
                            200: {$ref: '#/components/responses/CreateNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/modifyNodes': {
                    post: {
                        summary: 'Apply a mixed list of operations in a single commit',
                        description: 'Executes an ordered list of operations on the model and persists them ' +
                            'as a single commit. Supported op values: createNode, moveNode, updateAttributes, ' +
                            'updateRegistry, createSet, setPointer, clearPointer, addSetMembers, ' +
                            'removeSetMembers, replaceSetMembers, deleteSet, deleteNode. ' +
                            'Nodes created within the same request can be referenced by tempId in subsequent ops.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/ModifyNodesBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModifyNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/createPointers': {
                    post: {
                        summary: 'Assign pointers on nodes in a single commit',
                        description: 'Sets the named pointer on each node in pointerElementList to the given ' +
                            'targetRef (node path or element object with an id field). ' +
                            'Overwrites any existing value for that pointer. ' +
                            'All assignments are committed atomically.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/PointersBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModifyNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/modifyPointers': {
                    post: {
                        summary: 'Update (overwrite) pointers on nodes in a single commit',
                        description: 'Identical behaviour to createPointers — sets each named pointer to the ' +
                            'given targetRef, overwriting any existing value. Provided as a semantic alias ' +
                            'for update workflows.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/PointersBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModifyNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/deletePointers': {
                    post: {
                        summary: 'Clear (nullify) pointers on nodes in a single commit',
                        description: 'Sets the named pointer to null on each node in pointerElementList, ' +
                            'effectively removing the relationship without deleting either node. ' +
                            'All changes are committed atomically.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/PointersDeleteBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModifyNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/createSets': {
                    post: {
                        summary: 'Create sets and optionally add members in a single commit',
                        description: 'Creates the named set on each node in setElementList and optionally ' +
                            'populates it with the given members (array of node paths). ' +
                            'If the set already exists its members are not replaced — use modifySets for that.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/SetsBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModifyNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/modifySets': {
                    post: {
                        summary: 'Replace set members on nodes in a single commit',
                        description: 'Replaces the complete member list of the named set on each node in ' +
                            'setElementList with the given members array (node paths). ' +
                            'Creates the set if it does not exist. All changes are committed atomically.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/SetsBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModifyNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/deleteSets': {
                    post: {
                        summary: 'Delete sets from nodes in a single commit',
                        description: 'Removes the named set (and all its membership data) from each node ' +
                            'in setElementList. Does not delete the member nodes themselves. ' +
                            'All changes are committed atomically.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/SetsDeleteBody'},
                        responses: {
                            200: {$ref: '#/components/responses/ModifyNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/deleteNodes': {
                    post: {
                        summary: 'Delete nodes (and their subtrees) in a single commit',
                        description: 'Deletes each node in idNodeList together with its entire containment subtree. ' +
                            'Automatically nullifies any pointers from surviving nodes that pointed into the ' +
                            'deleted subtree, and removes deleted paths from sets. ' +
                            'Deleting the project root node is not allowed. ' +
                            'The response includes deletedNodeList with all paths actually removed.',
                        tags: ['Write'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/DeleteNodesBody'},
                        responses: {
                            200: {$ref: '#/components/responses/DeleteNodesSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/getNodePosition': {
                    post: {
                        summary: 'Get the visual position of a node',
                        description: 'Returns the {x, y} position stored in the node registry. ' +
                            'Position is used by the WebGME canvas to place the node visually. ' +
                            'Returns null if no position has been set on the node.',
                        tags: ['Position'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/GetNodePositionBody'},
                        responses: {
                            200: {$ref: '#/components/responses/NodePositionSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'}
                        }
                    }
                },
                '/setNodePosition': {
                    post: {
                        summary: 'Set the visual position of a single node',
                        description: 'Writes {x, y} into the node registry under the "position" key and ' +
                            'persists the change as a new commit on the target branch. ' +
                            'Requires a branch name — commit hashes are read-only.',
                        tags: ['Position'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/SetNodePositionBody'},
                        responses: {
                            200: {$ref: '#/components/responses/SetNodePositionSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/setNodesPosition': {
                    post: {
                        summary: 'Set the visual position of multiple nodes in one commit',
                        description: 'Accepts a list of {idNode, position} entries and updates all of them ' +
                            'in a single atomic commit. Each node is loaded via its path (idNode) so no ' +
                            'full-tree scan is needed. If any idNode does not exist the entire operation ' +
                            'is aborted and no changes are persisted.',
                        tags: ['Position'],
                        security: [{bearerAuth: []}],
                        requestBody: {$ref: '#/components/requestBodies/SetNodesPositionBody'},
                        responses: {
                            200: {$ref: '#/components/responses/SetNodesPositionSuccess'},
                            400: {$ref: '#/components/responses/BadRequest'},
                            404: {$ref: '#/components/responses/NotFound'},
                            409: {$ref: '#/components/responses/Conflict'}
                        }
                    }
                },
                '/health': {
                    get: {
                        summary: 'Health check endpoint (no authentication required)',
                        tags: ['Utility'],
                        responses: {
                            200: {
                                description: 'OK',
                                content: {
                                    'application/json': {
                                        example: {status: 'ok'}
                                    }
                                }
                            }
                        }
                    }
                },
                '/openapi': {
                    get: {
                        summary: 'Get the OpenAPI specification of this API',
                        tags: ['Utility'],
                        responses: {
                            200: {
                                description: 'OpenAPI JSON',
                                content: {'application/json': {schema: {type: 'object'}}}
                            }
                        }
                    }
                }
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    }
                },
                schemas: {
                    ErrorResponse: {
                        type: 'object',
                        properties: {
                            message: {type: 'string'},
                            documentation_url: {type: 'string'},
                            error: {type: 'string'}
                        }
                    },
                    ProjectBranchRequest: {
                        type: 'object',
                        required: ['project'],
                        properties: {
                            project: {
                                type: 'string',
                                description: 'Project identifier in the form "ownerId+projectName" (e.g. "guest+MyProject")'
                            },
                            'branch-commit': {
                                type: 'string',
                                description: 'Branch name or commit hash prefixed with "#". Defaults to "master".'
                            }
                        }
                    },
                    MetaQueryRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                properties: {
                                    metaElementType: {
                                        oneOf: [{type: 'string'}, {type: 'array', items: {type: 'string'}}],
                                        description: 'Filter by meta type name(s). Omit to return all types.'
                                    },
                                    showChildren: {
                                        type: 'boolean', default: false,
                                        description: 'Include direct containment children in each element'
                                    },
                                    showPointers: {
                                        type: 'boolean', default: false,
                                        description: 'Include pointer targets in each element'
                                    },
                                    showSets: {
                                        type: 'boolean', default: false,
                                        description: 'Include set members in each element'
                                    },
                                    showLargeData: {
                                        type: 'boolean', default: false,
                                        description: 'Return full string attribute values even when longer than 200 chars'
                                    }
                                }
                            }
                        ]
                    },
                    ElementsByNameRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/MetaQueryRequest'},
                            {
                                type: 'object',
                                properties: {
                                    elementName: {
                                        oneOf: [{type: 'string'}, {type: 'array', items: {type: 'string'}}],
                                        description: 'Exact name(s) to match against the "name" attribute. Alias: name.'
                                    }
                                }
                            }
                        ]
                    },
                    ElementsByNodeRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/MetaQueryRequest'},
                            {
                                type: 'object',
                                properties: {
                                    idNode: {
                                        type: 'string',
                                        description: 'Node path to use as the subtree root. Aliases: nodeId, node. Omit to start from project root.'
                                    }
                                }
                            }
                        ]
                    },
                    InstanceElement: {
                        type: 'object',
                        properties: {
                            id: {type: 'string', description: 'WebGME node path (e.g. "/V/I/p/3")'},
                            name: {type: 'string', description: 'Value of the "name" attribute'},
                            metaName: {type: 'string', description: 'Name of the meta type this node instantiates'},
                            parentId: {type: 'string', description: 'Path of the containing parent node'},
                            attributes: {
                                type: 'object', additionalProperties: true,
                                description: 'All attribute values keyed by attribute name'
                            },
                            children: {
                                type: 'array', items: {$ref: '#/components/schemas/InstanceElement'},
                                description: 'Present only when showChildren is true'
                            },
                            pointers: {
                                type: 'object', additionalProperties: true,
                                description: 'Present only when showPointers is true; keyed by pointer name'
                            },
                            sets: {
                                type: 'object', additionalProperties: true,
                                description: 'Present only when showSets is true; keyed by set name'
                            }
                        }
                    },
                    ModelResponse: {
                        type: 'object',
                        properties: {
                            elementList: {
                                type: 'array',
                                description: 'Flat list of matching instance elements',
                                items: {$ref: '#/components/schemas/InstanceElement'}
                            }
                        }
                    },
                    MetaModelResponse: {
                        type: 'object',
                        properties: {
                            elementList: {
                                type: 'array',
                                description: 'List of meta type descriptors with attribute schemas, pointer and set rules',
                                items: {type: 'object', additionalProperties: true}
                            }
                        }
                    },
                    ChildrenResponse: {
                        type: 'object',
                        properties: {
                            elementList: {
                                type: 'array',
                                description: 'Recursively nested containment children; each item has a children array',
                                items: {$ref: '#/components/schemas/InstanceElement'}
                            }
                        }
                    },
                    PointerResponse: {
                        type: 'object',
                        properties: {
                            elementList: {
                                type: 'array',
                                description: 'List of objects keyed by pointer name, each value being an instance element',
                                items: {type: 'object', additionalProperties: true}
                            }
                        }
                    },
                    SetResponse: {
                        type: 'object',
                        properties: {
                            elementList: {
                                type: 'array',
                                description: 'List of objects keyed by set name, each value being an array of instance elements',
                                items: {type: 'object', additionalProperties: true}
                            }
                        }
                    },
                    CreateNodesRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['nodeElementList'],
                                properties: {
                                    idParentNode: {
                                        type: 'string',
                                        description: 'Default parent path for nodes whose parentRef is "ROOT". Defaults to project root.'
                                    },
                                    commitMessage: {type: 'string'},
                                    nodeElementList: {
                                        type: 'array',
                                        description: 'Nodes to create. Each entry must have tempId and metaType.',
                                        items: {
                                            type: 'object',
                                            required: ['tempId', 'metaType'],
                                            properties: {
                                                tempId: {type: 'string', description: 'Unique local reference used within this request'},
                                                metaType: {type: 'string', description: 'Name of the meta type to instantiate'},
                                                name: {type: 'string'},
                                                parentRef: {type: 'string', description: 'tempId of the parent or "ROOT"'},
                                                attributes: {type: 'object', additionalProperties: true},
                                                registry: {type: 'object', additionalProperties: true},
                                                pointers: {type: 'object', additionalProperties: true},
                                                sets: {type: 'object', additionalProperties: true}
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    ModifyNodesRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['operations'],
                                properties: {
                                    idParentNode: {type: 'string'},
                                    commitMessage: {type: 'string'},
                                    operations: {
                                        type: 'array',
                                        description: 'Ordered list of operations. Each must have an "op" field.',
                                        items: {
                                            type: 'object',
                                            required: ['op'],
                                            properties: {
                                                op: {
                                                    type: 'string',
                                                    enum: [
                                                        'createNode', 'moveNode', 'updateAttributes', 'updateRegistry',
                                                        'createSet', 'setPointer', 'clearPointer',
                                                        'addSetMembers', 'removeSetMembers', 'replaceSetMembers',
                                                        'deleteSet', 'deleteNode'
                                                    ]
                                                },
                                                idNode: {type: 'string', description: 'Target node path (for non-create ops)'},
                                                tempId: {type: 'string', description: 'Local reference (for createNode)'},
                                                metaType: {type: 'string'},
                                                attributes: {type: 'object', additionalProperties: true},
                                                registry: {type: 'object', additionalProperties: true},
                                                pointerName: {type: 'string'},
                                                targetRef: {type: 'string'},
                                                setName: {type: 'string'},
                                                members: {type: 'array', items: {type: 'string'}}
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    PointersRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['pointerElementList'],
                                properties: {
                                    commitMessage: {type: 'string'},
                                    pointerElementList: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                idNode: {type: 'string'},
                                                pointerName: {type: 'string'},
                                                targetRef: {
                                                    oneOf: [
                                                        {type: 'string'},
                                                        {type: 'object', additionalProperties: true}
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    PointersDeleteRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['pointerElementList'],
                                properties: {
                                    commitMessage: {type: 'string'},
                                    pointerElementList: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                idNode: {type: 'string'},
                                                pointerName: {type: 'string'}
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    SetsRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['setElementList'],
                                properties: {
                                    commitMessage: {type: 'string'},
                                    setElementList: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                idNode: {type: 'string'},
                                                setName: {type: 'string'},
                                                members: {type: 'array', items: {type: 'string'}}
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    SetsDeleteRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['setElementList'],
                                properties: {
                                    commitMessage: {type: 'string'},
                                    setElementList: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                idNode: {type: 'string'},
                                                setName: {type: 'string'}
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    },
                    Position: {
                        type: 'object',
                        required: ['x', 'y'],
                        properties: {
                            x: {type: 'number', description: 'Horizontal canvas coordinate'},
                            y: {type: 'number', description: 'Vertical canvas coordinate'}
                        }
                    },
                    GetNodePositionRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['idNode'],
                                properties: {
                                    idNode: {
                                        type: 'string',
                                        description: 'WebGME node path (e.g. "/V/I/p/3")'
                                    }
                                }
                            }
                        ]
                    },
                    SetNodePositionRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['idNode', 'position'],
                                properties: {
                                    idNode: {
                                        type: 'string',
                                        description: 'WebGME node path (e.g. "/V/I/p/3")'
                                    },
                                    position: {$ref: '#/components/schemas/Position'},
                                    commitMessage: {type: 'string'}
                                }
                            }
                        ]
                    },
                    SetNodesPositionRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['nodePositionList'],
                                properties: {
                                    nodePositionList: {
                                        type: 'array',
                                        description: 'List of nodes to reposition',
                                        items: {
                                            type: 'object',
                                            required: ['idNode', 'position'],
                                            properties: {
                                                idNode: {
                                                    type: 'string',
                                                    description: 'WebGME node path'
                                                },
                                                position: {$ref: '#/components/schemas/Position'}
                                            }
                                        }
                                    },
                                    commitMessage: {type: 'string'}
                                }
                            }
                        ]
                    },
                    NodePositionResponse: {
                        type: 'object',
                        properties: {
                            id: {type: 'string', description: 'Node path'},
                            position: {
                                oneOf: [
                                    {$ref: '#/components/schemas/Position'},
                                    {type: 'null'}
                                ],
                                description: 'null if no position has been set'
                            }
                        }
                    },
                    SetNodePositionResponse: {
                        type: 'object',
                        properties: {
                            id: {type: 'string', description: 'Node path'},
                            position: {$ref: '#/components/schemas/Position'},
                            commitHash: {type: 'string'},
                            status: {type: 'string'}
                        }
                    },
                    SetNodesPositionResponse: {
                        type: 'object',
                        properties: {
                            updated: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: {type: 'string'},
                                        position: {$ref: '#/components/schemas/Position'}
                                    }
                                }
                            },
                            commitHash: {type: 'string'},
                            status: {type: 'string'}
                        }
                    },
                    DeleteNodesRequest: {
                        allOf: [
                            {$ref: '#/components/schemas/ProjectBranchRequest'},
                            {
                                type: 'object',
                                required: ['idNodeList'],
                                properties: {
                                    idNodeList: {type: 'array', items: {type: 'string'}},
                                    commitMessage: {type: 'string'}
                                }
                            }
                        ]
                    },
                    CommitResponse: {
                        type: 'object',
                        properties: {
                            commitHash: {type: 'string', description: 'Hash of the new commit'},
                            status: {type: 'string', description: 'Always "SYNCED" on success'}
                        }
                    },
                    CreateNodesResponse: {
                        allOf: [
                            {$ref: '#/components/schemas/CommitResponse'},
                            {
                                type: 'object',
                                properties: {
                                    createdNodes: {
                                        type: 'array',
                                        description: 'Details of each created node',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                id: {type: 'string', description: 'Assigned node path'},
                                                name: {type: 'string'},
                                                metaName: {type: 'string'},
                                                parentId: {type: 'string'},
                                                attributes: {type: 'object', additionalProperties: true}
                                            }
                                        }
                                    },
                                    tempIdMap: {
                                        type: 'object',
                                        additionalProperties: {type: 'string'},
                                        description: 'Maps each tempId from the request to the assigned node path'
                                    }
                                }
                            }
                        ]
                    },
                    ModifyNodesResponse: {
                        allOf: [
                            {$ref: '#/components/schemas/CommitResponse'},
                            {
                                type: 'object',
                                properties: {
                                    createdNodes: {
                                        type: 'array',
                                        description: 'Nodes created by createNode operations in this request',
                                        items: {type: 'object', additionalProperties: true}
                                    },
                                    tempIdMap: {
                                        type: 'object',
                                        additionalProperties: {type: 'string'},
                                        description: 'Maps each tempId from createNode ops to the assigned path'
                                    },
                                    appliedOperations: {
                                        type: 'number',
                                        description: 'Total number of operations successfully applied'
                                    }
                                }
                            }
                        ]
                    },
                    DeleteNodesResponse: {
                        allOf: [
                            {$ref: '#/components/schemas/CommitResponse'},
                            {
                                type: 'object',
                                properties: {
                                    deletedNodeList: {
                                        type: 'array',
                                        items: {type: 'string'},
                                        description: 'Root paths that were requested for deletion (subtrees also removed)'
                                    }
                                }
                            }
                        ]
                    },
                    LoginRequest: {
                        type: 'object',
                        required: ['username', 'password'],
                        properties: {
                            username: {type: 'string'},
                            password: {type: 'string'}
                        }
                    },
                    LoginResponse: {
                        type: 'object',
                        properties: {
                            tokenType: {type: 'string'},
                            token: {type: 'string'}
                        }
                    }
                },
                requestBodies: {
                    LoginBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/LoginRequest'},
                                example: {username: 'demo', password: 'demo'}
                            }
                        }
                    },
                    ProjectBranchBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ProjectBranchRequest'},
                                example: {project: 'guest+MyProject', 'branch-commit': 'master'}
                            }
                        }
                    },
                    MetaQueryBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/MetaQueryRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    metaElementType: ['FunctionalRequirement']
                                }
                            }
                        }
                    },
                    ElementsByNameBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ElementsByNameRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    elementName: ['FR_1', 'FR_2']
                                }
                            }
                        }
                    },
                    ElementsByNodeBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ElementsByNodeRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    idNode: '/V/I/p',
                                    showChildren: true,
                                    showPointers: false,
                                    showSets: false,
                                    showLargeData: false
                                }
                            }
                        }
                    },
                    CreateNodesBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/CreateNodesRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    idParentNode: '/V/I/p',
                                    commitMessage: 'Create FRs',
                                    nodeElementList: [
                                        {
                                            tempId: 'fr_1',
                                            parentRef: 'ROOT',
                                            metaType: 'FunctionalRequirement',
                                            name: 'FR_1',
                                            attributes: {description: 'd1'}
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    ModifyNodesBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ModifyNodesRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    idParentNode: '/V/I/p',
                                    commitMessage: 'Mixed changes',
                                    operations: [
                                        {
                                            op: 'createNode',
                                            tempId: 'tmp_1',
                                            parentRef: 'ROOT',
                                            metaType: 'FunctionalRequirement'
                                        },
                                        {
                                            op: 'updateAttributes',
                                            idNode: '/V/I/p/0',
                                            attributes: {description: 'updated'}
                                        },
                                        {op: 'deleteNode', idNode: '/V/I/p/old'}
                                    ]
                                }
                            }
                        }
                    },
                    DeleteNodesBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/DeleteNodesRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    idNodeList: ['/V/I/p/6', '/V/I/p/Y'],
                                    commitMessage: 'Delete selected nodes'
                                }
                            }
                        }
                    },
                    PointersBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/PointersRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    commitMessage: 'Assign pointers',
                                    pointerElementList: [
                                        {
                                            idNode: '/V/I/p/0',
                                            pointerName: 'refines',
                                            targetRef: '/V/I/p/1'
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    PointersDeleteBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/PointersDeleteRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    commitMessage: 'Clear pointers',
                                    pointerElementList: [
                                        {
                                            idNode: '/V/I/p/0',
                                            pointerName: 'refines'
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    SetsBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/SetsRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    commitMessage: 'Replace set members',
                                    setElementList: [
                                        {
                                            idNode: '/V/I/p/0',
                                            setName: 'allocatedTo',
                                            members: ['/V/I/p/1', '/V/I/p/2']
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    GetNodePositionBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/GetNodePositionRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    idNode: '/V/I/p/3'
                                }
                            }
                        }
                    },
                    SetNodePositionBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/SetNodePositionRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    idNode: '/V/I/p/3',
                                    position: {x: 300, y: 150},
                                    commitMessage: 'Move node to (300, 150)'
                                }
                            }
                        }
                    },
                    SetNodesPositionBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/SetNodesPositionRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    commitMessage: 'Reposition diagram nodes',
                                    nodePositionList: [
                                        {idNode: '/V/I/p/3', position: {x: 100, y: 200}},
                                        {idNode: '/V/I/p/7', position: {x: 400, y: 200}},
                                        {idNode: '/V/I/p/A', position: {x: 250, y: 450}}
                                    ]
                                }
                            }
                        }
                    },
                    SetsDeleteBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/SetsDeleteRequest'},
                                example: {
                                    project: 'guest+MyProject',
                                    'branch-commit': 'master',
                                    commitMessage: 'Delete sets',
                                    setElementList: [
                                        {
                                            idNode: '/V/I/p/0',
                                            setName: 'allocatedTo'
                                        }
                                    ]
                                }
                            }
                        }
                    }
                },
                responses: {
                    LoginSuccess: {
                        description: 'JWT Bearer token generated successfully',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/LoginResponse'},
                                example: {tokenType: 'Bearer', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'} // gitleaks:allow (truncated example)
                            }
                        }
                    },
                    ModelSuccess: {
                        description: 'Flat list of matching instance elements',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ModelResponse'},
                                example: {
                                    elementList: [
                                        {
                                            id: '/V/I/p/3',
                                            name: 'FR_1',
                                            metaName: 'FunctionalRequirement',
                                            parentId: '/V/I/p',
                                            attributes: {description: 'The system shall ...'}
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    MetaModelSuccess: {
                        description: 'Meta type descriptors with attribute schemas and relationship rules',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/MetaModelResponse'},
                                example: {
                                    elementList: [
                                        {
                                            name: 'FunctionalRequirement',
                                            attributes: {
                                                description: {type: 'string', default: ''}
                                            },
                                            pointers: {refines: {target: 'Requirement'}},
                                            sets: {},
                                            children: []
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    ChildrenSuccess: {
                        description: 'Recursively nested containment children',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ChildrenResponse'},
                                example: {
                                    elementList: [
                                        {
                                            id: '/V/I/p/3',
                                            name: 'SubSystem',
                                            metaName: 'Block',
                                            parentId: '/V/I/p',
                                            attributes: {},
                                            children: [
                                                {id: '/V/I/p/3/1', name: 'Port1', metaName: 'Port', parentId: '/V/I/p/3', attributes: {}, children: []}
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    PointerSuccess: {
                        description: 'Pointer targets of the requested node',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/PointerResponse'},
                                example: {
                                    elementList: [
                                        {refines: {id: '/V/I/p/1', name: 'Req_A', metaName: 'Requirement', parentId: '/V/I/p', attributes: {}}}
                                    ]
                                }
                            }
                        }
                    },
                    SetSuccess: {
                        description: 'Set members of the requested node',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/SetResponse'},
                                example: {
                                    elementList: [
                                        {allocatedTo: [{id: '/V/I/p/7', name: 'Comp_B', metaName: 'Component', parentId: '/V/I/p', attributes: {}}]}
                                    ]
                                }
                            }
                        }
                    },
                    CreateNodesSuccess: {
                        description: 'Nodes created and committed',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/CreateNodesResponse'},
                                example: {
                                    commitHash: '#a1b2c3d4...',
                                    status: 'SYNCED',
                                    createdNodes: [
                                        {id: '/V/I/p/8', name: 'FR_2', metaName: 'FunctionalRequirement', parentId: '/V/I/p', attributes: {description: ''}}
                                    ],
                                    tempIdMap: {fr_2: '/V/I/p/8'}
                                }
                            }
                        }
                    },
                    ModifyNodesSuccess: {
                        description: 'Operations applied and committed',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ModifyNodesResponse'},
                                example: {
                                    commitHash: '#a1b2c3d4...',
                                    status: 'SYNCED',
                                    createdNodes: [],
                                    tempIdMap: {},
                                    appliedOperations: 3
                                }
                            }
                        }
                    },
                    DeleteNodesSuccess: {
                        description: 'Nodes deleted and committed',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/DeleteNodesResponse'},
                                example: {
                                    commitHash: '#a1b2c3d4...',
                                    status: 'SYNCED',
                                    deletedNodeList: ['/V/I/p/6', '/V/I/p/Y']
                                }
                            }
                        }
                    },
                    NodePositionSuccess: {
                        description: 'Node position retrieved',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/NodePositionResponse'},
                                example: {id: '/V/I/p/3', position: {x: 158, y: 229}}
                            }
                        }
                    },
                    SetNodePositionSuccess: {
                        description: 'Node position updated and committed',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/SetNodePositionResponse'},
                                example: {
                                    id: '/V/I/p/3',
                                    position: {x: 300, y: 150},
                                    commitHash: '#a1b2c3d4...',
                                    status: 'SYNCED'
                                }
                            }
                        }
                    },
                    SetNodesPositionSuccess: {
                        description: 'All node positions updated in a single commit',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/SetNodesPositionResponse'},
                                example: {
                                    updated: [
                                        {id: '/V/I/p/3', position: {x: 100, y: 200}},
                                        {id: '/V/I/p/7', position: {x: 400, y: 200}}
                                    ],
                                    commitHash: '#a1b2c3d4...',
                                    status: 'SYNCED'
                                }
                            }
                        }
                    },
                    BadRequest: {
                        description: 'Bad request',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ErrorResponse'}
                            }
                        }
                    },
                    Unauthorized: {
                        description: 'Unauthorized',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ErrorResponse'}
                            }
                        }
                    },
                    NotFound: {
                        description: 'Not found',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ErrorResponse'}
                            }
                        }
                    },
                    Conflict: {
                        description: 'Conflict while committing to branch',
                        content: {
                            'application/json': {
                                schema: {$ref: '#/components/schemas/ErrorResponse'}
                            }
                        }
                    }
                }
            }
        };
    }

    router.post('/login', function (req, res, next) {
        var data = req.body || {},
            userId = data.username || data.user || data.userId,
            password = data.password;

        if (!userId || !password) {
            res.status(400);
            next(new Error('username and password are required'));
            return;
        }

        if (gmeConfig.authentication.enable !== true) {
            res.status(400);
            next(new Error('authentication is disabled in this deployment'));
            return;
        }

        gmeAuth.generateJWToken(userId, password)
            .then(function (token) {
                res.json({
                    tokenType: 'Bearer',
                    token: token
                });
            })
            .catch(function (err) {
                if (err.message.indexOf('incorrect password') > -1 || err.message.indexOf('no such user') > -1) {
                    res.status(401);
                }
                next(err);
            });
    });

    // Every other modifying request requires an authenticated user.
    router.post('*', ensureAuthenticated);
    router.put('*', ensureAuthenticated);
    router.patch('*', ensureAuthenticated);
    router.delete('*', ensureAuthenticated);


    router.post('/getMetaElementsByMetatype', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        getProjectContext(userId, data)
            .then(function (context) {
                var model = getModelFromMeta(context.core, context.metaNodes, data.metaElementType);
                res.json(model);
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/getMetaDescription', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        getProjectContext(userId, data)
            .then(function (context) {
                var model = getModelFromMeta(context.core, context.metaNodes);
                res.json(model);
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/getElementsByMetatype', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            options = getQueryOptions(data);

        getProjectContext(userId, data)
            .then(function (context) {
                return getModelFromInstances(context.core, context.root, data.metaElementType, options,
                    context.root);
            })
            .then(function (model) {
                res.json(model);
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/getElementsByName', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            elementName = data.elementName || data.name,
            options = getQueryOptions(data);

        getProjectContext(userId, data)
            .then(function (context) {
                return getModelFromInstances(context.core, context.root, data.metaElementType, options,
                    context.root);
            })
            .then(function (model) {
                res.json(filterModelByElementName(model, elementName));
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/getElementsByNode', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            idNode = data.idNode || data.nodeId || data.node,
            options = getQueryOptions(data);

        getProjectContext(userId, data)
            .then(function (context) {
                return getNodeFromId(context.core, context.root, idNode)
                    .then(function (startNode) {
                        return getModelFromInstances(context.core, startNode, data.metaElementType, options,
                            context.root);
                    });
            })
            .then(function (model) {
                res.json(model);
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1 ||
                    err.message.indexOf('idNode must be a string path') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/getChildrenElements', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            idNode = data.idNode || data.nodeId || data.node;

        getProjectContext(userId, data)
            .then(function (context) {
                return getNodeFromId(context.core, context.root, idNode)
                    .then(function (startNode) {
                        return getChildrenElements(context.core, startNode);
                    });
            })
            .then(function (childrenElements) {
                res.json({
                    elementList: childrenElements
                });
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1 ||
                    err.message.indexOf('idNode must be a string path') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/getPointerElements', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            idNode = data.idNode || data.nodeId || data.node;

        getProjectContext(userId, data)
            .then(function (context) {
                return getNodeFromId(context.core, context.root, idNode)
                    .then(function (startNode) {
                        return getPointerElements(context.core, context.root, startNode);
                    });
            })
            .then(function (pointerElements) {
                res.json({
                    elementList: pointerElements
                });
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1 ||
                    err.message.indexOf('idNode must be a string path') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/getSetElements', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            idNode = data.idNode || data.nodeId || data.node;

        getProjectContext(userId, data)
            .then(function (context) {
                return getNodeFromId(context.core, context.root, idNode)
                    .then(function (startNode) {
                        return getSetElements(context.core, context.root, startNode);
                    });
            })
            .then(function (setElements) {
                res.json({
                    elementList: setElements
                });
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1 ||
                    err.message.indexOf('idNode must be a string path') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/createNodes', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            idParentNode = data.idParentNode || data.parentNodeId || data.parentNode || '',
            nodeElementList = data.nodeElementList,
            branchName = getBranchOrCommit(data),
            commitMessage = data.commitMessage || 'mbse4sdv createNodes',
            context = {},
            creationResult;

        if (branchName.indexOf('#') === 0) {
            res.status(400);
            next(new Error('createNodes requires a branch name in branch-commit, commit hash is not allowed'));
            return;
        }

        if (!Array.isArray(nodeElementList) || nodeElementList.length === 0) {
            res.status(400);
            next(new Error('nodeElementList must be a non-empty array'));
            return;
        }

        getProjectContext(userId, data)
            .then(function (loadedContext) {
                context = loadedContext;
                return getNodeFromId(context.core, context.root, idParentNode);
            })
            .then(function (parentNode) {
                creationResult = createNodes(context, parentNode, nodeElementList);
                var persisted = context.core.persist(context.root);

                return context.project.makeCommit(
                    branchName,
                    [context.commitObject._id],
                    persisted.rootHash,
                    persisted.objects,
                    commitMessage
                );
            })
            .then(function (commitResult) {
                if (!commitResult || commitResult.status !== 'SYNCED') {
                    res.status(409);
                    throw new Error('Cannot update branch. Commit status: ' +
                        (commitResult && commitResult.status ? commitResult.status : 'UNKNOWN'));
                }

                res.json({
                    commitHash: commitResult.hash,
                    status: commitResult.status,
                    createdNodes: creationResult.createdNodes,
                    tempIdMap: creationResult.tempIdMap
                });
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1 ||
                    err.message.indexOf('nodeElementList must be a non-empty array') > -1 ||
                    err.message.indexOf('createNodes requires a branch name') > -1 ||
                    err.message.indexOf('metaType is required for tempId') > -1 ||
                    err.message.indexOf('Unknown metaType') > -1 ||
                    err.message.indexOf('Duplicated tempId') > -1 ||
                    err.message.indexOf('Cannot resolve parentRef') > -1 ||
                    err.message.indexOf('Pointer target must be a valid tempId') > -1 ||
                    err.message.indexOf('Set target must be a valid tempId') > -1 ||
                    err.message.indexOf('Set targets must be an array of tempId') > -1 ||
                    err.message.indexOf('Each nodeElementList item') > -1 ||
                    err.message.indexOf('idNode must be a string path') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/modifyNodes', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        commitModifyRequest(userId, data, 'mbse4sdv modifyNodes')
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                if (err.status) {
                    res.status(err.status);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                    res.status(404);
                } else if (res.statusCode === 200) {
                    res.status(400);
                }
                next(err);
            });
    });

    router.post('/createPointers', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        try {
            data.operations = buildPointerOperations(data.pointerElementList, 'setPointer');
        } catch (err) {
            res.status(400);
            next(err);
            return;
        }

        commitModifyRequest(userId, data, 'mbse4sdv createPointers')
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                if (err.status) {
                    res.status(err.status);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                    res.status(404);
                } else if (res.statusCode === 200) {
                    res.status(400);
                }
                next(err);
            });
    });

    router.post('/modifyPointers', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        try {
            data.operations = buildPointerOperations(data.pointerElementList, 'setPointer');
        } catch (err) {
            res.status(400);
            next(err);
            return;
        }

        commitModifyRequest(userId, data, 'mbse4sdv modifyPointers')
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                if (err.status) {
                    res.status(err.status);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                    res.status(404);
                } else if (res.statusCode === 200) {
                    res.status(400);
                }
                next(err);
            });
    });

    router.post('/deletePointers', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        try {
            data.operations = buildPointerOperations(data.pointerElementList, 'clearPointer');
        } catch (err) {
            res.status(400);
            next(err);
            return;
        }

        commitModifyRequest(userId, data, 'mbse4sdv deletePointers')
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                if (err.status) {
                    res.status(err.status);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                    res.status(404);
                } else if (res.statusCode === 200) {
                    res.status(400);
                }
                next(err);
            });
    });

    router.post('/createSets', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        try {
            data.operations = buildSetCreateOperations(data.setElementList);
        } catch (err) {
            res.status(400);
            next(err);
            return;
        }

        commitModifyRequest(userId, data, 'mbse4sdv createSets')
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                if (err.status) {
                    res.status(err.status);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                    res.status(404);
                } else if (res.statusCode === 200) {
                    res.status(400);
                }
                next(err);
            });
    });

    router.post('/modifySets', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        try {
            data.operations = buildSetReplaceOperations(data.setElementList);
        } catch (err) {
            res.status(400);
            next(err);
            return;
        }

        commitModifyRequest(userId, data, 'mbse4sdv modifySets')
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                if (err.status) {
                    res.status(err.status);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                    res.status(404);
                } else if (res.statusCode === 200) {
                    res.status(400);
                }
                next(err);
            });
    });

    router.post('/deleteSets', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {};

        try {
            data.operations = buildSetDeleteOperations(data.setElementList);
        } catch (err) {
            res.status(400);
            next(err);
            return;
        }

        commitModifyRequest(userId, data, 'mbse4sdv deleteSets')
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                if (err.status) {
                    res.status(err.status);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                    res.status(404);
                } else if (res.statusCode === 200) {
                    res.status(400);
                }
                next(err);
            });
    });

    router.post('/deleteNodes', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            idNodeList = data.idNodeList,
            branchName = getBranchOrCommit(data),
            commitMessage = data.commitMessage || 'mbse4sdv deleteNodes',
            context = {},
            deletionPaths,
            nodeByPath = {},
            deletedPathMap = {};

        if (branchName.indexOf('#') === 0) {
            res.status(400);
            next(new Error('deleteNodes requires a branch name in branch-commit, commit hash is not allowed'));
            return;
        }

        if (!Array.isArray(idNodeList) || idNodeList.length === 0) {
            res.status(400);
            next(new Error('idNodeList must be a non-empty array'));
            return;
        }

        try {
            deletionPaths = getDeletionRootPaths(idNodeList);
        } catch (err) {
            res.status(400);
            next(err);
            return;
        }

        getProjectContext(userId, data)
            .then(function (loadedContext) {
                context = loadedContext;
                return Q.all(deletionPaths.map(function (nodePath) {
                    return context.core.loadByPath(context.root, nodePath)
                        .then(function (node) {
                            if (!node) {
                                throw new Error('Node does not exist ' + nodePath);
                            }
                            if (context.core.getPath(node) === '') {
                                throw new Error('Cannot delete project root node');
                            }

                            nodeByPath[nodePath] = node;
                        });
                }));
            })
            .then(function () {
                return Q.all(deletionPaths.map(function (nodePath) {
                    return context.core.loadSubTree(nodeByPath[nodePath])
                        .then(function (subTreeNodes) {
                            subTreeNodes.forEach(function (node) {
                                deletedPathMap[context.core.getPath(node)] = true;
                            });
                        });
                }));
            })
            .then(function () {
                return context.core.loadSubTree(context.root)
                    .then(function (allNodes) {
                        allNodes.forEach(function (node) {
                            var nodePath = context.core.getPath(node),
                                pointerNames,
                                setNames;

                            if (deletedPathMap[nodePath]) {
                                return;
                            }

                            pointerNames = context.core.getPointerNames(node);
                            pointerNames.forEach(function (pointerName) {
                                var targetPath = context.core.getPointerPath(node, pointerName);
                                if (pointerName !== 'base' && targetPath && deletedPathMap[targetPath]) {
                                    context.core.setPointer(node, pointerName, null);
                                }
                            });

                            setNames = context.core.getSetNames(node);
                            setNames.forEach(function (setName) {
                                var memberPaths = context.core.getMemberPaths(node, setName);
                                memberPaths.forEach(function (memberPath) {
                                    if (deletedPathMap[memberPath]) {
                                        context.core.delMember(node, setName, memberPath);
                                    }
                                });
                            });
                        });
                    });
            })
            .then(function () {
                deletionPaths.forEach(function (nodePath) {
                    context.core.deleteNode(nodeByPath[nodePath]);
                });

                var persisted = context.core.persist(context.root);
                return context.project.makeCommit(
                    branchName,
                    [context.commitObject._id],
                    persisted.rootHash,
                    persisted.objects,
                    commitMessage
                );
            })
            .then(function (commitResult) {
                if (!commitResult || commitResult.status !== 'SYNCED') {
                    res.status(409);
                    throw new Error('Cannot update branch. Commit status: ' +
                        (commitResult && commitResult.status ? commitResult.status : 'UNKNOWN'));
                }

                res.json({
                    commitHash: commitResult.hash,
                    status: commitResult.status,
                    deletedNodeList: deletionPaths
                });
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1 ||
                    err.message.indexOf('deleteNodes requires a branch name') > -1 ||
                    err.message.indexOf('idNodeList must be a non-empty array') > -1 ||
                    err.message.indexOf('Each idNodeList item must be a non-empty string path') > -1 ||
                    err.message.indexOf('Cannot delete project root node') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Node does not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/getNodePosition', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            idNode = data.idNode || data.id;

        if (!idNode || typeof idNode !== 'string') {
            res.status(400);
            next(new Error('idNode is required'));
            return;
        }

        getProjectContext(userId, data)
            .then(function (context) {
                return getNodeFromId(context.core, context.root, idNode)
                    .then(function (node) {
                        var position = context.core.getRegistry(node, 'position');
                        return {
                            id: context.core.getPath(node),
                            position: position || null
                        };
                    });
            })
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/setNodePosition', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            idNode = data.idNode || data.id,
            position = data.position,
            branchName = getBranchOrCommit(data),
            commitMessage = data.commitMessage || 'mbse4sdv setNodePosition',
            context = {};

        if (!idNode || typeof idNode !== 'string') {
            res.status(400);
            next(new Error('idNode is required'));
            return;
        }

        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
            res.status(400);
            next(new Error('position must be an object with numeric x and y'));
            return;
        }

        if (branchName.indexOf('#') === 0) {
            res.status(400);
            next(new Error('setNodePosition requires a branch name, commit hash is not allowed'));
            return;
        }

        getProjectContext(userId, data)
            .then(function (loadedContext) {
                context = loadedContext;
                return getNodeFromId(context.core, context.root, idNode);
            })
            .then(function (node) {
                context.core.setRegistry(node, 'position', {x: position.x, y: position.y});

                var persisted = context.core.persist(context.root);
                return context.project.makeCommit(
                    branchName,
                    [context.commitObject._id],
                    persisted.rootHash,
                    persisted.objects,
                    commitMessage
                );
            })
            .then(function (commitResult) {
                if (!commitResult || commitResult.status !== 'SYNCED') {
                    var err = new Error('Cannot update branch. Commit status: ' +
                        (commitResult && commitResult.status ? commitResult.status : 'UNKNOWN'));
                    err.status = 409;
                    throw err;
                }
                res.json({
                    id: idNode,
                    position: position,
                    commitHash: commitResult.hash,
                    status: commitResult.status
                });
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1 ||
                    err.message.indexOf('setNodePosition requires') > -1 ||
                    err.message.indexOf('idNode is required') > -1 ||
                    err.message.indexOf('position must be') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.post('/setNodesPosition', function (req, res, next) {
        var userId = getUserId(req),
            data = req.body || {},
            nodePositionList = data.nodePositionList,
            branchName = getBranchOrCommit(data),
            commitMessage = data.commitMessage || 'mbse4sdv setNodesPosition',
            context = {};

        if (branchName.indexOf('#') === 0) {
            res.status(400);
            next(new Error('setNodesPosition requires a branch name, commit hash is not allowed'));
            return;
        }

        if (!Array.isArray(nodePositionList) || nodePositionList.length === 0) {
            res.status(400);
            next(new Error('nodePositionList must be a non-empty array'));
            return;
        }

        for (var i = 0; i < nodePositionList.length; i++) {
            var entry = nodePositionList[i];
            if (!entry.idNode || typeof entry.idNode !== 'string') {
                res.status(400);
                next(new Error('each entry must have a string idNode'));
                return;
            }
            if (!entry.position || typeof entry.position.x !== 'number' || typeof entry.position.y !== 'number') {
                res.status(400);
                next(new Error('each entry must have a position with numeric x and y'));
                return;
            }
        }

        getProjectContext(userId, data)
            .then(function (loadedContext) {
                context = loadedContext;
                return Q.all(nodePositionList.map(function (entry) {
                    return getNodeFromId(context.core, context.root, entry.idNode)
                        .then(function (node) {
                            context.core.setRegistry(node, 'position', {x: entry.position.x, y: entry.position.y});
                        });
                }));
            })
            .then(function () {
                var persisted = context.core.persist(context.root);
                return context.project.makeCommit(
                    branchName,
                    [context.commitObject._id],
                    persisted.rootHash,
                    persisted.objects,
                    commitMessage
                );
            })
            .then(function (commitResult) {
                if (!commitResult || commitResult.status !== 'SYNCED') {
                    var err = new Error('Cannot update branch. Commit status: ' +
                        (commitResult && commitResult.status ? commitResult.status : 'UNKNOWN'));
                    err.status = 409;
                    throw err;
                }
                res.json({
                    updated: nodePositionList.map(function (entry) {
                        return {id: entry.idNode, position: entry.position};
                    }),
                    commitHash: commitResult.hash,
                    status: commitResult.status
                });
            })
            .catch(function (err) {
                if (err.message.indexOf('project is required') > -1 ||
                    err.message.indexOf('setNodesPosition requires') > -1 ||
                    err.message.indexOf('nodePositionList') > -1 ||
                    err.message.indexOf('each entry') > -1) {
                    res.status(400);
                } else if (err.message.indexOf('not exist') > -1 ||
                    err.message.indexOf('Not authorized to read') > -1) {
                    err.status = 404;
                }
                next(err);
            });
    });

    router.get('/openapi', function (req, res) {
        res.json(getOpenApiSpec(req));
    });

    router.get('/health', function (req, res) {
        res.json({status: 'ok'});
    });
    router.use('*', function (req, res, next) {
        res.status(404);
        next(new Error());
    });

    // error handling (NOTE: it is important to have this function signature with 4 arguments!)
    // eslint-disable-next-line
    router.use(function (err, req, res, next) {
        var errorMessage = {
                401: 'Authentication required',
                403: 'Forbidden',
                404: 'Not found'
            },
            message = err.message ? err.message : err;

        if (res.statusCode === 200) {
            if (err.message && err.message.indexOf('Not authorized') > -1) {
                err.status = err.status || 403;
            }
            res.status(err.status || 500);
        }

        if (Object.hasOwn(errorMessage, res.statusCode)) {
            message = errorMessage[res.statusCode];
        }

        if (res.statusCode === 500) {
            logger.error(err);
        }

        res.json({
            message: message,
            error: err.message ? err.message : err
        });
    });

    logger.debug('MBSE4SDV API router initialized');
}

/**
 * Called before the server starts listening.
 * @param {function} callback
 */
function start(callback) {
    callback();
}

/**
 * Called after the server stopped listening.
 * @param {function} callback
 */
function stop(callback) {
    callback();
}

module.exports = {
    initialize: initialize,
    router: router,
    start: start,
    stop: stop
};
