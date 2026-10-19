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
    'text!../DiagramDesigner/NoteDecorator.DiagramDesignerWidget.html',
    'css!../DiagramDesigner/NoteDecorator.DiagramDesignerWidget.css',
    'css!./NoteDecorator.PartBrowserWidget.css'
], function (CONSTANTS,
             nodePropertyNames,
             PartBrowserWidgetDecoratorBase,
             DiagramDesignerWidgetConstants,
             ModelDecoratorCore,
             NoteDecoratorDiagramDesignerWidgetTemplate) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvNoteDecorator';

    function NoteDecoratorPartBrowserWidget(options) {
        var opts = _.extend({}, options);

        PartBrowserWidgetDecoratorBase.apply(this, [opts]);

        this.logger.debug('mbse4sdvNoteDecorator ctor');
    }

    _.extend(NoteDecoratorPartBrowserWidget.prototype, PartBrowserWidgetDecoratorBase.prototype);
    NoteDecoratorPartBrowserWidget.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DiagramDesignerWidgetDecoratorBase MEMBERS **************************/

    NoteDecoratorPartBrowserWidget.prototype.$DOMBase = (function () {
        var el = $(NoteDecoratorDiagramDesignerWidgetTemplate);
        //use the same HTML template as the NoteDecorator.DiagramDesignerWidget
        //but remove the connector DOM elements since they are not needed in the PartBrowser
        el.find('.' + DiagramDesignerWidgetConstants.CONNECTOR_CLASS).remove();
        return el;
    })();

    NoteDecoratorPartBrowserWidget.prototype.beforeAppend = function () {
        this.$el = this.$DOMBase.clone();

        //find name placeholder
        this.skinParts.$name = this.$el.find('.name');

        this._renderContent();
    };

    NoteDecoratorPartBrowserWidget.prototype.afterAppend = function () {
    };

    NoteDecoratorPartBrowserWidget.prototype._renderContent = function () {
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

    NoteDecoratorPartBrowserWidget.prototype.update = function () {
        this._renderContent();
    };

    NoteDecoratorPartBrowserWidget.prototype._renderColors = function () {
        ModelDecoratorCore.prototype._getNodeColorsFromRegistry.apply(this);

        var style = {
            backgroundColor: this.borderColor ? this.borderColor : '',
            borderColor: this.borderColor ? this.borderColor : '',
            color: this.textColor ? this.textColor : '',
        };

        this.$el.css(style);
    };

    return NoteDecoratorPartBrowserWidget;
});
