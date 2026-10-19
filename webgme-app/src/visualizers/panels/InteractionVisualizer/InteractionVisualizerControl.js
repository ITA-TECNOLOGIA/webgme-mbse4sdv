/*globals define, _, WebGMEGlobal, $*/
/*jshint browser: true*/

define([
    'js/logger',
    'js/Constants',
    'js/NodePropertyNames',
    'js/RegistryKeys',
    'js/Utils/GMEConcepts',
    'js/Utils/GMEVisualConcepts',
    'js/Utils/PreferencesHelper',
    './InteractionVisualizerControl.DiagramDesignerWidgetEventHandlers'
], function (
    Logger,
    CONSTANTS,
    nodePropertyNames,
    REGISTRY_KEYS,
    GMEConcepts,
    GMEVisualConcepts,
    PreferencesHelper,
    InteractionVisualizerControlDiagramDesignerWidgetEventHandlers
) {
    'use strict';

    var DEFAULT_DECORATOR = 'ModelDecorator',
        WIDGET_NAME = 'DiagramDesigner',
        WIDTH_REG_KEY = 'decoratorWidth',
        HEIGHT_REG_KEY = 'decoratorHeight',
        SRC_PORT_REG_KEY = 'mbse4sdvSrcPort',
        DST_PORT_REG_KEY = 'mbse4sdvDstPort',
        MANUAL_ROUTE_REG_KEY = 'mbse4sdvManualRoute';

    function InteractionVisualizerControl(options) {
        this.logger = options.logger || Logger.create(
            options.loggerName || 'gme:Panels:InteractionVisualizer:InteractionVisualizerControl',
            WebGMEGlobal.gmeConfig.client.log
        );

        this._client = options.client;
        this.designerCanvas = options.widget;

        this.META_TYPES = {
            MODEL: 'InteractionModel',
            MESSAGE: 'InteractionMessage',
            LIFELINE: 'InteractionLifeline',
            FRAGMENT: 'InteractionCombinedFragment',
            NOTE: 'Note',
            ENRICHED_NOTE: 'EnrichedNote'
        };

        this.LIFELINE_Y = 40;
        this.LIFELINE_X_SPACING = 220;
        this.LIFELINE_DEFAULT_HEIGHT = 520;
        this.LIFELINE_HEAD_OFFSET = 36;
        this.LIFELINE_PORT_TOP_OFFSET = 80;
        this.LIFELINE_PORT_SPACING = 80;
        this.LIFELINE_MIN_PORTS = 5;
        this.FRAGMENT_DEFAULT_WIDTH = 460;
        this.FRAGMENT_DEFAULT_HEIGHT = 240;
        this.SELF_MESSAGE_OFFSET_X = 110;
        this.SELF_MESSAGE_OFFSET_Y = 40;
        this.AUTO_SYNC_FRAGMENT_MEMBERSHIPS = true;

        this._GMEModels = [];
        this._GMEConnections = [];
        this._GMEID2ComponentID = {};
        this._ComponentID2GMEID = {};
        this._GMEID2Subcomponent = {};
        this._Subcomponent2GMEID = {};
        this._selfPatterns = {};
        this._territoryId = null;
        this.eventQueue = [];
        this.currentNodeInfo = {id: null, parentId: null};
        this._componentIDPartIDMap = {};
        this._notifyPackage = {};
        this._combinedFragmentSyncTimer = null;
        this._combinedFragmentSyncDelayMs = 400;

        GMEVisualConcepts.initialize(this._client);
        this.attachDiagramDesignerWidgetEventHandlers();
    }

    InteractionVisualizerControl.prototype.getNodeID = function () {
        return this.currentNodeInfo.id;
    };

    InteractionVisualizerControl.prototype.selectedObjectChanged = function (nodeId) {
        var self = this,
            desc = nodeId ? this._getObjectDescriptor(nodeId) : null,
            nodeName = (desc && desc.name) || 'Interaction';

        this.designerCanvas.clear();
        this._GMEModels = [];
        this._GMEConnections = [];
        this._GMEID2ComponentID = {};
        this._ComponentID2GMEID = {};
        this._GMEID2Subcomponent = {};
        this._Subcomponent2GMEID = {};

        if (this._territoryId) {
            this._client.removeUI(this._territoryId);
            this._territoryId = null;
        }

        this.currentNodeInfo.id = nodeId;
        this.currentNodeInfo.parentId = desc && desc.parentId;

        if (nodeId || nodeId === CONSTANTS.PROJECT_ROOT_ID) {
            this._selfPatterns = {};
            this._selfPatterns[nodeId] = {children: 2};

            this.designerCanvas.setTitle(nodeName);
            this.designerCanvas.setBackgroundText(nodeName, {
                'font-size': 26,
                color: '#d7d7d7'
            });
            this.designerCanvas.showProgressbar();

            this._territoryId = this._client.addUI(this, function (events) {
                self._eventCallback(events);
            });
            this._client.updateTerritory(this._territoryId, this._selfPatterns);
        } else {
            this.designerCanvas.setBackgroundText('No interaction model selected', {
                'font-size': 26,
                color: '#d7d7d7'
            });
        }
    };

    InteractionVisualizerControl.prototype._eventCallback = function (events) {
        if (events && events.length > 0) {
            this.eventQueue.push(events);
            this.processNextInQueue();
        }
    };

    InteractionVisualizerControl.prototype.processNextInQueue = function () {
        var nextBatchInQueue,
            decoratorsToDownload = [DEFAULT_DECORATOR],
            self = this;

        if (this.eventQueue.length === 0) {
            return;
        }

        nextBatchInQueue = this.eventQueue.pop().map(function (event) {
            if (event.etype !== CONSTANTS.TERRITORY_EVENT_UNLOAD) {
                event.desc = self._getObjectDescriptor(event.eid);
                if (event.desc && event.desc.decorator && decoratorsToDownload.indexOf(event.desc.decorator) === -1) {
                    decoratorsToDownload.push(event.desc.decorator);
                }
            }
            return event;
        });

        this._client.decoratorManager.download(decoratorsToDownload, WIDGET_NAME, function () {
            self._dispatchEvents(nextBatchInQueue);
        });
    };

    InteractionVisualizerControl.prototype._dispatchEvents = function (events) {
        var self = this,
            modelEvents = [],
            connectionEvents = [];

        events.forEach(function (event) {
            if (event.etype === CONSTANTS.TERRITORY_EVENT_UNLOAD) {
                modelEvents.push(event);
            } else if (event.desc && event.desc.kind === 'CONNECTION') {
                connectionEvents.push(event);
            } else {
                modelEvents.push(event);
            }
        });

        this._notifyPackage = {};
        this.designerCanvas.beginUpdate();
        modelEvents.forEach(function (event) {
            self._dispatchSingleEvent(event);
        });
        self._handleDecoratorNotification();
        connectionEvents.forEach(function (event) {
            self._dispatchSingleEvent(event);
        });
        this.designerCanvas.endUpdate();
        this.designerCanvas.hideProgressbar();
        this._ensurePayloadNodesTracked();
        this._scheduleCombinedFragmentMembershipRefresh(events);
        this.processNextInQueue();
    };

    InteractionVisualizerControl.prototype._dispatchSingleEvent = function (event) {
        if (event.etype !== CONSTANTS.TERRITORY_EVENT_UNLOAD) {
            this._refreshMessagesForPayload(event.eid);
        }

        switch (event.etype) {
        case CONSTANTS.TERRITORY_EVENT_LOAD:
            this._onLoad(event.eid, event.desc);
            break;
        case CONSTANTS.TERRITORY_EVENT_UPDATE:
            this._onUpdate(event.eid, event.desc);
            break;
        case CONSTANTS.TERRITORY_EVENT_UNLOAD:
            this._onUnload(event.eid);
            break;
        default:
            break;
        }
    };

    InteractionVisualizerControl.prototype._getMetaTypeName = function (nodeId) {
        var nodeObj = this._client.getNode(nodeId),
            metaTypeId = nodeObj && nodeObj.getMetaTypeId(),
            metaNode = metaTypeId && this._client.getNode(metaTypeId);

        return metaNode ? metaNode.getAttribute(nodePropertyNames.Attributes.name) : '';
    };

    InteractionVisualizerControl.prototype._getInteractionChildren = function () {
        var self = this,
            rootNode = this._client.getNode(this.currentNodeInfo.id),
            childIds = rootNode ? rootNode.getChildrenIds() : [];

        return childIds.map(function (id) {
            return self._client.getNode(id);
        }).filter(function (node) {
            return Boolean(node);
        });
    };

    InteractionVisualizerControl.prototype._getSiblingIndex = function (nodeId, typeName) {
        var index = 0;

        this._getInteractionChildren().forEach(function (node) {
            if (node.getId() === nodeId) {
                return;
            }
            if (!typeName || this._getMetaTypeName(node.getId()) === typeName) {
                index += 1;
            }
        }, this);

        return index;
    };

    InteractionVisualizerControl.prototype._getDefaultPosition = function (nodeObj, metaType) {
        var index = this._getSiblingIndex(nodeObj.getId(), metaType);

        if (metaType === this.META_TYPES.LIFELINE) {
            return {x: 80 + index * this.LIFELINE_X_SPACING, y: this.LIFELINE_Y};
        }

        if (metaType === this.META_TYPES.FRAGMENT) {
            return {x: 60 + index * 40, y: 120 + index * 30};
        }

        return {x: 40 + index * 20, y: 140 + index * 60};
    };

    InteractionVisualizerControl.prototype._getPosition = function (nodeObj, metaType) {
        var fallback = this._getDefaultPosition(nodeObj, metaType),
            pos = nodeObj.getRegistry(REGISTRY_KEYS.POSITION) || fallback;

        return {
            x: typeof pos.x === 'number' ? pos.x : fallback.x,
            y: typeof pos.y === 'number' ? pos.y : fallback.y
        };
    };

    InteractionVisualizerControl.prototype._getFragmentSize = function (nodeObj) {
        return {
            width: nodeObj.getRegistry(WIDTH_REG_KEY) || this.FRAGMENT_DEFAULT_WIDTH,
            height: nodeObj.getRegistry(HEIGHT_REG_KEY) || this.FRAGMENT_DEFAULT_HEIGHT
        };
    };

    InteractionVisualizerControl.prototype._getLifelineHeight = function (nodeObj) {
        return nodeObj.getRegistry(HEIGHT_REG_KEY) || this.LIFELINE_DEFAULT_HEIGHT;
    };

    InteractionVisualizerControl.prototype._getMessageStyle = function (nodeObj) {
        var type = nodeObj.getAttribute('type') || 'synchronous',
            style = {};

        style[CONSTANTS.LINE_STYLE.WIDTH] = 2;
        style[CONSTANTS.LINE_STYLE.TYPE] = CONSTANTS.LINE_STYLE.TYPES.NONE;
        style[CONSTANTS.LINE_STYLE.PATTERN] = CONSTANTS.LINE_STYLE.PATTERNS.SOLID;
        style[CONSTANTS.LINE_STYLE.START_ARROW] = CONSTANTS.LINE_STYLE.LINE_ARROWS.NONE;
        style[CONSTANTS.LINE_STYLE.END_ARROW] = CONSTANTS.LINE_STYLE.LINE_ARROWS.CLASSIC + '-xwide-xlong';
        style[CONSTANTS.LINE_STYLE.LABEL_PLACEMENT] = CONSTANTS.LINE_STYLE.LABEL_PLACEMENTS.MIDDLE;

        if (type === 'asynchronous') {
            style[CONSTANTS.LINE_STYLE.END_ARROW] = CONSTANTS.LINE_STYLE.LINE_ARROWS.OPEN + '-xwide-xlong';
        } else if (type === 'reply') {
            style[CONSTANTS.LINE_STYLE.END_ARROW] = CONSTANTS.LINE_STYLE.LINE_ARROWS.OPEN + '-xwide-xlong';
            style[CONSTANTS.LINE_STYLE.PATTERN] = CONSTANTS.LINE_STYLE.PATTERNS.DASH;
        } else if (type === 'create') {
            style[CONSTANTS.LINE_STYLE.END_ARROW] = CONSTANTS.LINE_STYLE.LINE_ARROWS.BLOCK + '-xwide-xlong';
            style[CONSTANTS.LINE_STYLE.COLOR] = '#355e2b';
        } else if (type === 'delete') {
            style[CONSTANTS.LINE_STYLE.END_ARROW] = CONSTANTS.LINE_STYLE.LINE_ARROWS.CLASSIC + '-xwide-xlong';
            style[CONSTANTS.LINE_STYLE.COLOR] = '#9f2c2c';
        }

        return style;
    };

    InteractionVisualizerControl.prototype._getMessageLabel = function (nodeObj) {
        var payloadId = nodeObj.getPointer('payload') && nodeObj.getPointer('payload').to,
            payloadNode = payloadId && this._client.getNode(payloadId),
            payloadName = payloadNode && payloadNode.getAttribute(nodePropertyNames.Attributes.name),
            label = nodeObj.getAttribute(nodePropertyNames.Attributes.name) || '';

        if (payloadName) {
            label = label ? label + ' : ' + payloadName : payloadName;
        } else if (payloadId) {
            this._ensurePayloadNodeTracked(payloadId);
        }

        return label;
    };

    InteractionVisualizerControl.prototype._ensurePayloadNodeTracked = function (payloadId) {
        if (!payloadId || this._selfPatterns[payloadId]) {
            return;
        }

        this._selfPatterns[payloadId] = {children: 0};

        if (this._territoryId) {
            this._client.updateTerritory(this._territoryId, this._selfPatterns);
        }
    };

    InteractionVisualizerControl.prototype._refreshMessagesForPayload = function (payloadId) {
        var self = this;

        if (!payloadId || !this.currentNodeInfo.id) {
            return;
        }

        this._getInteractionChildren().forEach(function (nodeObj) {
            var nodeId = nodeObj.getId(),
                metaType = self._getMetaTypeName(nodeId),
                pointedPayloadId;

            if (metaType !== self.META_TYPES.MESSAGE) {
                return;
            }

            pointedPayloadId = nodeObj.getPointer('payload') && nodeObj.getPointer('payload').to;
            if (pointedPayloadId === payloadId && self._GMEID2ComponentID[nodeId]) {
                self._onUpdate(nodeId, self._getObjectDescriptor(nodeId));
            }
        });
    };

    InteractionVisualizerControl.prototype._ensurePayloadNodesTracked = function () {
        var self = this,
            changed = false;

        this._getInteractionChildren().forEach(function (nodeObj) {
            var payloadId;

            if (self._getMetaTypeName(nodeObj.getId()) !== self.META_TYPES.MESSAGE) {
                return;
            }

            payloadId = nodeObj.getPointer('payload') && nodeObj.getPointer('payload').to;
            if (payloadId && !self._selfPatterns[payloadId]) {
                self._ensurePayloadNodeTracked(payloadId);
                changed = true;
            }
        });

        if (changed && this._territoryId) {
            this._client.updateTerritory(this._territoryId, this._selfPatterns);
        }
    };

    InteractionVisualizerControl.prototype._extractMessageY = function (points) {
        var first = points && points[0],
            last = points && points[points.length - 1];

        if (first && last) {
            return Math.round((first[1] + last[1]) / 2);
        }

        return 160;
    };

    InteractionVisualizerControl.prototype._getMessageY = function (nodeObj, srcId, dstId) {
        var pos = nodeObj.getRegistry(REGISTRY_KEYS.POSITION),
            srcNode = srcId && this._client.getNode(srcId),
            dstNode = dstId && this._client.getNode(dstId),
            srcPos = srcNode && this._getPosition(srcNode, this.META_TYPES.LIFELINE),
            dstPos = dstNode && this._getPosition(dstNode, this.META_TYPES.LIFELINE);

        if (pos && typeof pos.y === 'number') {
            return pos.y;
        }

        if (srcPos && dstPos) {
            return Math.round((srcPos.y + dstPos.y) / 2 + 120);
        }

        return 160;
    };

    InteractionVisualizerControl.prototype._getPortIndex = function (portId) {
        var parsed = parseInt((portId || '').replace(/^p/, ''), 10);

        return isNaN(parsed) ? 0 : parsed;
    };

    InteractionVisualizerControl.prototype._getPortIdByIndex = function (index) {
        return 'p' + index;
    };

    InteractionVisualizerControl.prototype._getPortCountForHeight = function (height) {
        return Math.max(this.LIFELINE_MIN_PORTS,
            Math.floor((height - this.LIFELINE_PORT_TOP_OFFSET - 16) / this.LIFELINE_PORT_SPACING) + 1);
    };

    InteractionVisualizerControl.prototype._getPortY = function (lifelineId, portId) {
        var nodeObj = this._client.getNode(lifelineId),
            pos = nodeObj && this._getPosition(nodeObj, this.META_TYPES.LIFELINE),
            index = this._getPortIndex(portId);

        return pos ? pos.y + this.LIFELINE_PORT_TOP_OFFSET + index * this.LIFELINE_PORT_SPACING : 0;
    };

    InteractionVisualizerControl.prototype._ensureLifelinePortCapacity = function (lifelineId, minCount) {
        var lifelineNode = this._client.getNode(lifelineId),
            currentHeight,
            currentCount,
            nextHeight;

        if (!lifelineNode) {
            return;
        }

        currentHeight = this._getLifelineHeight(lifelineNode);
        currentCount = this._getPortCountForHeight(currentHeight);

        if (currentCount >= minCount) {
            return;
        }

        nextHeight = this.LIFELINE_DEFAULT_HEIGHT +
            Math.max(0, minCount - this.LIFELINE_MIN_PORTS) * this.LIFELINE_PORT_SPACING;
        this._client.setRegistry(lifelineId, HEIGHT_REG_KEY, nextHeight);
    };

    InteractionVisualizerControl.prototype._getPortRegistryKey = function (isSource) {
        return isSource ? SRC_PORT_REG_KEY : DST_PORT_REG_KEY;
    };

    InteractionVisualizerControl.prototype._getPortId = function (nodeObj, isSource) {
        return nodeObj.getRegistry(this._getPortRegistryKey(isSource));
    };

    InteractionVisualizerControl.prototype._getLifelineCenterX = function (nodeId) {
        var nodeObj = this._client.getNode(nodeId),
            pos = nodeObj && this._getPosition(nodeObj, this.META_TYPES.LIFELINE);

        return pos ? pos.x + 75 : 0;
    };

    InteractionVisualizerControl.prototype._buildMessageCustomPoints = function (nodeObj, srcId, dstId) {
        var sourceX = this._getLifelineCenterX(srcId),
            targetX = this._getLifelineCenterX(dstId),
            srcPortId = this._getPortId(nodeObj, true),
            dstPortId = this._getPortId(nodeObj, false),
            sourceY,
            targetY;

        if (srcId === dstId) {
            sourceY = this._getPortY(srcId, srcPortId);
            targetY = this._getPortY(dstId, dstPortId);
            return [
                [sourceX + this.SELF_MESSAGE_OFFSET_X, sourceY],
                [sourceX + this.SELF_MESSAGE_OFFSET_X, targetY],
                [sourceX + 16, targetY]
            ];
        }
    };

    InteractionVisualizerControl.prototype._getObjectDescriptor = function (nodeId) {
        var nodeObj = this._client.getNode(nodeId),
            objDescriptor,
            metaType,
            srcId,
            dstId,
            linePoints,
            style,
            size;

        if (!nodeObj) {
            return null;
        }

        objDescriptor = {
            id: nodeObj.getId(),
            name: nodeObj.getAttribute(nodePropertyNames.Attributes.name) || '',
            parentId: nodeObj.getParentId(),
            kind: 'MODEL',
            decorator: DEFAULT_DECORATOR
        };

        if (nodeId === this.currentNodeInfo.id) {
            return objDescriptor;
        }

        metaType = this._getMetaTypeName(nodeId);

        if (GMEConcepts.isConnection(nodeId) || metaType === this.META_TYPES.MESSAGE) {
            srcId = nodeObj.getPointer(CONSTANTS.POINTER_SOURCE).to;
            dstId = nodeObj.getPointer(CONSTANTS.POINTER_TARGET).to;
            linePoints = nodeObj.getRegistry(REGISTRY_KEYS.LINE_CUSTOM_POINTS);
            style = this._getMessageStyle(nodeObj);

            objDescriptor.kind = 'CONNECTION';
            objDescriptor.source = srcId;
            objDescriptor.target = dstId;
            objDescriptor.srcSubCompId = this._getPortId(nodeObj, true);
            objDescriptor.dstSubCompId = this._getPortId(nodeObj, false);
            _.extend(objDescriptor, GMEVisualConcepts.getConnectionVisualProperties(nodeObj.getId()));
            objDescriptor.name = this._getMessageLabel(nodeObj);
            _.extend(objDescriptor, style);
            objDescriptor.lineLabelYOffset = -10;
            if (nodeObj.getRegistry(MANUAL_ROUTE_REG_KEY) === true && linePoints && linePoints.length) {
                objDescriptor[CONSTANTS.LINE_STYLE.CUSTOM_POINTS] = $.extend(true, [], linePoints);
            } else if (srcId === dstId) {
                objDescriptor[CONSTANTS.LINE_STYLE.CUSTOM_POINTS] = $.extend(
                    true,
                    [],
                    this._buildMessageCustomPoints(nodeObj, srcId, dstId)
                );
            }
            if (nodeObj.getAttribute('type') === 'delete') {
                objDescriptor.dstText = 'X';
            }
        } else if (metaType === this.META_TYPES.LIFELINE) {
            objDescriptor.decorator = 'InteractionLifelineDecorator';
            objDescriptor.position = this._getPosition(nodeObj, this.META_TYPES.LIFELINE);
            objDescriptor.position.y = this.LIFELINE_Y;
            objDescriptor.height = this._getLifelineHeight(nodeObj);
        } else if (metaType === this.META_TYPES.FRAGMENT) {
            size = this._getFragmentSize(nodeObj);
            objDescriptor.decorator = 'InteractionCombinedFragmentDecorator';
            objDescriptor.position = this._getPosition(nodeObj, this.META_TYPES.FRAGMENT);
            objDescriptor.width = size.width;
            objDescriptor.height = size.height;
        } else if (metaType === this.META_TYPES.NOTE) {
            objDescriptor.decorator = 'mbse4sdvNoteDecorator';
            objDescriptor.position = this._getPosition(nodeObj, metaType);
        } else if (metaType === this.META_TYPES.ENRICHED_NOTE) {
            objDescriptor.decorator = 'mbse4sdvEnrichedNoteDecorator';
            objDescriptor.position = this._getPosition(nodeObj, metaType);
        } else {
            objDescriptor.position = this._getPosition(nodeObj, metaType);
        }

        return objDescriptor;
    };

    InteractionVisualizerControl.prototype._getItemDecorator = function (decorator) {
        return this._client.decoratorManager.getDecoratorForWidget(decorator, WIDGET_NAME) ||
            this._client.decoratorManager.getDecoratorForWidget(DEFAULT_DECORATOR, WIDGET_NAME);
    };

    InteractionVisualizerControl.prototype._addGMEModel = function (gmeID, objDesc) {
        var uiComponent;

        objDesc.decoratorClass = this._getItemDecorator(objDesc.decorator);
        objDesc.control = this;
        objDesc.metaInfo = {};
        objDesc.metaInfo[CONSTANTS.GME_ID] = gmeID;
        objDesc.preferencesHelper = PreferencesHelper.getPreferences();

        this._GMEModels.push(gmeID);
        this._GMEID2ComponentID[gmeID] = this._GMEID2ComponentID[gmeID] || [];
        uiComponent = this.designerCanvas.createDesignerItem(objDesc);
        this._GMEID2ComponentID[gmeID].push(uiComponent.id);
        this._ComponentID2GMEID[uiComponent.id] = gmeID;
    };

    InteractionVisualizerControl.prototype._addGMEConnection = function (gmeID, objDesc) {
        var uiComponent;

        this._GMEConnections.push(gmeID);
        this._GMEID2ComponentID[gmeID] = this._GMEID2ComponentID[gmeID] || [];
        objDesc.srcObjId = this._GMEID2ComponentID[objDesc.source] && this._GMEID2ComponentID[objDesc.source][0];
        objDesc.dstObjId = this._GMEID2ComponentID[objDesc.target] && this._GMEID2ComponentID[objDesc.target][0];
        objDesc.reconnectable = true;
        objDesc.editable = true;

        if (!objDesc.srcObjId || !objDesc.dstObjId) {
            return;
        }

        delete objDesc.source;
        delete objDesc.target;

        uiComponent = this.designerCanvas.createConnection(objDesc);
        this._GMEID2ComponentID[gmeID].push(uiComponent.id);
        this._ComponentID2GMEID[uiComponent.id] = gmeID;
    };

    InteractionVisualizerControl.prototype._onLoad = function (gmeID, objDesc) {
        if (gmeID === this.currentNodeInfo.id || !objDesc || objDesc.parentId !== this.currentNodeInfo.id) {
            return;
        }

        if (objDesc.kind === 'CONNECTION') {
            this._addGMEConnection(gmeID, _.extend({}, objDesc));
        } else {
            this._addGMEModel(gmeID, _.extend({}, objDesc));
        }
    };

    InteractionVisualizerControl.prototype._onUpdate = function (gmeID, objDesc) {
        var componentIDs,
            componentID;

        if (gmeID === this.currentNodeInfo.id || !objDesc) {
            return;
        }

        componentIDs = this._GMEID2ComponentID[gmeID] || [];
        if (componentIDs.length === 0) {
            this._onLoad(gmeID, objDesc);
            return;
        }

        if (objDesc.kind === 'CONNECTION') {
            componentID = componentIDs[0];
            objDesc.srcObjId = this._GMEID2ComponentID[objDesc.source] && this._GMEID2ComponentID[objDesc.source][0];
            objDesc.dstObjId = this._GMEID2ComponentID[objDesc.target] && this._GMEID2ComponentID[objDesc.target][0];
            delete objDesc.source;
            delete objDesc.target;
            this.designerCanvas.updateConnection(componentID, objDesc);
        } else {
            componentID = componentIDs[0];
            objDesc.decoratorClass = this._getItemDecorator(objDesc.decorator);
            objDesc.preferencesHelper = PreferencesHelper.getPreferences();
            this.designerCanvas.updateDesignerItem(componentID, objDesc);
        }
    };

    InteractionVisualizerControl.prototype._onUnload = function (gmeID) {
        var componentIDs = this._GMEID2ComponentID[gmeID] || [];

        componentIDs.forEach(function (componentID) {
            this.designerCanvas.deleteComponent(componentID);
            delete this._ComponentID2GMEID[componentID];
        }, this);

        delete this._GMEID2ComponentID[gmeID];
    };

    InteractionVisualizerControl.prototype._getFragmentBoundingBox = function (fragmentId) {
        var fragmentNode = this._client.getNode(fragmentId),
            pos,
            size;

        if (!fragmentNode) {
            return null;
        }

        pos = this._getPosition(fragmentNode, this.META_TYPES.FRAGMENT);
        size = this._getFragmentSize(fragmentNode);

        return {x1: pos.x, y1: pos.y, x2: pos.x + size.width, y2: pos.y + size.height};
    };

    InteractionVisualizerControl.prototype._messageIntersectsFragment = function (messageId, bbox) {
        var messageNode = this._client.getNode(messageId),
            srcId,
            dstId,
            y,
            spanStart,
            spanEnd;

        if (!messageNode) {
            return false;
        }

        srcId = messageNode.getPointer(CONSTANTS.POINTER_SOURCE).to;
        dstId = messageNode.getPointer(CONSTANTS.POINTER_TARGET).to;
        y = this._getMessageY(messageNode, srcId, dstId);
        spanStart = this._getLifelineCenterX(srcId);
        spanEnd = this._getLifelineCenterX(dstId);

        if (srcId === dstId) {
            spanEnd = spanStart + this.SELF_MESSAGE_OFFSET_X;
        }

        return y >= bbox.y1 && y <= bbox.y2 &&
            Math.max(Math.min(spanStart, spanEnd), bbox.x1) <= Math.min(Math.max(spanStart, spanEnd), bbox.x2);
    };

    InteractionVisualizerControl.prototype._lifelineIntersectsFragment = function (lifelineId, bbox) {
        var lifelineNode = this._client.getNode(lifelineId),
            pos,
            height,
            x,
            y1,
            y2;

        if (!lifelineNode) {
            return false;
        }

        pos = this._getPosition(lifelineNode, this.META_TYPES.LIFELINE);
        height = this._getLifelineHeight(lifelineNode);
        x = pos.x + 75;
        y1 = pos.y + this.LIFELINE_HEAD_OFFSET;
        y2 = pos.y + height;

        return x >= bbox.x1 && x <= bbox.x2 &&
            Math.max(y1, bbox.y1) <= Math.min(y2, bbox.y2);
    };

    InteractionVisualizerControl.prototype._syncSetMembers = function (ownerId, setName, currentIds, nextIds) {
        var self = this,
            needsTransaction = false;

        currentIds = currentIds || [];
        nextIds = nextIds || [];

        try {
            currentIds.forEach(function (id) {
                if (nextIds.indexOf(id) === -1) {
                    if (!needsTransaction) {
                        self._client.startTransaction();
                        needsTransaction = true;
                    }
                    self._client.removeMember(ownerId, id, setName);
                }
            });

            nextIds.forEach(function (id) {
                if (currentIds.indexOf(id) === -1) {
                    if (!needsTransaction) {
                        self._client.startTransaction();
                        needsTransaction = true;
                    }
                    self._client.addMember(ownerId, id, setName);
                }
            });
        } catch (err) {
            self.logger.error('Failed synchronizing fragment set members', {
                ownerId: ownerId,
                setName: setName,
                currentIds: currentIds,
                nextIds: nextIds,
                error: err
            });
        } finally {
            if (needsTransaction) {
                self._client.completeTransaction();
            }
        }
    };

    InteractionVisualizerControl.prototype._shouldRefreshCombinedFragmentMemberships = function (events) {
        var self = this;

        if (!this.AUTO_SYNC_FRAGMENT_MEMBERSHIPS || !this.currentNodeInfo.id) {
            return false;
        }

        return events.some(function (event) {
            var nodeObj,
                metaType,
                parentId;

            if (event.eid === self.currentNodeInfo.id) {
                return false;
            }

            nodeObj = self._client.getNode(event.eid);
            parentId = (event.desc && event.desc.parentId) || (nodeObj && nodeObj.getParentId());

            if (parentId !== self.currentNodeInfo.id) {
                return false;
            }

            metaType = nodeObj ? self._getMetaTypeName(event.eid) : '';
            return metaType === self.META_TYPES.FRAGMENT ||
                metaType === self.META_TYPES.LIFELINE ||
                metaType === self.META_TYPES.MESSAGE;
        });
    };

    InteractionVisualizerControl.prototype._scheduleCombinedFragmentMembershipRefresh = function (events) {
        var self = this;

        if (!this._shouldRefreshCombinedFragmentMemberships(events)) {
            return;
        }

        if (this._combinedFragmentSyncTimer) {
            window.clearTimeout(this._combinedFragmentSyncTimer);
        }

        this._combinedFragmentSyncTimer = window.setTimeout(function () {
            self._combinedFragmentSyncTimer = null;
            self._refreshCombinedFragmentMemberships();
        }, this._combinedFragmentSyncDelayMs);
    };

    InteractionVisualizerControl.prototype._refreshCombinedFragmentMemberships = function () {
        var self = this,
            rootNode = this._client.getNode(this.currentNodeInfo.id),
            childIds,
            fragmentIds,
            lifelineIds,
            messageIds;

        if (!this.AUTO_SYNC_FRAGMENT_MEMBERSHIPS || !rootNode) {
            return;
        }

        childIds = rootNode.getChildrenIds();
        fragmentIds = childIds.filter(function (id) {
            return self._getMetaTypeName(id) === self.META_TYPES.FRAGMENT;
        });
        lifelineIds = childIds.filter(function (id) {
            return self._getMetaTypeName(id) === self.META_TYPES.LIFELINE;
        });
        messageIds = childIds.filter(function (id) {
            return self._getMetaTypeName(id) === self.META_TYPES.MESSAGE;
        });

        fragmentIds.forEach(function (fragmentId) {
            var bbox = self._getFragmentBoundingBox(fragmentId),
                fragmentNode = self._client.getNode(fragmentId),
                currentLifelines,
                currentMessages,
                newLifelines,
                newMessages;

            if (!bbox || !fragmentNode) {
                return;
            }

            newLifelines = lifelineIds.filter(function (lifelineId) {
                return self._lifelineIntersectsFragment(lifelineId, bbox);
            });
            newMessages = messageIds.filter(function (messageId) {
                return self._messageIntersectsFragment(messageId, bbox);
            });

            currentLifelines = fragmentNode.getMemberIds('lifelines') || [];
            self._syncSetMembers(fragmentId, 'lifelines', currentLifelines, newLifelines);

            currentMessages = fragmentNode.getMemberIds('messages') || [];
            self._syncSetMembers(fragmentId, 'messages', currentMessages, newMessages);
        });
    };

    InteractionVisualizerControl.prototype._stateActiveObjectChanged = function (model, activeObjectId) {
        if (this.currentNodeInfo.id !== activeObjectId) {
            this.selectedObjectChanged(activeObjectId);
        }
    };

    InteractionVisualizerControl.prototype._attachClientEventListeners = function () {
        this._detachClientEventListeners();
        WebGMEGlobal.State.on('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged, this);
    };

    InteractionVisualizerControl.prototype._detachClientEventListeners = function () {
        WebGMEGlobal.State.off('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged);
    };

    InteractionVisualizerControl.prototype.onActivate = function () {
        this._attachClientEventListeners();
        this.selectedObjectChanged(WebGMEGlobal.State.getActiveObject());
    };

    InteractionVisualizerControl.prototype.onDeactivate = function () {
        this._detachClientEventListeners();
    };

    InteractionVisualizerControl.prototype.destroy = function () {
        if (this._combinedFragmentSyncTimer) {
            window.clearTimeout(this._combinedFragmentSyncTimer);
            this._combinedFragmentSyncTimer = null;
        }
        if (this._territoryId) {
            this._client.removeUI(this._territoryId);
        }
        this._detachClientEventListeners();
    };

    InteractionVisualizerControl.prototype.registerComponentIDForPartID = function (componentID, partId) {
        this._componentIDPartIDMap[componentID] = this._componentIDPartIDMap[componentID] || [];
        if (this._componentIDPartIDMap[componentID].indexOf(partId) === -1) {
            this._componentIDPartIDMap[componentID].push(partId);
        }
    };

    InteractionVisualizerControl.prototype.unregisterComponentIDFromPartID = function (componentID, partId) {
        var idx;

        if (this._componentIDPartIDMap && this._componentIDPartIDMap[componentID]) {
            idx = this._componentIDPartIDMap[componentID].indexOf(partId);
            if (idx !== -1) {
                this._componentIDPartIDMap[componentID].splice(idx, 1);

                if (this._componentIDPartIDMap[componentID].length === 0) {
                    delete this._componentIDPartIDMap[componentID];
                }
            }
        }
    };

    InteractionVisualizerControl.prototype._checkComponentDependency = function (gmeID, eventType) {
        var len;
        if (this._componentIDPartIDMap && this._componentIDPartIDMap[gmeID]) {
            len = this._componentIDPartIDMap[gmeID].length;
            while (len--) {
                this._notifyPackage[this._componentIDPartIDMap[gmeID][len]] =
                    this._notifyPackage[this._componentIDPartIDMap[gmeID][len]] || [];
                this._notifyPackage[this._componentIDPartIDMap[gmeID][len]].push({id: gmeID, event: eventType});
            }
        }
    };

    InteractionVisualizerControl.prototype._handleDecoratorNotification = function () {
        var gmeID,
            i,
            itemID;

        for (gmeID in this._notifyPackage) {
            if (this._notifyPackage.hasOwnProperty(gmeID)) {
                this.logger.debug('NotifyPartDecorator: ' + gmeID + ', componentIDs: ' +
                    JSON.stringify(this._notifyPackage[gmeID]));

                if (this._GMEID2ComponentID.hasOwnProperty(gmeID)) {
                    i = this._GMEID2ComponentID[gmeID].length;
                    while (i--) {
                        itemID = this._GMEID2ComponentID[gmeID][i];
                        this.designerCanvas.notifyItemComponentEvents(itemID, this._notifyPackage[gmeID]);
                    }
                }
            }
        }
    };

    _.extend(
        InteractionVisualizerControl.prototype,
        InteractionVisualizerControlDiagramDesignerWidgetEventHandlers.prototype
    );

    return InteractionVisualizerControl;
});
