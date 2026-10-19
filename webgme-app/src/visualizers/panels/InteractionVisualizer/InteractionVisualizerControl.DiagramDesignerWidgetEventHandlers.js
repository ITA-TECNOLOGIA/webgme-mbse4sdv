/*globals define, WebGMEGlobal*/
/*jshint browser: true*/

define([
    'js/Constants',
    'js/RegistryKeys',
    'js/Utils/GMEConcepts',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.Constants',
    'js/DragDrop/DragHelper'
], function (
    CONSTANTS,
    REGISTRY_KEYS,
    GMEConcepts,
    DiagramDesignerWidgetConstants,
    DragHelper
) {
    'use strict';

    var SRC_POINTER_NAME = CONSTANTS.POINTER_SOURCE,
        DST_POINTER_NAME = CONSTANTS.POINTER_TARGET;

    function InteractionVisualizerControlDiagramDesignerWidgetEventHandlers() {
    }

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype.attachDiagramDesignerWidgetEventHandlers =
        function () {
            var self = this;

            this.designerCanvas.onDesignerItemsMove = function (repositionDesc) {
                self._onDesignerItemsMove(repositionDesc);
            };

            this.designerCanvas.onCreateNewConnection = function (params) {
                self._onCreateNewConnection(params);
            };

            this.designerCanvas.onSelectionDelete = function (idList) {
                self._onSelectionDelete(idList);
            };

            this.designerCanvas.onDesignerItemDoubleClick = function (id) {
                self._onDesignerItemDoubleClick(id);
            };

            this.designerCanvas.onModifyConnectionEnd = function (params) {
                self._onModifyConnectionEnd(params);
            };

            this.designerCanvas.onRegisterSubcomponent = function (objID, sCompID, metaInfo) {
                self._onRegisterSubcomponent(objID, sCompID, metaInfo);
            };

            this.designerCanvas.onUnregisterSubcomponent = function (objID, sCompID) {
                self._onUnregisterSubcomponent(objID, sCompID);
            };

            this.designerCanvas.onSelectionChanged = function (selectedIds) {
                self._onSelectionChanged(selectedIds);
            };

            this.designerCanvas.onBackgroundDroppableAccept = function (event, dragInfo) {
                return self._onBackgroundDroppableAccept(event, dragInfo);
            };

            this.designerCanvas.onBackgroundDrop = function (event, dragInfo, position) {
                self._onBackgroundDrop(event, dragInfo, position);
            };

            this.designerCanvas.onConnectionSegmentPointsChange = function (params) {
                self._onConnectionSegmentPointsChange(params);
            };

            this.designerCanvas.onFilterNewConnectionDroppableEnds = function (params) {
                return self._onFilterNewConnectionDroppableEnds(params);
            };

            this.designerCanvas.onFilterReconnectionDroppableEnds = function (params) {
                return self._onFilterReconnectionDroppableEnds(params);
            };

            this.designerCanvas.getDragItems = function (selectedElements) {
                return self._getDragItems(selectedElements);
            };

            this._oGetDragParams = this.designerCanvas.getDragParams;
            this.designerCanvas.getDragParams = function (selectedElements, event) {
                return self._getDragParams(selectedElements, event);
            };
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._saveNewPositions =
        function (repositionDesc) {
            var self = this,
                gmeIds = Object.keys(repositionDesc),
                metaType,
                newPos;

            if (gmeIds.length === 0) {
                return;
            }

            this._client.startTransaction();

            gmeIds.forEach(function (gmeId) {
                metaType = self._getMetaTypeName(gmeId);
                newPos = {
                    x: Math.round(repositionDesc[gmeId].x),
                    y: Math.round(repositionDesc[gmeId].y)
                };

                if (metaType === self.META_TYPES.LIFELINE) {
                    newPos.y = self.LIFELINE_Y;
                }

                self._client.setRegistry(gmeId, REGISTRY_KEYS.POSITION, newPos);
            });

            this._client.completeTransaction();
            this._refreshCombinedFragmentMemberships();
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onDesignerItemsMove =
        function (repositionDesc) {
            var self = this,
                result = {};

            Object.keys(repositionDesc).forEach(function (itemId) {
                if (typeof self._ComponentID2GMEID[itemId] === 'string') {
                    result[self._ComponentID2GMEID[itemId]] = repositionDesc[itemId];
                }
            });

            this._saveNewPositions(result);
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onCreateNewConnection =
        function (params) {
            var parentId = this.currentNodeInfo.id,
                srcPortId = params.srcSubCompId,
                dstPortId = params.dstSubCompId,
                sourceId = params.srcSubCompId !== undefined ?
                    this._Subcomponent2GMEID[params.src][params.srcSubCompId] :
                    this._ComponentID2GMEID[params.src],
                targetId = params.dstSubCompId !== undefined ?
                    this._Subcomponent2GMEID[params.dst][params.dstSubCompId] :
                    this._ComponentID2GMEID[params.dst],
                validConnectionTypes,
                sourceDesc,
                targetDesc,
                initialY,
                newConnID;

            if (!sourceId || !targetId) {
                return;
            }

            validConnectionTypes = GMEConcepts.getValidConnectionTypesInAspect(
                sourceId,
                targetId,
                parentId,
                CONSTANTS.ASPECT_ALL
            ).filter(function (typeId) {
                return GMEConcepts.canCreateChild(parentId, typeId);
            });

            if (validConnectionTypes.length === 0) {
                return;
            }

            if (sourceId === targetId && srcPortId !== undefined && dstPortId === srcPortId) {
                dstPortId = this._getPortIdByIndex(this._getPortIndex(srcPortId) + 1);
            } else if (sourceId !== targetId && srcPortId !== undefined) {
                dstPortId = this._getPortIdByIndex(this._getPortIndex(srcPortId));
            }

            if (srcPortId !== undefined) {
                this._ensureLifelinePortCapacity(sourceId, this._getPortIndex(srcPortId) + 2);
            }

            if (targetId === sourceId && dstPortId !== undefined) {
                this._ensureLifelinePortCapacity(targetId, this._getPortIndex(dstPortId) + 2);
            } else if (dstPortId !== undefined) {
                this._ensureLifelinePortCapacity(targetId, this._getPortIndex(dstPortId) + 2);
            }

            sourceDesc = this._getObjectDescriptor(sourceId);
            targetDesc = this._getObjectDescriptor(targetId);
            initialY = Math.round(((srcPortId ? this._getPortY(sourceId, srcPortId) :
                (sourceDesc.position.y + this.LIFELINE_HEAD_OFFSET)) +
                (dstPortId ? this._getPortY(targetId, dstPortId) :
                    (targetDesc.position.y + this.LIFELINE_HEAD_OFFSET))) / 2);

            this._client.startTransaction();
            newConnID = this._client.createChild({
                parentId: parentId,
                baseId: validConnectionTypes[0],
                position: {x: 0, y: initialY}
            });
            this._client.setPointer(newConnID, SRC_POINTER_NAME, sourceId);
            this._client.setPointer(newConnID, DST_POINTER_NAME, targetId);
            if (srcPortId !== undefined) {
                this._client.setRegistry(newConnID, this._getPortRegistryKey(true), srcPortId);
            }
            if (dstPortId !== undefined) {
                this._client.setRegistry(newConnID, this._getPortRegistryKey(false), dstPortId);
            }
            this._client.delRegistry(newConnID, 'mbse4sdvManualRoute');
            this._client.delRegistry(newConnID, REGISTRY_KEYS.LINE_CUSTOM_POINTS);
            this._client.completeTransaction();
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onSelectionDelete =
        function (idList) {
            var self = this,
                objIdList = [];

            idList.forEach(function (id) {
                var objID = self._ComponentID2GMEID[id];

                if (objID && GMEConcepts.canDeleteNode(objID) && objIdList.indexOf(objID) === -1) {
                    objIdList.push(objID);
                }
            });

            if (objIdList.length > 0) {
                this._client.deleteNodes(objIdList);
                this._refreshCombinedFragmentMemberships();
            }
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onDesignerItemDoubleClick =
        function (id) {
            var gmeID = this._ComponentID2GMEID[id];

            if (gmeID) {
                WebGMEGlobal.State.registerActiveObject(gmeID);
            }
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onModifyConnectionEnd =
        function (params) {
            var gmeID = this._ComponentID2GMEID[params.id],
                oldDesc = params.old,
                newDesc = params.new,
                newEndPointGMEID;

            if (!gmeID) {
                return;
            }

            this._client.startTransaction();

            if (oldDesc.srcObjId !== newDesc.srcObjId || oldDesc.srcSubCompId !== newDesc.srcSubCompId) {
                if (newDesc.srcSubCompId !== undefined) {
                    newEndPointGMEID = this._Subcomponent2GMEID[newDesc.srcObjId][newDesc.srcSubCompId];
                } else {
                    newEndPointGMEID = this._ComponentID2GMEID[newDesc.srcObjId];
                }
                this._client.setPointer(gmeID, SRC_POINTER_NAME, newEndPointGMEID);
            }

            if (oldDesc.dstObjId !== newDesc.dstObjId || oldDesc.dstSubCompId !== newDesc.dstSubCompId) {
                if (newDesc.dstSubCompId !== undefined) {
                    newEndPointGMEID = this._Subcomponent2GMEID[newDesc.dstObjId][newDesc.dstSubCompId];
                } else {
                    newEndPointGMEID = this._ComponentID2GMEID[newDesc.dstObjId];
                }
                this._client.setPointer(gmeID, DST_POINTER_NAME, newEndPointGMEID);
            }

            if (oldDesc.srcSubCompId !== newDesc.srcSubCompId) {
                if (newDesc.srcSubCompId !== undefined) {
                    this._client.setRegistry(gmeID, this._getPortRegistryKey(true), newDesc.srcSubCompId);
                } else {
                    this._client.delRegistry(gmeID, this._getPortRegistryKey(true));
                }
            }

            if (oldDesc.dstSubCompId !== newDesc.dstSubCompId) {
                if (newDesc.dstSubCompId !== undefined) {
                    this._client.setRegistry(gmeID, this._getPortRegistryKey(false), newDesc.dstSubCompId);
                } else {
                    this._client.delRegistry(gmeID, this._getPortRegistryKey(false));
                }
            }

            this._client.delRegistry(gmeID, 'mbse4sdvManualRoute');
            this._client.delRegistry(gmeID, REGISTRY_KEYS.LINE_CUSTOM_POINTS);
            this._client.completeTransaction();
            this._refreshCombinedFragmentMemberships();
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onRegisterSubcomponent =
        function (objID, sCompID, metaInfo) {
            this._GMEID2Subcomponent[metaInfo[CONSTANTS.GME_ID]] =
                this._GMEID2Subcomponent[metaInfo[CONSTANTS.GME_ID]] || {};
            this._GMEID2Subcomponent[metaInfo[CONSTANTS.GME_ID]][objID] = sCompID;

            this._Subcomponent2GMEID[objID] = this._Subcomponent2GMEID[objID] || {};
            this._Subcomponent2GMEID[objID][sCompID] = metaInfo[CONSTANTS.GME_ID];
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onUnregisterSubcomponent =
        function (objID, sCompID) {
            var gmeID = this._Subcomponent2GMEID[objID] && this._Subcomponent2GMEID[objID][sCompID];

            if (this._Subcomponent2GMEID[objID]) {
                delete this._Subcomponent2GMEID[objID][sCompID];
            }

            if (gmeID && this._GMEID2Subcomponent[gmeID]) {
                delete this._GMEID2Subcomponent[gmeID][objID];
            }
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onSelectionChanged =
        function (selectedIds) {
            var self = this,
                gmeIDs = [];

            selectedIds.forEach(function (id) {
                var gmeId = self._ComponentID2GMEID[id];

                if (gmeId && gmeIDs.indexOf(gmeId) === -1) {
                    gmeIDs.push(gmeId);
                }
            });

            WebGMEGlobal.State.registerActiveSelection(gmeIDs, {invoker: this});
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._getPossibleDropActions =
        function (dragInfo) {
            var items = DragHelper.getDragItems(dragInfo),
                dragEffects = DragHelper.getDragEffects(dragInfo),
                dragParams = DragHelper.getDragParams(dragInfo),
                parentID = this.currentNodeInfo.id,
                possibleDropActions = [],
                aspect = CONSTANTS.ASPECT_ALL;

            dragEffects.forEach(function (effect) {
                if (effect === DragHelper.DRAG_EFFECTS.DRAG_MOVE) {
                    if ((dragParams && dragParams.parentID === parentID) ||
                        GMEConcepts.canCreateChildrenInAspect(parentID, items, aspect)) {
                        possibleDropActions.push({dragEffect: effect});
                    }
                } else if (effect === DragHelper.DRAG_EFFECTS.DRAG_CREATE_INSTANCE) {
                    if (GMEConcepts.canCreateChildrenInAspect(parentID, items, aspect)) {
                        possibleDropActions.push({dragEffect: effect});
                    }
                } else if (effect === DragHelper.DRAG_EFFECTS.DRAG_COPY) {
                    if (GMEConcepts.canCreateChildrenInAspect(parentID, items, aspect)) {
                        possibleDropActions.push({dragEffect: effect});
                    }
                }
            });

            return possibleDropActions;
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onBackgroundDroppableAccept =
        function (event, dragInfo) {
            return this._getPossibleDropActions(dragInfo).length > 0;
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onBackgroundDrop =
        function (event, dragInfo, position) {
            var possibleDropActions = this._getPossibleDropActions(dragInfo),
                selectedAction = possibleDropActions[0];

            if (selectedAction) {
                this._handleDropAction(selectedAction, dragInfo, position);
            }
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._handleDropAction =
        function (dropAction, dragInfo, position) {
            var dragEffect = dropAction.dragEffect,
                items = DragHelper.getDragItems(dragInfo),
                dragParams = DragHelper.getDragParams(dragInfo),
                parentID = this.currentNodeInfo.id,
                params,
                self = this;

            function getParams() {
                var result = {parentId: parentID},
                    positionInfo = self._getNewPositionFromDrag(items, dragParams && dragParams.positions, position);

                Object.keys(positionInfo).forEach(function (gmeId) {
                    result[gmeId] = {
                        registry: {}
                    };
                    result[gmeId].registry[REGISTRY_KEYS.POSITION] = positionInfo[gmeId];
                });

                return result;
            }

            if (dragEffect === DragHelper.DRAG_EFFECTS.DRAG_MOVE) {
                if (dragParams && dragParams.parentID === parentID) {
                    this._saveNewPositions(
                        this._getNewPositionFromDrag(items, dragParams && dragParams.positions, position)
                    );
                }
            } else if (dragEffect === DragHelper.DRAG_EFFECTS.DRAG_CREATE_INSTANCE) {
                params = getParams();
                this._client.createChildren(params);
            } else if (dragEffect === DragHelper.DRAG_EFFECTS.DRAG_COPY) {
                params = getParams();
                this._client.copyMoreNodes(params);
            }
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._getNewPositionFromDrag =
        function (items, dragPositions, dropPosition) {
            var result = {};

            items.forEach(function (id) {
                var relPos = dragPositions && dragPositions[id],
                    newPos = {x: dropPosition.x, y: dropPosition.y};

                if (relPos) {
                    newPos.x += relPos.x;
                    newPos.y += relPos.y;
                }

                newPos.x = newPos.x > 0 ? Math.round(newPos.x) : 0;
                newPos.y = newPos.y > 0 ? Math.round(newPos.y) : 0;
                result[id] = newPos;
            });

            return result;
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._getDragItems =
        function (selectedElements) {
            var self = this;

            return selectedElements.map(function (id) {
                return self._ComponentID2GMEID[id];
            }).filter(function (id) {
                return Boolean(id);
            });
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._getDragParams =
        function (selectedElements, event) {
            var oParams = this._oGetDragParams.call(this.designerCanvas, selectedElements, event),
                params = {
                    positions: {},
                    parentID: this.currentNodeInfo.id
                },
                self = this;

            Object.keys(oParams.positions).forEach(function (componentId) {
                params.positions[self._ComponentID2GMEID[componentId]] = oParams.positions[componentId];
            });

            return params;
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onConnectionSegmentPointsChange =
        function (params) {
            var connID = params.connectionID,
                points = params.points,
                gmeID = this._ComponentID2GMEID[connID],
                y;

            if (!gmeID) {
                return;
            }

            y = this._extractMessageY(points);

            this._client.startTransaction();
            this._client.setRegistry(gmeID, 'mbse4sdvManualRoute', true);
            this._client.setRegistry(gmeID, REGISTRY_KEYS.LINE_CUSTOM_POINTS, points);
            this._client.setRegistry(gmeID, REGISTRY_KEYS.POSITION, {x: 0, y: y});
            this._client.completeTransaction();
            this._refreshCombinedFragmentMemberships();
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onFilterNewConnectionDroppableEnds =
        function (params) {
            var availableConnectionEnds = params.availableConnectionEnds,
                result = [],
                sourceId = params.srcSubCompId === undefined ?
                    this._ComponentID2GMEID[params.srcId] :
                    this._Subcomponent2GMEID[params.srcId][params.srcSubCompId],
                parentID = this.currentNodeInfo.id,
                validConnectionTypes,
                targetId,
                targetNode;

            validConnectionTypes = GMEConcepts.getValidConnectionTypesFromSourceInAspect(
                sourceId,
                parentID,
                CONSTANTS.ASPECT_ALL
            ).filter(function (typeId) {
                return GMEConcepts.canCreateChild(parentID, typeId);
            });

            availableConnectionEnds.forEach(function (entry) {
                var j;

                targetId = entry.dstSubCompID === undefined ?
                    this._ComponentID2GMEID[entry.dstItemID] :
                    this._Subcomponent2GMEID[entry.dstItemID][entry.dstSubCompID];
                targetNode = this._client.getNode(targetId);
                for (j = 0; j < validConnectionTypes.length; j += 1) {
                    if (targetNode && targetNode.isValidTargetOf(validConnectionTypes[j], CONSTANTS.POINTER_TARGET)) {
                        result.push(entry);
                        break;
                    }
                }
            }, this);

            return result;
        };

    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype._onFilterReconnectionDroppableEnds =
        function (params) {
            var connID = params.connId,
                srcDragged = params.draggedEnd === DiagramDesignerWidgetConstants.CONNECTION_END_SRC,
                srcItemID = params.srcItemID,
                srcSubCompID = params.srcSubCompId,
                dstItemID = params.dstItemID,
                dstSubCompID = params.dstSubCompId,
                availableConnectionEnds = params.availableConnectionEnds,
                availableConnectionSources = params.availableConnectionSources,
                result = [],
                newEndPointGMEID,
                oldEndPointGMEID,
                connectionGMEID = this._ComponentID2GMEID[connID];

            if (srcDragged === true) {
                oldEndPointGMEID = dstSubCompID === undefined ?
                    this._ComponentID2GMEID[dstItemID] :
                    this._Subcomponent2GMEID[dstItemID][dstSubCompID];
                availableConnectionSources.forEach(function (entry) {
                    newEndPointGMEID = entry.srcSubCompID === undefined ?
                        this._ComponentID2GMEID[entry.srcItemID] :
                        this._Subcomponent2GMEID[entry.srcItemID][entry.srcSubCompID];
                    if (GMEConcepts.isValidConnection(newEndPointGMEID, oldEndPointGMEID, connectionGMEID) === true) {
                        result.push(entry);
                    }
                }, this);
            } else {
                oldEndPointGMEID = srcSubCompID === undefined ?
                    this._ComponentID2GMEID[srcItemID] :
                    this._Subcomponent2GMEID[srcItemID][srcSubCompID];
                availableConnectionEnds.forEach(function (entry) {
                    newEndPointGMEID = entry.dstSubCompID === undefined ?
                        this._ComponentID2GMEID[entry.dstItemID] :
                        this._Subcomponent2GMEID[entry.dstItemID][entry.dstSubCompID];
                    if (GMEConcepts.isValidConnection(oldEndPointGMEID, newEndPointGMEID, connectionGMEID) === true) {
                        result.push(entry);
                    }
                }, this);
            }

            return result;
        };

    return InteractionVisualizerControlDiagramDesignerWidgetEventHandlers;
});
