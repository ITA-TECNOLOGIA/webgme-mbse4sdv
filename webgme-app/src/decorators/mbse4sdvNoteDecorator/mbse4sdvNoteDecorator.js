/*globals define, _*/

/**
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'js/Decorators/DecoratorBase',
    './DiagramDesigner/NoteDecorator.DiagramDesignerWidget',
    './PartBrowser/NoteDecorator.PartBrowserWidget'
], function (DecoratorBase, NoteDecoratorDiagramDesignerWidget, NoteDecoratorPartBrowserWidget) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvNoteDecorator';

     function mbse4sdvNoteDecorator(params) {
        var opts = _.extend({loggerName: this.DECORATORID}, params);

        DecoratorBase.apply(this, [opts]);

        this.logger.debug('mbse4sdvNoteDecorator ctor');
    }

    _.extend(mbse4sdvNoteDecorator.prototype, DecoratorBase.prototype);
    mbse4sdvNoteDecorator.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DecoratorBase MEMBERS **************************/

    mbse4sdvNoteDecorator.prototype.initializeSupportedWidgetMap = function () {
        this.supportedWidgetMap = {
            DiagramDesigner: NoteDecoratorDiagramDesignerWidget,
            PartBrowser: NoteDecoratorPartBrowserWidget
        };
    };

    return mbse4sdvNoteDecorator;
});
