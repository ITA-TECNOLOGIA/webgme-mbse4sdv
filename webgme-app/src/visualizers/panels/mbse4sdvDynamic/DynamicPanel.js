/*globals define, _, WebGMEGlobal*/
/*jshint browser: true */
/**
 * @author rkereskenyi / https://github.com/rkereskenyi
 */

define(['js/PanelBase/PanelBaseWithHeader',
    'js/PanelManager/IActivePanel',
    'widgets/mbse4sdvDynamic/DynamicWidget',
    './DynamicControl',
    'js/Utils/ComponentSettings'
], function (PanelBaseWithHeader,
             IActivePanel,
             DynamicWidget,
             DynamicControl,
             ComponentSettings) {

    'use strict';

    var DynamicPanel;

    DynamicPanel = function (layoutManager, params) {
        var options = {};
        
        //set properties from component settings
        this._config = DynamicPanel.getDefaultConfig();
        ComponentSettings.resolveWithWebGMEGlobal(this._config, DynamicPanel.getComponentId());

        //set properties from options
        options[PanelBaseWithHeader.OPTIONS.LOGGER_INSTANCE_NAME] = 'DynamicPanel';
        options[PanelBaseWithHeader.OPTIONS.FLOATING_TITLE] = true;

        //call parent's constructor
        PanelBaseWithHeader.apply(this, [options, layoutManager]);

        this._client = params.client;


        //initialize UI
        this._initialize();

        this.logger.debug('DynamicPanel ctor finished');
    };

    //inherit from PanelBaseWithHeader
    _.extend(DynamicPanel.prototype, PanelBaseWithHeader.prototype);
    _.extend(DynamicPanel.prototype, IActivePanel.prototype);

    DynamicPanel.prototype._initialize = function () {
        var self = this;

        this.widget = new DynamicWidget(this.logger, this.$el, {toolBar: this.toolBar, client: this._client});

        this.widget.setTitle = function (title) {
            self.setTitle(title);
        };

        this.widget.onUIActivity = function () {
            //WebGMEGlobal.PanelManager.setActivePanel(self);
            WebGMEGlobal.KeyboardManager.setListener(self.widget);
        };

        this.control = new DynamicControl({
            client: this._client,
            widget: this.widget
        });

        this.control.setReadOnly = function (isReadOnly) {
            self.setReadOnly(isReadOnly);
        };
        this.onActivate();
        //let regions = this.control.generateRegions(WebGMEGlobal.State.getActiveObject());
        //alert(regions.length)
        //this.widget.addRegions(regions);
    };
    
    /* OVERRIDE FROM WIDGET-WITH-HEADER */
    /* METHOD CALLED WHEN THE WIDGET'S READ-ONLY PROPERTY CHANGES */
    DynamicPanel.prototype.onReadOnlyChanged = function (isReadOnly) {
        //apply parent's onReadOnlyChanged
        PanelBaseWithHeader.prototype.onReadOnlyChanged.call(this, isReadOnly);

        this.widget.setReadOnly(isReadOnly);
    };

    DynamicPanel.prototype.onResize = function (width, height) {
        this.logger.debug('onResize --> width: ' + width + ', height: ' + height);
        this.widget.onWidgetContainerResize(width, height);
    };

    DynamicPanel.prototype.destroy = function () {
        this.control.destroy();
        this.widget.destroy();

        PanelBaseWithHeader.prototype.destroy.call(this);
        WebGMEGlobal.KeyboardManager.setListener(undefined);
        WebGMEGlobal.Toolbar.refresh();
    };

    /* override IActivePanel.prototype.onActivate */
    DynamicPanel.prototype.onActivate = function () {
        this.widget.onActivate();
        this.control.onActivate();
        WebGMEGlobal.KeyboardManager.setListener(this.widget);
        WebGMEGlobal.Toolbar.refresh();
    
    };

    /* override IActivePanel.prototype.onDeactivate */
    DynamicPanel.prototype.onDeactivate = function () {
        this.widget.onDeactivate();
        this.control.onDeactivate();
        WebGMEGlobal.KeyboardManager.setListener(undefined);
        WebGMEGlobal.Toolbar.refresh();
    };

    DynamicPanel.prototype.getNodeID = function () {
        return this.control.getNodeID();
    };

    DynamicPanel.getDefaultConfig = function () {
        return {
            navigationTitle: {
                enabled: false,
                attribute: 'name',
                depth: 2
            },
            byProjectKind: {
                navigationTitle: {}
            },
            byProjectId: {
                navigationTitle: {}
            }
        };
    };

    DynamicPanel.getComponentId = function () {
        return 'DynamicPanel';
    };

    return DynamicPanel;
});
