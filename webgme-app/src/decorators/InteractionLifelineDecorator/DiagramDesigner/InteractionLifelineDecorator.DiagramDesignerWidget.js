/*globals define, _, $*/

define([
    'js/Constants',
    'js/NodePropertyNames',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.DecoratorBase',
    'text!./InteractionLifelineDecorator.DiagramDesignerWidget.html',
    'css!./InteractionLifelineDecorator.DiagramDesignerWidget.css'
], function (
    CONSTANTS,
    nodePropertyNames,
    DiagramDesignerWidgetDecoratorBase,
    template
) {
    'use strict';

    var DECORATOR_ID = 'InteractionLifelineDecoratorDiagramDesignerWidget',
        DEFAULT_HEIGHT = 520,
        MIN_CONNECTOR_COUNT = 5,
        CONNECTOR_SPACING = 80,
        CONNECTOR_TOP_OFFSET = 80,
        CONNECTOR_BOTTOM_OFFSET = 16;

    function InteractionLifelineDecorator(options) {
        DiagramDesignerWidgetDecoratorBase.apply(this, [_.extend({}, options)]);
    }

    _.extend(InteractionLifelineDecorator.prototype, DiagramDesignerWidgetDecoratorBase.prototype);
    InteractionLifelineDecorator.prototype.DECORATORID = DECORATOR_ID;
    InteractionLifelineDecorator.prototype.$DOMBase = $(template);

    InteractionLifelineDecorator.prototype.initializeConnectors = function () {
        this.$sourceConnectors = $();
        this.$endConnectors = this.$sourceConnectors;
        this.hideSourceConnectors();
    };

    InteractionLifelineDecorator.prototype.on_addTo = function () {
        this._registerConnectorSubcomponents();
        this._render();
    };

    InteractionLifelineDecorator.prototype.update = function () {
        this._render();
    };

    InteractionLifelineDecorator.prototype._render = function () {
        var nodeId = this._metaInfo[CONSTANTS.GME_ID],
            nodeObj = this._control._client.getNode(nodeId),
            name = '',
            height = DEFAULT_HEIGHT;

        if (!nodeObj) {
            return;
        }

        name = nodeObj.getAttribute(nodePropertyNames.Attributes.name) || '';
        height = nodeObj.getRegistry('decoratorHeight') || DEFAULT_HEIGHT;

        this.$el.find('.interaction-lifeline-decorator__name').text(name);
        this.$el.find('.interaction-lifeline-decorator__block').text(this._getBlockLabel(nodeObj));
        this.$el.find('.interaction-lifeline-decorator__line').css('height', Math.max(height - 70, 120) + 'px');
        this.$el.css('min-height', height + 'px');
        this._syncConnectors(height);

        if (this.hostDesignerItem) {
            this.hostDesignerItem.setSize(this.$el.outerWidth(true), this.$el.outerHeight(true));
        }
    };

    InteractionLifelineDecorator.prototype._getConnectorContainer = function () {
        return this.$el.find('.interaction-lifeline-decorator__connectors');
    };

    InteractionLifelineDecorator.prototype.destroy = function () {
        this._unregisterConnectorSubcomponents();
    };

    InteractionLifelineDecorator.prototype._getBlockLabel = function (nodeObj) {
        var client = this._control._client,
            names = [],
            setNames = nodeObj.getSetNames ? nodeObj.getSetNames() : [],
            pointerNames = nodeObj.getPointerNames ? nodeObj.getPointerNames() : [];

        setNames.forEach(function (setName) {
            if (setName.toLowerCase().indexOf('block') !== -1) {
                nodeObj.getMemberIds(setName).forEach(function (id) {
                    var blockNode = client.getNode(id);
                    if (blockNode) {
                        names.push(blockNode.getAttribute(nodePropertyNames.Attributes.name) || '');
                    }
                });
            }
        });

        pointerNames.forEach(function (ptrName) {
            var id,
                blockNode;

            if (ptrName.toLowerCase().indexOf('block') !== -1) {
                id = nodeObj.getPointer(ptrName).to;
                blockNode = id && client.getNode(id);
                if (blockNode) {
                    names.push(blockNode.getAttribute(nodePropertyNames.Attributes.name) || '');
                }
            }
        });

        names = names.filter(function (name, idx, arr) {
            return name && arr.indexOf(name) === idx;
        });

        return names.length > 0 ? ': ' + names.join(', ') : '';
    };

    InteractionLifelineDecorator.prototype._getConnectorCount = function (height) {
        return Math.max(MIN_CONNECTOR_COUNT, Math.floor((height - CONNECTOR_TOP_OFFSET - CONNECTOR_BOTTOM_OFFSET) /
            CONNECTOR_SPACING) + 1);
    };

    InteractionLifelineDecorator.prototype._getConnectorId = function (index) {
        return 'p' + index;
    };

    InteractionLifelineDecorator.prototype._getConnectorIndex = function (connectorId) {
        var parsed = parseInt((connectorId || '').replace(/^p/, ''), 10);

        return isNaN(parsed) ? 0 : parsed;
    };

    InteractionLifelineDecorator.prototype._getConnectorY = function (connectorId) {
        return CONNECTOR_TOP_OFFSET + this._getConnectorIndex(connectorId) * CONNECTOR_SPACING;
    };

    InteractionLifelineDecorator.prototype._syncConnectors = function (height) {
        var self = this,
            count = this._getConnectorCount(height),
            connectorIds = [],
            $container = this.$el.find('.interaction-lifeline-decorator__connectors');

        if (this._connectorIds && this._connectorIds.length) {
            this._unregisterConnectorSubcomponents();
        }

        $container.empty();

        while (count--) {
            connectorIds.unshift(this._getConnectorId(count));
        }

        connectorIds.forEach(function (connectorId) {
            var $connector = $('<div/>', {
                'class': 'connector',
                'data-connector-id': connectorId
            });

            $connector.css('top', self._getConnectorY(connectorId) + 'px');
            $container.append($connector);
            self.hostDesignerItem.registerConnectors($connector, connectorId);
            $connector.on('mouseup.interaction-lifeline-expand', function (event) {
                var nodeId = self._metaInfo && self._metaInfo[CONSTANTS.GME_ID];

                if (!nodeId || connectorId !== self._connectorIds[self._connectorIds.length - 1]) {
                    return;
                }

                if (self.hostDesignerItem &&
                    self.hostDesignerItem.canvas &&
                    self.hostDesignerItem.canvas.connectionDrawingManager &&
                    self.hostDesignerItem.canvas.connectionDrawingManager.isDrawInProgress() === true &&
                    self.hostDesignerItem.canvas.connectionDrawingManager._minimalDistanceMet === true) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                self._control._client.setRegistry(nodeId, 'decoratorHeight', height + CONNECTOR_SPACING);
            });
        });

        this.$sourceConnectors = $container.find('.connector');
        this.$endConnectors = this.$sourceConnectors;
        this._connectorIds = connectorIds;
        this._registerConnectorSubcomponents();
        this.hideSourceConnectors();
    };

    InteractionLifelineDecorator.prototype._registerConnectorSubcomponents = function () {
        var self = this,
            gmeId = this._metaInfo && this._metaInfo[CONSTANTS.GME_ID];

        if (!this.hostDesignerItem || !gmeId || !this._connectorIds || this._subcomponentsRegistered === true) {
            return;
        }

        this._connectorIds.forEach(function (connectorId) {
            self.hostDesignerItem.registerSubcomponent(connectorId, {
                GME_ID: gmeId
            });
        });

        this._subcomponentsRegistered = true;
    };

    InteractionLifelineDecorator.prototype._unregisterConnectorSubcomponents = function () {
        var self = this;

        if (!this.hostDesignerItem || this._subcomponentsRegistered !== true) {
            return;
        }

        (this._connectorIds || []).forEach(function (connectorId) {
            self.hostDesignerItem.unregisterSubcomponent(connectorId);
        });

        this._subcomponentsRegistered = false;
    };

    InteractionLifelineDecorator.prototype.getConnectionAreas = function (id) {
        var centerX = this.hostDesignerItem.getWidth() / 2,
            y,
            len = 20;

        if (id) {
            y = this._getConnectorY(id);

            return [{
                id: id,
                x1: centerX,
                y1: y,
                x2: centerX,
                y2: y,
                angle1: 0,
                angle2: 180,
                len: len
            }];
        }

        return (this._connectorIds || []).map(function (connectorId) {
            y = this._getConnectorY(connectorId);

            return {
                id: connectorId,
                x1: centerX,
                y1: y,
                x2: centerX,
                y2: y,
                angle1: 0,
                angle2: 180,
                len: len
            };
        }, this);
    };

    InteractionLifelineDecorator.prototype.showSourceConnectors = function () {
        this.$sourceConnectors.appendTo(this._getConnectorContainer());
    };

    InteractionLifelineDecorator.prototype.showEndConnectors = function () {
        this.$endConnectors.appendTo(this._getConnectorContainer());
    };

    return InteractionLifelineDecorator;
});
