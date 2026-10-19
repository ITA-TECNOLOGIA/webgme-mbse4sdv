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
    'text!../DiagramDesigner/NoteRelationDecorator.DiagramDesignerWidget.html',
    'css!../DiagramDesigner/NoteRelationDecorator.DiagramDesignerWidget.css',
    'css!./NoteRelationDecorator.PartBrowserWidget.css'
], function (CONSTANTS,
             nodePropertyNames,
             PartBrowserWidgetDecoratorBase,
             DiagramDesignerWidgetConstants,
             ModelDecoratorCore,
             NoteRelationDecoratorDiagramDesignerWidgetTemplate) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvNoteRelationDecorator';

    function NoteRelationDecoratorPartBrowserWidget(options) {
        var opts = _.extend({}, options);

        PartBrowserWidgetDecoratorBase.apply(this, [opts]);

        this.logger.debug('NoteRelationDecoratorPartBrowserWidget ctor');
    }

    _.extend(NoteRelationDecoratorPartBrowserWidget.prototype, PartBrowserWidgetDecoratorBase.prototype);
    NoteRelationDecoratorPartBrowserWidget.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DiagramDesignerWidgetDecoratorBase MEMBERS **************************/

    NoteRelationDecoratorPartBrowserWidget.prototype.$DOMBase = (function () {
        var el = $(NoteRelationDecoratorDiagramDesignerWidgetTemplate);
        //use the same HTML template as the NoteRelationDecorator.DiagramDesignerWidget
        //but remove the connector DOM elements since they are not needed in the PartBrowser
        el.find('.' + DiagramDesignerWidgetConstants.CONNECTOR_CLASS).remove();
        return el;
    })();

    NoteRelationDecoratorPartBrowserWidget.prototype.beforeAppend = function () {
        this.$el = this.$DOMBase.clone();

        //find name placeholder
        this.skinParts.$name = this.$el.find('.name');

        this._renderContent();
    };

    NoteRelationDecoratorPartBrowserWidget.prototype.afterAppend = function () {
    };

    NoteRelationDecoratorPartBrowserWidget.prototype._renderContent = function () {
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

    NoteRelationDecoratorPartBrowserWidget.prototype.update = function () {
        this._renderContent();
    };

    NoteRelationDecoratorPartBrowserWidget.prototype._renderColors = function () {
        ModelDecoratorCore.prototype._getNodeColorsFromRegistry.apply(this);

        var style = {
            backgroundColor: this.backgroundColor ? this.backgroundColor : '',
            borderColor: this.borderColor ? this.borderColor : '',
            color: this.textColor ? this.textColor : '',
        };

        this.$el.css(style);
    };

    return NoteRelationDecoratorPartBrowserWidget;
});
