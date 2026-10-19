/*globals define, _*/

/**
 * Enriched variant of mbse4sdvNoteDecorator that allows rich text (bold, lists,
 * headings, links) and embedded images instead of plain text only.
 */
define([
    'js/Decorators/DecoratorBase',
    './DiagramDesigner/EnrichedNoteDecorator.DiagramDesignerWidget',
    './PartBrowser/EnrichedNoteDecorator.PartBrowserWidget'
], function (DecoratorBase, EnrichedNoteDecoratorDiagramDesignerWidget, EnrichedNoteDecoratorPartBrowserWidget) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvEnrichedNoteDecorator';

    function mbse4sdvEnrichedNoteDecorator(params) {
        var opts = _.extend({loggerName: this.DECORATORID}, params);

        DecoratorBase.apply(this, [opts]);

        this.logger.debug('mbse4sdvEnrichedNoteDecorator ctor');
    }

    _.extend(mbse4sdvEnrichedNoteDecorator.prototype, DecoratorBase.prototype);
    mbse4sdvEnrichedNoteDecorator.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DecoratorBase MEMBERS **************************/

    mbse4sdvEnrichedNoteDecorator.prototype.initializeSupportedWidgetMap = function () {
        this.supportedWidgetMap = {
            DiagramDesigner: EnrichedNoteDecoratorDiagramDesignerWidget,
            PartBrowser: EnrichedNoteDecoratorPartBrowserWidget
        };
    };

    return mbse4sdvEnrichedNoteDecorator;
});
