/*globals define, _, $*/

/**
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'js/Constants',
    'js/RegistryKeys',
    'js/Utils/ComponentSettings',
    'js/Decorators/DecoratorWithPorts.Base',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.DecoratorBase',
    'decorators/ModelDecorator/Core/Port',
    'decorators/ModelDecorator/Core/ModelDecorator.Core',
    'text!./SysML.DiagramDesignerWidget.html',
    'css!./SysML.DiagramDesignerWidget.css'
], function (CONSTANTS,
             REGISTRY_KEYS,
             ComponentSettings,
             DecoratorWithPortsBase,
             DiagramDesignerWidgetDecoratorBase,
             Port,
             ModelDecoratorCore,
             SysMLDecoratorTemplate) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvSysMLDecorator',
        SysMLPort,
        HEIGHT_REG_KEY = 'decoratorHeight',
        WIDTH_REG_KEY = 'decoratorWidth',
        PORT_CONTAINER_OFFSET_Y = 15,
        MIN_WIDTH = 60,
        MIN_HEIGHT = 40,
        NO_DROP_COLOR = 'rgba(255, 0, 0, 0.1)',
        ALLOW_DROP_COLOR = 'rgba(0, 255, 0, 0.1)';

    function SysMLDiagramDesigner(options) {
        var opts = _.extend({}, options);

        DiagramDesignerWidgetDecoratorBase.apply(this, [opts]);
        DecoratorWithPortsBase.apply(this, []);
        this._displayConnectors = true;

        this.config = this.getDefaultConfig();
        ComponentSettings.resolveWithWebGMEGlobal(this.config, this.getComponentId());

        this.name = '';
        this.description = '';
        this.metaId = '';
        this.metaDescription = '';
        this.size = {
            width: MIN_WIDTH,
            height: MIN_HEIGHT
        };

        this.fields = {
            // <attrName>: {
            //   el: <$el>,
            //   value: <string>,
            //   name: <string>,
            //   type: <null||string>,
            //   lineCnt: <number>
            // }
        };

        this.logger.debug('SysMLDiagramDesigner ctor');
    }

    SysMLPort = function (id, options) {
        Port.call(this, id, options);
    };

    _.extend(SysMLPort.prototype, Port.prototype);

    SysMLPort.prototype.getConnectorArea = function () {
        var connectorOffset,
            decoratorOffset,
            connectorWidth = this.$connectors.outerWidth() || 8,
            connectorHeight = this.$connectors.outerHeight() || 15,
            connectorGap = 2,
            x,
            y;

        if (!this.$el || this.$el.length === 0 || !this.decorator || !this.decorator.$el ||
            this.decorator.$el.length === 0 || !this.$connectors || this.$connectors.length === 0) {
            return Port.prototype.getConnectorArea.call(this);
        }

        connectorOffset = this.$connectors.offset();
        decoratorOffset = this.decorator.$el.offset();

        if (!connectorOffset || !decoratorOffset) {
            return Port.prototype.getConnectorArea.call(this);
        }

        x = connectorOffset.left - decoratorOffset.left + connectorWidth / 2;
        y = connectorOffset.top - decoratorOffset.top + connectorHeight / 2;

        switch (this.orientation) {
            case 'N':
                y = connectorOffset.top - decoratorOffset.top - connectorGap;
                this.connectionArea.angle1 = this.connectionArea.angle2 = 270;
                break;
            case 'S':
                y = connectorOffset.top - decoratorOffset.top + connectorHeight + connectorGap;
                this.connectionArea.angle1 = this.connectionArea.angle2 = 90;
                break;
            case 'W':
                x = connectorOffset.left - decoratorOffset.left - connectorGap;
                this.connectionArea.angle1 = this.connectionArea.angle2 = 180;
                break;
            default:
                x = connectorOffset.left - decoratorOffset.left + connectorWidth + connectorGap;
                this.connectionArea.angle1 = this.connectionArea.angle2 = 0;
                break;
        }

        this.connectionArea.x1 = this.connectionArea.x2 = Math.round(x);
        this.connectionArea.y1 = this.connectionArea.y2 = Math.round(y);
        this.connectionArea.len = 10;

        return this.connectionArea;
    };

    _.extend(SysMLDiagramDesigner.prototype, DiagramDesignerWidgetDecoratorBase.prototype);
    _.extend(SysMLDiagramDesigner.prototype, DecoratorWithPortsBase.prototype);
    SysMLDiagramDesigner.prototype.DECORATORID = DECORATOR_ID;

    SysMLDiagramDesigner.prototype.getComponentId = function () {
        return DECORATOR_ID;
    };

    SysMLDiagramDesigner.prototype.getTerritoryQuery = function () {
        return DecoratorWithPortsBase.prototype.getTerritoryQuery.call(this);
    };

    SysMLDiagramDesigner.prototype.getDefaultConfig = function () {
        return {
            textAlign: 'left',
            attrBlackList: [],
        };
    };
    /*********************** OVERRIDE DiagramDesignerWidgetDecoratorBase MEMBERS **************************/

    SysMLDiagramDesigner.prototype.$DOMBase = $(SysMLDecoratorTemplate);

    SysMLDiagramDesigner.prototype.on_addTo = function () {
        var self = this;

        // initializations
        this.nodeId = this._metaInfo[CONSTANTS.GME_ID];
        this.client = this._control._client;
        this.$name = this.$el.find('#name');
        this.$type = this.$el.find('#type');
        this.$relation = this.$el.find('.relation');
        this.$justify = this.$el.find('.justify');
        this.$titleSeparator = this.$el.find('.title-separator');
        this.$attributeContainer = this.$el.find('.attribute-container');
        this.$descriptionContainer = this.$attributeContainer.find('.description');
        this.$portsContainer = this.$el.find('.ports');
        this.$portsContainerLeft = this.$portsContainer.find('.left');
        this.$portsContainerCenter = this.$portsContainer.find('.center');
        this.$portsContainerRight = this.$portsContainer.find('.right');
        this.$portsContainerTop = this.$el.find('.top-ports');
        this.$portsContainerBottom = this.$el.find('.bottom-ports');
        this.$metaTable = this.$el.find('.meta-table');
        this.$reszieIcon = this.$el.find('.resize-icon');
        this.mouseStartPos = null;
        this.elStartSize = null;


        function calculateNewSize(event) {
            var dX = event.pageX - self.mouseStartPos.x,
                dY = event.pageY - self.mouseStartPos.y,
                width = self.elStartSize.width,
                height = self.elStartSize.height,
                newX,
                newY;

            dX = dX / self.hostDesignerItem.canvas._zoomRatio;
            dY = dY / self.hostDesignerItem.canvas._zoomRatio;
            newX = width + dX;
            newY = height + dY;

            newX = newX > MIN_WIDTH ? newX : MIN_WIDTH;
            newY = newY > MIN_HEIGHT ? newY : MIN_HEIGHT;

            return {
                width: Math.round(newX),
                height: Math.round(newY)
            };
        }

        function mouseMoveHandler(event) {
            var newSize = calculateNewSize(event);

            self.$el.width(newSize.width);
            self.$el.height(newSize.height);

            if (self.hostDesignerItem) {
                self.hostDesignerItem.setSize(newSize.width, newSize.height);
                self._notifyAllPortPositionsChanged();
            }

            event.stopPropagation();
            event.preventDefault();
        }

        function mouseUpHandler(event) {
            var newSize = calculateNewSize(event);

            self.mouseStartPos = null;
            self.mouseCurrPos = null;
            $(document).off('mousemove', mouseMoveHandler);
            $(document).off('mouseup', mouseUpHandler);

            if (self.hostDesignerItem) {
                self.hostDesignerItem.setSize(newSize.width, newSize.height);
            }

            self.client.startTransaction();
            self.client.setRegistry(self.nodeId, WIDTH_REG_KEY, newSize.width);
            self.client.setRegistry(self.nodeId, HEIGHT_REG_KEY, newSize.height);
            self.client.completeTransaction();

            self._schedulePortRefresh(newSize.width, newSize.height);
        }
        this.$reszieIcon.on('mousedown', function (event) {
            self.mouseStartPos = {
                x: event.pageX,
                y: event.pageY,
            };

            self.elStartSize = {
                width: self.$el.width(),
                height: self.$el.height()
            };

            // console.log('mouse down on icon', JSON.stringify(self.mouseStartPos));

            $(document).on('mousemove', mouseMoveHandler);
            $(document).on('mouseup', mouseUpHandler);

            event.stopPropagation();
            event.preventDefault();
        });

        // Render the stuff.
        this._renderSize();
        this._renderName();
        this._renderColors();
        this._updatePorts();

    };

    SysMLDiagramDesigner.prototype.update = function () {
        this._renderSize();
        this._renderName();
        this._renderColors();
        this._updatePorts();

    };

    SysMLDiagramDesigner.prototype.onRenderGetLayoutInfo = function () {
        this._paddingTop = parseInt(this.$el.css('padding-top'), 10) || 0;
        this._borderTop = parseInt(this.$el.css('border-top-width'), 10) || 0;

        DiagramDesignerWidgetDecoratorBase.prototype.onRenderGetLayoutInfo.call(this);
    };

    SysMLDiagramDesigner.prototype.destroy = function () {
        var len = this.portIDs.length;

        while (len--) {
            this.unregisterPortIdForNotification(this.portIDs[len]);
            this.removePort(this.portIDs[len]);
        }
    };

    SysMLDiagramDesigner.prototype._renderSize = function () {
        var nodeObj = this.client.getNode(this.nodeId),
            width,
            height,
            changed = false;

        if (nodeObj) {
            width = nodeObj.getRegistry(WIDTH_REG_KEY);
            height = nodeObj.getRegistry(HEIGHT_REG_KEY);
        }

        if (width && width !== this.size.width) {
            this.size.width = width;
            this.$el.width(width);
            changed = true;
        }

        if (height && height !== this.size.height) {
            this.size.height = height;
            this.$el.height(height);
            changed = true;
        }

        if (changed && this.hostDesignerItem) {
            this._schedulePortRefresh(this.size.width, this.size.height);
        }
    };



    SysMLDiagramDesigner.prototype._renderName = function () {
        var nodeObj = this.client.getNode(this.nodeId),
            name,
            elementSysMLType,
            description,
            metaId,
            metaDescription;

        if (nodeObj) {
            name = this.getDisplayName(nodeObj);
            const parentId = nodeObj.getParentId();
            const parentNode = this.client.getNode(parentId);
            if (parentNode) {
                elementSysMLType = this.obtainClassSysml(nodeObj);
            }
            metaId = nodeObj.getAttribute('id') || '';
            metaDescription = nodeObj.getAttribute('description') || '';
        }
        description = this.obtainDescriptionSysml(nodeObj);

        if (name !== this.name) {
            this.name = name;
            this.$name.text(this.name);
        }
        if (elementSysMLType !== this.elementSysMLType) {
            this.elementSysMLType = elementSysMLType;
            this.$type.text(this.elementSysMLType);
        }
        if (description !== this.description) {
            this.description = description;
            this.$descriptionContainer.html(this.description);
        }
        if (metaId !== this.metaId || metaDescription !== this.metaDescription) {
            this.metaId = metaId;
            this.metaDescription = metaDescription;
            this._renderMetaTable();
        }
    };

    SysMLDiagramDesigner.prototype._renderMetaTable = function () {
        var rows = [];

        function esc(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        if (this.metaId) {
            rows.push('<tr><td class="meta-key">id</td><td class="meta-val">' + esc(this.metaId) + '</td></tr>');
        }
        if (this.metaDescription) {
            rows.push('<tr><td class="meta-key">description</td><td class="meta-val">' + esc(this.metaDescription) + '</td></tr>');
        }

        if (rows.length > 0) {
            this.$metaTable.html('<table class="meta-fields">' + rows.join('') + '</table><hr class="meta-separator">');
        } else {
            this.$metaTable.empty();
        }
    };

    SysMLDiagramDesigner.prototype._updatePorts = function () {
        this.updatePortIDList();
        this._togglePortsVisibility();
    };

    SysMLDiagramDesigner.prototype._updatePort = function (portId) {
        var portNode = this.client.getNode(portId),
            idx = this.portIDs.indexOf(portId),
            isPort = this.isPort(portId),
            title;

        if (idx !== -1) {
            if (isPort === true && portNode) {
                title = this.getPortTitle(portNode);
                this.ports[portId].update({
                    title: title
                });
                this._updatePortPosition(portId);
            } else {
                this.removePort(portId);
            }
        } else if (isPort === true) {
            this.addPort(portId);
        }

        this._togglePortsVisibility();
    };

    SysMLDiagramDesigner.prototype.updateSubcomponent = function (portId) {
        this._updatePort(portId);
    };

    SysMLDiagramDesigner.prototype.notifyComponentEvent = function (componentList) {
        var len = componentList.length;

        while (len--) {
            this._updatePort(componentList[len].id);
        }

        this._togglePortsVisibility();
    };

    SysMLDiagramDesigner.prototype.renderPort = function (portId) {
        var portNode = this.client.getNode(portId),
            portInstance;

        this.__registerAsSubcomponent(portId);
        portInstance = new SysMLPort(portId, {
            title: this.getPortTitle(portNode),
            decorator: this
        });

        this._addPortToContainer(portNode, portInstance);

        return portInstance;
    };

    SysMLDiagramDesigner.prototype.getPortTitle = function (portNode) {
        return portNode ? portNode.getAttribute('name') || '' : '';
    };

    SysMLDiagramDesigner.prototype._addPortToContainer = function (portNode, portInstance) {
        var portId = portNode.getId(),
            portPosition = portNode.getRegistry(REGISTRY_KEYS.POSITION) || {x: 0, y: 0},
            portOrientation = portNode.getRegistry(REGISTRY_KEYS.PORT_ORIENTATION),
            portContainer = this.$portsContainerLeft,
            portToAppendBefore = null,
            orderAxis = 'y',
            changed,
            i;

        switch (portOrientation) {
            case 'E':
                portContainer = this.$portsContainerRight;
                break;
            case 'N':
                portContainer = this.$portsContainerTop;
                orderAxis = 'x';
                break;
            case 'S':
                portContainer = this.$portsContainerBottom;
                orderAxis = 'x';
                break;
            case 'W':
                portContainer = this.$portsContainerLeft;
                break;
            default:
                if (portPosition.x > 300) {
                    portOrientation = 'E';
                    portContainer = this.$portsContainerRight;
                } else {
                    portOrientation = 'W';
                    portContainer = this.$portsContainerLeft;
                }
                break;
        }

        changed = portInstance.updateOrPos(portOrientation, portPosition);

        for (i in this.ports) {
            if (this.ports.hasOwnProperty(i) &&
                i !== portId &&
                this.ports[i].orientation === portInstance.orientation &&
                ((portInstance.position[orderAxis] < this.ports[i].position[orderAxis]) ||
                (portInstance.position[orderAxis] === this.ports[i].position[orderAxis] &&
                    portInstance.title < this.ports[i].title))) {
                if (portToAppendBefore === null ||
                    this.ports[i].position[orderAxis] < this.ports[portToAppendBefore].position[orderAxis] ||
                    (this.ports[i].position[orderAxis] === this.ports[portToAppendBefore].position[orderAxis] &&
                        this.ports[i].title < this.ports[portToAppendBefore].title)) {
                    portToAppendBefore = i;
                }
            }
        }

        if (portToAppendBefore === null) {
            portContainer.append(portInstance.$el);
        } else {
            portInstance.$el.insertBefore(this.ports[portToAppendBefore].$el);
        }

        if (changed === true) {
            this._portPositionChanged(portId);
        }
    };

    SysMLDiagramDesigner.prototype._updatePortPosition = function (portId) {
        var portNode = this.client.getNode(portId),
            portPosition = portNode.getRegistry(REGISTRY_KEYS.POSITION) || {x: 0, y: 0},
            portOrientation = portNode.getRegistry(REGISTRY_KEYS.PORT_ORIENTATION),
            currentPort = this.ports[portId],
            resolvedOrientation = portOrientation;

        if (!currentPort) {
            return;
        }

        if (!resolvedOrientation) {
            resolvedOrientation = portPosition.x > 300 ? 'E' : 'W';
        }

        if (currentPort.orientation !== resolvedOrientation ||
            currentPort.position.x !== portPosition.x ||
            currentPort.position.y !== portPosition.y) {
            currentPort.$el.detach();
            this._addPortToContainer(portNode, currentPort);
        }
    };

    SysMLDiagramDesigner.prototype._togglePortsVisibility = function () {
        if (this.portIDs.length > 0) {
            this.$portsContainer.css('display', 'flex');
            this.$portsContainerTop.css('display', 'flex');
            this.$portsContainerBottom.css('display', 'flex');
        } else {
            this.$portsContainer.hide();
            this.$portsContainerTop.hide();
            this.$portsContainerBottom.hide();
        }
    };

    SysMLDiagramDesigner.prototype.showSourceConnectors = function (params) {
        var connectors,
            i;

        if (!params) {
            this.$sourceConnectors.show();
            if (this.portIDs) {
                i = this.portIDs.length;
                while (i--) {
                    this.ports[this.portIDs[i]].showConnectors();
                }
            }
        } else {
            connectors = params.connectors;
            i = connectors.length;
            while (i--) {
                if (connectors[i] === undefined) {
                    this.$sourceConnectors.show();
                } else if (this.ports[connectors[i]]) {
                    this.ports[connectors[i]].showConnectors();
                }
            }
        }
    };

    SysMLDiagramDesigner.prototype.hideSourceConnectors = function () {
        var i;

        this.$sourceConnectors.hide();

        if (this.portIDs) {
            i = this.portIDs.length;
            while (i--) {
                this.ports[this.portIDs[i]].hideConnectors();
            }
        }
    };

    SysMLDiagramDesigner.prototype.showEndConnectors = function (params) {
        this.showSourceConnectors(params);
    };

    SysMLDiagramDesigner.prototype.hideEndConnectors = function () {
        this.hideSourceConnectors();
    };

    SysMLDiagramDesigner.prototype._portPositionChanged = function (portId) {
        this.onRenderGetLayoutInfo();
        this.hostDesignerItem.canvas.dispatchEvent(
            this.hostDesignerItem.canvas.events.ITEM_SUBCOMPONENT_POSITION_CHANGED,
            {
                ItemID: this.hostDesignerItem.id,
                SubComponentID: portId
            }
        );
    };

    SysMLDiagramDesigner.prototype._notifyAllPortPositionsChanged = function () {
        var i,
            routeManager;

        if (!this.hostDesignerItem || !this.hostDesignerItem.canvas) {
            return;
        }

        routeManager = this.hostDesignerItem.canvas.connectionRouteManager;
        this.onRenderGetLayoutInfo();

        for (i = 0; i < this.portIDs.length; i += 1) {
            this.hostDesignerItem.canvas.dispatchEvent(
                this.hostDesignerItem.canvas.events.ITEM_SUBCOMPONENT_POSITION_CHANGED,
                {
                    ItemID: this.hostDesignerItem.id,
                    SubComponentID: this.portIDs[i]
                }
            );

            if (routeManager && typeof routeManager._updatePort === 'function') {
                routeManager._updatePort(this.hostDesignerItem.id, this.portIDs[i]);
            }
        }
    };

    SysMLDiagramDesigner.prototype._schedulePortRefresh = function (width, height) {
        var self = this;

        if (!this.hostDesignerItem || !this.hostDesignerItem.canvas) {
            return;
        }

        window.requestAnimationFrame(function () {
            self.hostDesignerItem.setSize(width, height);
            self._notifyAllPortPositionsChanged();
        });
    };

    SysMLDiagramDesigner.prototype.removePort = function (portId) {
        var idx = this.portIDs.indexOf(portId);

        if (idx !== -1) {
            this.__unregisterAsSubcomponent(portId);
        }

        DecoratorWithPortsBase.prototype.removePort.call(this, portId);
    };

    SysMLDiagramDesigner.prototype.__registerAsSubcomponent = function (portId) {
        if (this.hostDesignerItem) {
            this.hostDesignerItem.registerSubcomponent(portId, {GME_ID: portId});
        }
    };

    SysMLDiagramDesigner.prototype.__unregisterAsSubcomponent = function (portId) {
        if (this.hostDesignerItem) {
            this.hostDesignerItem.unregisterSubcomponent(portId);
        }
    };

    SysMLDiagramDesigner.prototype.getDisplayName = function (node) {
        var name = node.getAttribute('name') || '',
            baseId = node.getBaseId(),
            metaTypeId = node.getMetaTypeId(),
            baseNode,
            baseName;

        if (baseId && baseId !== metaTypeId) {
            baseNode = this.client.getNode(baseId);

            if (baseNode) {
                baseName = baseNode.getAttribute('name') || '';

                if (baseName) {
                    return name + ': ' + baseName;
                }
            }
        }

        return name;
    };

    SysMLDiagramDesigner.prototype.obtainDescriptionSysml = function (node) {
        return node ? node.getAttribute('description') || '' : '';
    };

    SysMLDiagramDesigner.prototype.obtainClassSysml = function (node) {
        var metaNodeId,
            metaNode,
            metaName,
            stereotypes;

        if (!node) {
            return '';
        }

        metaNodeId = node.getMetaTypeId();
        metaNode = this.client.getNode(metaNodeId);

        if (!metaNode) {
            return '';
        }

        metaName = metaNode.getAttribute('name');

        if (metaName === 'Block') {
            stereotypes = this.getSortedStereotypeNames(node);

            if (stereotypes.length > 0) {
                return stereotypes.map(function (name) {
                    return '<<' + name + '>>';
                }).join(', ');
            }
        }

        return '<<' + metaName + '>>';
    };

    SysMLDiagramDesigner.prototype.getSortedStereotypeNames = function (node) {
        return node.getChildrenIds()
            .map(function (childId) {
                return this.client.getNode(childId);
            }, this)
            .filter(function (childNode) {
                var childMetaNode;

                if (!childNode) {
                    return false;
                }

                childMetaNode = this.client.getNode(childNode.getMetaTypeId());

                return childMetaNode && childMetaNode.getAttribute('name') === 'Stereotype';
            }, this)
            .map(function (childNode) {
                return childNode.getAttribute('name') || '';
            })
            .filter(function (name) {
                return name;
            })
            .sort(function (left, right) {
                left = left.toLowerCase();
                right = right.toLowerCase();

                if (left < right) {
                    return -1;
                }

                if (left > right) {
                    return 1;
                }

                return 0;
            });
    };

    SysMLDiagramDesigner.prototype.getConnectionAreas = function (id /*, isEnd, connectionMetaInfo*/) {
        var result = [],
            edge = 10,
            LEN = 20;

        //by default return the bounding box edge's midpoints

        if (id === undefined || id === this.hostDesignerItem.id) {
            var eastEnabled = true,
                westEnabled = true,
                southEnabled = true,
                northEnabled = true,
                pId;

            for (pId in this.ports) {
                if (this.ports.hasOwnProperty(pId)) {
                    if (this.ports[pId].orientation === 'E') {
                        eastEnabled = false;
                    } else if (this.ports[pId].orientation === 'W') {
                        westEnabled = false;
                    } else if (this.ports[pId].orientation === 'S') {
                        southEnabled = false;
                    } else if (this.ports[pId].orientation === 'N') {
                        northEnabled = false;
                    }
                }
            }

            //NORTH
            if (northEnabled) {
                result.push({
                    id: 'N',
                    x1: edge,
                    y1: 0,
                    x2: this.hostDesignerItem.getWidth() - edge,
                    y2: 0,
                    angle1: 270,
                    angle2: 270,
                    len: LEN
                });
                this.$el.find('.connector.top').removeClass('has-ports');
            } else {
                this.$el.find('.connector.top').addClass('has-ports');
            }

            if (northEnabled === false && southEnabled === false) {
                this.$el.find('.connector.top-left').removeClass('has-ports');

                if (eastEnabled === false && westEnabled === false) {
                    result.push({
                        id: 'NW',
                        x1: 0,
                        y1: edge,
                        x2: 0,
                        y2: edge,
                        angle1: 180,
                        angle2: 180,
                        len: LEN
                    });
                }
            } else {
                this.$el.find('.connector.top-left').addClass('has-ports');
            }

            if (eastEnabled) {
                result.push({
                    id: 'E',
                    x1: this.hostDesignerItem.getWidth(),
                    y1: edge,
                    x2: this.hostDesignerItem.getWidth(),
                    y2: this.hostDesignerItem.getHeight() - edge,
                    angle1: 0,
                    angle2: 0,
                    len: LEN
                });
                this.$el.find('.connector.right').removeClass('has-ports');
            } else {
                this.$el.find('.connector.right').addClass('has-ports');
            }

            if (southEnabled) {
                result.push({
                    id: 'S',
                    x1: edge,
                    y1: this.hostDesignerItem.getHeight(),
                    x2: this.hostDesignerItem.getWidth() - edge,
                    y2: this.hostDesignerItem.getHeight(),
                    angle1: 90,
                    angle2: 90,
                    len: LEN
                });
                this.$el.find('.connector.bottom').removeClass('has-ports');
            } else {
                this.$el.find('.connector.bottom').addClass('has-ports');
            }

            if (westEnabled) {
                result.push({
                    id: 'W',
                    x1: 0,
                    y1: edge,
                    x2: 0,
                    y2: this.hostDesignerItem.getHeight() - edge,
                    angle1: 180,
                    angle2: 180,
                    len: LEN
                });
                this.$el.find('.connector.left').removeClass('has-ports');
            } else {
                this.$el.find('.connector.left').addClass('has-ports');
            }
        } else if (this.ports[id]) {
            var portConnArea = this.ports[id].getConnectorArea(),
                idx = this.portIDs.indexOf(id);

            result.push({
                id: idx,
                x1: portConnArea.x1,
                y1: portConnArea.y1 + PORT_CONTAINER_OFFSET_Y + this._paddingTop + this._borderTop,
                x2: portConnArea.x2,
                y2: portConnArea.y2 + PORT_CONTAINER_OFFSET_Y + this._paddingTop + this._borderTop,
                angle1: portConnArea.angle1,
                angle2: portConnArea.angle2,
                len: portConnArea.len
            });
        }

        return result;
    };

    SysMLDiagramDesigner.prototype.doSearch = function (searchDesc) {
        var searchText = searchDesc.toString();

        if (this.name &&
            this.name.toLowerCase().indexOf(searchText.toLowerCase()) > -1) {
            return true;
        }

        return false;
    };
    SysMLDiagramDesigner.prototype._renderColors = function () {
        // TODO: apply the user-selected colour here
        ModelDecoratorCore.prototype._getNodeColorsFromRegistry.apply(this);
        var nodeObj = this.client.getNode(this.nodeId),
            borderColor,
            backgroundColor,
            textColor;

        if (nodeObj) {
            borderColor = nodeObj.getAttribute('bordercolor') || '';
            backgroundColor = nodeObj.getAttribute('backgroundcolor') || '';
            textColor = nodeObj.getAttribute('textcolor') || '';
        }

        var self = this,
            style = {
            backgroundColor,
                backgroundColor: backgroundColor ? backgroundColor : '#ffffff',
                borderColor: borderColor ? borderColor : '#000000',
                color: textColor ? textColor : '#000000',
            },
            contentStyle = {
                backgroundColor: backgroundColor ? backgroundColor : '',
                color: textColor ? textColor : '',
            };

        this.$el.css(style);

        Object.keys(self.fields)
            .forEach(function (attrName) {
                self.fields[attrName].el.find('textarea').css(contentStyle);
            });
    };

    SysMLDiagramDesigner.prototype._canAcceptTarget = function (dataTransfer) {
        //We handle only a single drop element, but microsoft word copies two elements actually for a single text...
        if (dataTransfer.items.length > 0) {
            if (dataTransfer.items[0].kind === 'string' ||
                (dataTransfer.items[0].kind === 'file' && (dataTransfer.items[0].type.indexOf('text') === 0 || dataTransfer.items[0].type === ''))) {
                return true;
            }
        }
        return false;
    };

    SysMLDiagramDesigner.prototype._getDropContentAsString = function (dataTransfer, callback) {
        var file,
            reader;

        if (dataTransfer.items[0].kind === 'string') {
            callback(dataTransfer.getData('Text'));
        } else {
            file = dataTransfer.files[0];
            reader = new FileReader();

            reader.onload = function (event) {
                callback(event.target.result);
            };
            reader.readAsText(file);
        }
    };
    /**
     * Initialize Dialog and Editor creation
     * @return {void}
     */
    SysMLDiagramDesigner.prototype._showEditorDialog = function () {
        var self = this;
        var client = this._control._client;
        var nodeObj = client.getNode(this._metaInfo[CONSTANTS.GME_ID]);
        var description = nodeObj.getAttribute('description') || '';
        var name = nodeObj.getAttribute('name') || '';

        // Initialize with documentation attribute and save callback function

    };

    return SysMLDiagramDesigner;
});
