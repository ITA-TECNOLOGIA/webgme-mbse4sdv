/*globals define, _*/
/*jshint browser: true, camelcase: false*/

define([
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget'
], function (DiagramDesignerWidget) {
    'use strict';

    var InteractionVisualizerWidget;

    InteractionVisualizerWidget = function (logger, container, params) {
        params = params || {};
        params.loggerName = 'gme:Widgets:InteractionVisualizer:InteractionVisualizerWidget';
        params.tabsEnabled = false;
        params.addTabs = false;
        params.deleteTabs = false;
        params.reorderTabs = false;
        params.defaultConnectionRouteManagerType = 'basic';
        params.disableAutoRouterOption = true;

        DiagramDesignerWidget.call(this, container, params);
        this.logger.debug('InteractionVisualizerWidget ctor');
    };

    _.extend(InteractionVisualizerWidget.prototype, DiagramDesignerWidget.prototype);

    InteractionVisualizerWidget.prototype._afterManagersInitialized = function () {
        if (this._onConnectionRouteManagerChanged) {
            this._onConnectionRouteManagerChanged('basic');
        }
        this._connectionJumpXing = false;
        this.enableOpenButton(false);
    };

    InteractionVisualizerWidget.prototype.onWidgetContainerResize = function (width, height) {
        this._containerSize.w = width;
        this._containerSize.h = height;

        this._resizeItemContainer();

        if (this.$ulTabTab && this.$ulTabTab.width() !== 0) {
            this._refreshTabTabsScrollOnResize();
        }
    };

    return InteractionVisualizerWidget;
});
