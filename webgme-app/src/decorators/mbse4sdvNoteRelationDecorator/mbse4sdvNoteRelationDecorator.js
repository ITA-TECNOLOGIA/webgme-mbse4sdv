/*globals define, _*/

/**
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'js/Decorators/DecoratorBase',
    './DiagramDesigner/NoteRelationDecorator.DiagramDesignerWidget',
    './PartBrowser/NoteRelationDecorator.PartBrowserWidget'
], function (DecoratorBase, NoteRelationDecoratorDiagramDesignerWidget, NoteRelationDecoratorDecoratorPartBrowserWidget) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvNoteRelationDecorator';

     function mbse4sdvNoteRelationDecorator(params) {
        var opts = _.extend({loggerName: this.DECORATORID}, params);

        DecoratorBase.apply(this, [opts]);

        this.logger.debug('mbse4sdvNoteRelationDecorator ctor');
    }

    _.extend(mbse4sdvNoteRelationDecorator.prototype, DecoratorBase.prototype);
    mbse4sdvNoteRelationDecorator.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DecoratorBase MEMBERS **************************/

    mbse4sdvNoteRelationDecorator.prototype.initializeSupportedWidgetMap = function () {
        this.supportedWidgetMap = {
            DiagramDesigner: NoteRelationDecoratorDiagramDesignerWidget,
            PartBrowser: NoteRelationDecoratorDecoratorPartBrowserWidget
        };
    };

    return mbse4sdvNoteRelationDecorator;
});
