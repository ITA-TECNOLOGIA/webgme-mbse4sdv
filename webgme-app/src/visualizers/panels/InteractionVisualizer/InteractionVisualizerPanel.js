/*globals define, _, WebGMEGlobal*/

define([
    'js/PanelBase/PanelBaseWithHeader',
    'js/PanelManager/IActivePanel',
    'widgets/InteractionVisualizer/InteractionVisualizerWidget',
    './InteractionVisualizerControl'
], function (
    PanelBaseWithHeader,
    IActivePanel,
    InteractionVisualizerWidget,
    InteractionVisualizerControl
) {
    'use strict';

    function InteractionVisualizerPanel(layoutManager, params) {
        var options = {};

        options[PanelBaseWithHeader.OPTIONS.LOGGER_INSTANCE_NAME] = 'InteractionVisualizerPanel';
        options[PanelBaseWithHeader.OPTIONS.FLOATING_TITLE] = true;

        PanelBaseWithHeader.apply(this, [options, layoutManager]);

        this._client = params.client;
        this._initialize();

        this.logger.debug('InteractionVisualizerPanel ctor finished');
    }

    _.extend(InteractionVisualizerPanel.prototype, PanelBaseWithHeader.prototype);
    _.extend(InteractionVisualizerPanel.prototype, IActivePanel.prototype);

    InteractionVisualizerPanel.prototype._initialize = function () {
        var self = this;

        this.widget = new InteractionVisualizerWidget(this.logger, this.$el, {
            toolBar: this.toolBar,
            client: this._client
        });

        this.widget.setTitle = function (title) {
            self.setTitle(title);
        };

        this.widget.onUIActivity = function () {
            WebGMEGlobal.KeyboardManager.setListener(self.widget);
        };

        this.control = new InteractionVisualizerControl({
            logger: this.logger,
            client: this._client,
            widget: this.widget
        });

        this.onActivate();
    };

    InteractionVisualizerPanel.prototype.onReadOnlyChanged = function (isReadOnly) {
        PanelBaseWithHeader.prototype.onReadOnlyChanged.call(this, isReadOnly);
        this.widget.setReadOnly(isReadOnly);
    };

    InteractionVisualizerPanel.prototype.onResize = function (width, height) {
        this.widget.onWidgetContainerResize(width, height);
    };

    InteractionVisualizerPanel.prototype.destroy = function () {
        this.control.destroy();
        this.widget.destroy();

        PanelBaseWithHeader.prototype.destroy.call(this);
        WebGMEGlobal.KeyboardManager.setListener(undefined);
        WebGMEGlobal.Toolbar.refresh();
    };

    InteractionVisualizerPanel.prototype.onActivate = function () {
        this.widget.onActivate();
        this.control.onActivate();
        WebGMEGlobal.KeyboardManager.setListener(this.widget);
        WebGMEGlobal.Toolbar.refresh();
    };

    InteractionVisualizerPanel.prototype.onDeactivate = function () {
        this.widget.onDeactivate();
        this.control.onDeactivate();
        WebGMEGlobal.KeyboardManager.setListener(undefined);
        WebGMEGlobal.Toolbar.refresh();
    };

    InteractionVisualizerPanel.prototype.getNodeID = function () {
        return this.control.getNodeID();
    };

    InteractionVisualizerPanel.prototype.getValidTypesInfo = function () {
        var validTypes = [],
            self = this;

        function buildValidTypes(nodeId) {
            var node = self._client.getNode(nodeId),
                detailed;

            if (!node) {
                return;
            }

            detailed = node.getValidChildrenTypesDetailed();
            Object.keys(detailed).forEach(function (key) {
                var recurse = validTypes.indexOf(key) === -1;

                if (validTypes.indexOf(key) === -1) {
                    validTypes.push(key);
                }

                if (recurse) {
                    buildValidTypes(key);
                }
            });
        }

        buildValidTypes(this.control.getNodeID());

        return validTypes.reduce(function (acc, id) {
            acc[id] = true;
            return acc;
        }, {});
    };

    return InteractionVisualizerPanel;
});
