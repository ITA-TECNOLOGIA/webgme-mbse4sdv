/*globals define, _*/
/*jshint browser: true*/

/**
 * @author rkereskenyi / https://github.com/rkereskenyi
 */

define([
    'js/Decorators/DecoratorBase',
    './DiagramDesigner/SVGHTML.DiagramDesignerWidget',
    './PartBrowser/SVGHTML.PartBrowserWidget'
], function (DecoratorBase,
             SVGHTMLDiagramDesignerWidget,
             SVGHTMLPartBrowserWidget) {

    'use strict';

    var mbse4sdvSVGHTML,
        DECORATOR_ID = 'mbse4sdvSVGHTMLDecorator';

    mbse4sdvSVGHTML = function (params) {
        var opts = _.extend({loggerName: this.DECORATORID}, params);

        DecoratorBase.apply(this, [opts]);

        this.logger.debug('mbse4sdvSVGHTML ctor');
    };

    _.extend(mbse4sdvSVGHTML.prototype, DecoratorBase.prototype);
    mbse4sdvSVGHTML.prototype.DECORATORID = DECORATOR_ID;

    /*********************** OVERRIDE DecoratorBase MEMBERS **************************/

    mbse4sdvSVGHTML.prototype.initializeSupportedWidgetMap = function () {

        this.supportedWidgetMap = {
            DiagramDesigner: SVGHTMLDiagramDesignerWidget,
            PartBrowser: SVGHTMLPartBrowserWidget
        };

    };

    return mbse4sdvSVGHTML
});
