/*globals define, _, DEBUG, $*/
/*eslint-env browser*/

define([
    'js/Constants',
    'js/NodePropertyNames',
    'js/Widgets/PartBrowser/PartBrowserWidget.DecoratorBase',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.Constants',
    'decorators/ModelDecorator/Core/ModelDecorator.Core',
    'text!../DiagramDesigner/EnrichedNoteDecorator.DiagramDesignerWidget.html',
    'css!../DiagramDesigner/EnrichedNoteDecorator.DiagramDesignerWidget.css',
    'css!./EnrichedNoteDecorator.PartBrowserWidget.css'
], function (CONSTANTS,
             nodePropertyNames,
             PartBrowserWidgetDecoratorBase,
             DiagramDesignerWidgetConstants,
             ModelDecoratorCore,
             EnrichedNoteDecoratorDiagramDesignerWidgetTemplate) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvEnrichedNoteDecorator';

    function EnrichedNoteDecoratorPartBrowserWidget(options) {
        var opts = _.extend({}, options);

        PartBrowserWidgetDecoratorBase.apply(this, [opts]);

        this.logger.debug('mbse4sdvEnrichedNoteDecorator ctor');
    }

    _.extend(EnrichedNoteDecoratorPartBrowserWidget.prototype, PartBrowserWidgetDecoratorBase.prototype);
    EnrichedNoteDecoratorPartBrowserWidget.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DiagramDesignerWidgetDecoratorBase MEMBERS **************************/

    EnrichedNoteDecoratorPartBrowserWidget.prototype.$DOMBase = (function () {
        var el = $(EnrichedNoteDecoratorDiagramDesignerWidgetTemplate);
        //use the same HTML template as the EnrichedNoteDecorator.DiagramDesignerWidget
        //but remove the connector DOM elements since they are not needed in the PartBrowser
        el.find('.' + DiagramDesignerWidgetConstants.CONNECTOR_CLASS).remove();
        return el;
    })();

    EnrichedNoteDecoratorPartBrowserWidget.prototype.beforeAppend = function () {
        this.$el = this.$DOMBase.clone();

        //find name placeholder
        this.skinParts.$name = this.$el.find('.name');

        this._renderContent();
    };

    EnrichedNoteDecoratorPartBrowserWidget.prototype.afterAppend = function () {
    };

    EnrichedNoteDecoratorPartBrowserWidget.prototype._renderContent = function () {
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

    EnrichedNoteDecoratorPartBrowserWidget.prototype.update = function () {
        this._renderContent();
    };

    EnrichedNoteDecoratorPartBrowserWidget.prototype._renderColors = function () {
        ModelDecoratorCore.prototype._getNodeColorsFromRegistry.apply(this);

        var style = {
            backgroundColor: this.borderColor ? this.borderColor : '',
            borderColor: this.borderColor ? this.borderColor : '',
            color: this.textColor ? this.textColor : '',
        };

        this.$el.css(style);
    };

    return EnrichedNoteDecoratorPartBrowserWidget;
});
