/*globals define, _, WebGMEGlobal*/
/*jshint browser: true */
/**
 * @author rkereskenyi / https://github.com/rkereskenyi
 */

define(['js/PanelBase/PanelBaseWithHeader',
    'js/PanelManager/IActivePanel',
    'widgets/mbse4sdvScenarioEditor/ScenarioEditorWidget',
    './ScenarioEditorControl',
    'js/Utils/ComponentSettings'
], function (PanelBaseWithHeader,
             IActivePanel,
             ScenarioEditorWidget,
             ScenarioEditorControl,
             ComponentSettings) {

    'use strict';

    var ScenarioEditorPanel;

    ScenarioEditorPanel = function (layoutManager, params) {
        var options = {};
        
        //set properties from component settings
        this._config = ScenarioEditorPanel.getDefaultConfig();
        ComponentSettings.resolveWithWebGMEGlobal(this._config, ScenarioEditorPanel.getComponentId());

        //set properties from options
        options[PanelBaseWithHeader.OPTIONS.LOGGER_INSTANCE_NAME] = 'ScenarioEditorPanel';
        options[PanelBaseWithHeader.OPTIONS.FLOATING_TITLE] = true;

        //call parent's constructor
        PanelBaseWithHeader.apply(this, [options, layoutManager]);

        this._client = params.client;


        //initialize UI
        this._initialize();

        this.logger.debug('ScenarioEditorPanel ctor finished');
    };

    //inherit from PanelBaseWithHeader
    _.extend(ScenarioEditorPanel.prototype, PanelBaseWithHeader.prototype);
    _.extend(ScenarioEditorPanel.prototype, IActivePanel.prototype);

    ScenarioEditorPanel.prototype._initialize = function () {
        var self = this;

        this.widget = new ScenarioEditorWidget(this.logger, this.$el, {toolBar: this.toolBar, client: this._client});

        this.widget.setTitle = function (title) {
            self.setTitle(title);
        };

        this.widget.onUIActivity = function () {
            //WebGMEGlobal.PanelManager.setActivePanel(self);
            WebGMEGlobal.KeyboardManager.setListener(self.widget);
        };

        this.control = new ScenarioEditorControl({
            client: this._client,
            widget: this.widget,
            attribute: 'actor'
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
    ScenarioEditorPanel.prototype.onReadOnlyChanged = function (isReadOnly) {
        //apply parent's onReadOnlyChanged
        PanelBaseWithHeader.prototype.onReadOnlyChanged.call(this, isReadOnly);

        this.widget.setReadOnly(isReadOnly);
    };

    ScenarioEditorPanel.prototype.onResize = function (width, height) {
        this.logger.debug('onResize --> width: ' + width + ', height: ' + height);
        this.widget.onWidgetContainerResize(width, height);
    };

    ScenarioEditorPanel.prototype.destroy = function () {
        this.control.destroy();
        this.widget.destroy();

        PanelBaseWithHeader.prototype.destroy.call(this);
        WebGMEGlobal.KeyboardManager.setListener(undefined);
        WebGMEGlobal.Toolbar.refresh();
    };

    /* override IActivePanel.prototype.onActivate */
    ScenarioEditorPanel.prototype.onActivate = function () {
        this.widget.onActivate();
        this.control.onActivate();
        WebGMEGlobal.KeyboardManager.setListener(this.widget);
        WebGMEGlobal.Toolbar.refresh();
    
    };

    /* override IActivePanel.prototype.onDeactivate */
    ScenarioEditorPanel.prototype.onDeactivate = function () {
        this.widget.onDeactivate();
        this.control.onDeactivate();
        WebGMEGlobal.KeyboardManager.setListener(undefined);
        WebGMEGlobal.Toolbar.refresh();
    };

    ScenarioEditorPanel.prototype.getNodeID = function () {
        return this.control.getNodeID();
    };

    ScenarioEditorPanel.getDefaultConfig = function () {
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

    ScenarioEditorPanel.getComponentId = function () {
        return 'GenericUIScenarioEditorPanel';
    };

    return ScenarioEditorPanel;
});
