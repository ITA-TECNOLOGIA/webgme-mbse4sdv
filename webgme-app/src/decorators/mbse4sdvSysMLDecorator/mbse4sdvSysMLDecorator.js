/*globals define, _*/

define([
    'js/Decorators/DecoratorBase',
    './DiagramDesigner/SysML.DiagramDesignerWidget',
    './PartBrowser/SysML.PartBrowserWidget'
], function (DecoratorBase, SysMLDiagramDesignerWidget, SysMLPartBrowserWidget) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvSysMLDecorator';

     function mbse4sdvSysMLDecorator(params) {
        var opts = _.extend({loggerName: this.DECORATORID}, params);

        DecoratorBase.apply(this, [opts]);

        this.logger.debug('mbse4sdvSysMLDecorator ctor');
    }

    _.extend(mbse4sdvSysMLDecorator.prototype, DecoratorBase.prototype);
    mbse4sdvSysMLDecorator.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DecoratorBase MEMBERS **************************/

    mbse4sdvSysMLDecorator.prototype.initializeSupportedWidgetMap = function () {
        this.supportedWidgetMap = {
            DiagramDesigner: SysMLDiagramDesignerWidget,
            PartBrowser: SysMLPartBrowserWidget
        };
    };

    return mbse4sdvSysMLDecorator;
});
