/*globals define, _, DEBUG, $*/
/*eslint-env browser*/

/**
 * @author pmeijer / https://github.com/pmeijer
 */


define([
    'js/Constants',
    'js/NodePropertyNames',
    'js/Widgets/PartBrowser/PartBrowserWidget.DecoratorBase',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.Constants',
    'decorators/ModelDecorator/Core/ModelDecorator.Core',
    'text!../DiagramDesigner/SysML.DiagramDesignerWidget.html',
    'css!../DiagramDesigner/SysML.DiagramDesignerWidget.css',
    'css!./SysML.PartBrowserWidget.css'
], function (CONSTANTS,
             nodePropertyNames,
             PartBrowserWidgetDecoratorBase,
             DiagramDesignerWidgetConstants,
             ModelDecoratorCore,
             SysMLDiagramDesignerWidgetTemplate) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvSysMLDecorator';

    function SysMLPartBrowserWidget(options) {
        var opts = _.extend({}, options);

        PartBrowserWidgetDecoratorBase.apply(this, [opts]);

        this.logger.debug('mbse4sdvSysMLDecorator PW ctor');
    }

    _.extend(SysMLPartBrowserWidget.prototype, PartBrowserWidgetDecoratorBase.prototype);
    SysMLPartBrowserWidget.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DiagramDesignerWidgetDecoratorBase MEMBERS **************************/

    SysMLPartBrowserWidget.prototype.$DOMBase = (function () {
        var el = $(SysMLDiagramDesignerWidgetTemplate);
        //use the same HTML template as the MultilineAttributeDecorator.DiagramDesignerWidget
        //but remove the connector DOM elements since they are not needed in the PartBrowser
        el.find('.' + DiagramDesignerWidgetConstants.CONNECTOR_CLASS).remove();
        return el;
    })();

    SysMLPartBrowserWidget.prototype.beforeAppend = function () {
        this.$el = this.$DOMBase.clone();

        //find name placeholder
        this.skinParts.$name = this.$el.find('#name');

        this._renderContent();
    };

    SysMLPartBrowserWidget.prototype.afterAppend = function () {
    };

    SysMLPartBrowserWidget.prototype._renderContent = function () {
        var client = this._control._client,
            nodeObj = client.getNode(this._metaInfo[CONSTANTS.GME_ID]);

        //render GME-ID in the DOM, for debugging
        if (DEBUG) {
            this.$el.attr({'data-id': this._metaInfo[CONSTANTS.GME_ID]});
        }

        if (nodeObj) {
            this.skinParts.$name.text(nodeObj.getAttribute(nodePropertyNames.Attributes.name) || '');
        }

        this._renderColors();
    };

    SysMLPartBrowserWidget.prototype.update = function () {
        this._renderContent();
    };

    SysMLPartBrowserWidget.prototype._renderColors = function () {
        ModelDecoratorCore.prototype._getNodeColorsFromRegistry.apply(this);

        var style = {
            backgroundColor: this.borderColor ? this.borderColor : '',
            borderColor: this.borderColor ? this.borderColor : '',
            color: this.textColor ? this.textColor : '',
        };

        this.$el.css(style);
    };

    return SysMLPartBrowserWidget;
});
