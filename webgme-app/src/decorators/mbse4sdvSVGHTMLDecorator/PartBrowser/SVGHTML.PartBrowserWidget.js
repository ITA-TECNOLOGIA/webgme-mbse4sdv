/*globals define, _, $*/
/*jshint browser: true*/

/**
 * @author brollb / https://github/brollb
 */

define([
    'js/Constants',
    'js/NodePropertyNames',
    'js/Widgets/PartBrowser/PartBrowserWidget.DecoratorBase',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.Constants',
    'text!./../../SVGDecorator/Core/SVGDecorator.html',
    './../../SVGDecorator/PartBrowser/SVGDecorator.Core',
    'css!./../../SVGDecorator/PartBrowser/SVGDecorator.PartBrowserWidget'
], function (CONSTANTS,
             nodePropertyNames,
             PartBrowserWidgetDecoratorBase,
             DiagramDesignerWidgetConstants,
             SVGDecoratorTemplate,
             SVGDecoratorCore) {

    'use strict';

    var SVGHTMLPartBrowserWidget,
        DECORATOR_ID = 'mbse4sdvSVGHTMLDecorator';


    SVGHTMLPartBrowserWidget = function (options) {
        var opts = _.extend({}, options);

        PartBrowserWidgetDecoratorBase.apply(this, [opts]);
        SVGDecoratorCore.apply(this, [opts]);

        this._initializeVariables({connectors: false});

        this.logger.debug('mbse4sdvSVGHTMLDecorator PW ctor');
    };


    /************************ INHERITANCE *********************/
    _.extend(SVGHTMLPartBrowserWidget.prototype, PartBrowserWidgetDecoratorBase.prototype);
    _.extend(SVGHTMLPartBrowserWidget.prototype, SVGDecoratorCore.prototype);


    /**************** OVERRIDE INHERITED / EXTEND ****************/

    /**** Override from PartBrowserWidgetDecoratorBase ****/
    SVGHTMLPartBrowserWidget.prototype.DECORATORID = DECORATOR_ID;

    /**** Override from SVGDecoratorCore: render the (formatted) name as HTML instead of plain text ****/
    SVGHTMLPartBrowserWidget.prototype._updateName = function () {
        SVGDecoratorCore.prototype._updateName.apply(this, arguments);
        this.$name.html(this.formattedName);
        this.$name.css({height: '16px'});
    };


    /**** Override from PartBrowserWidgetDecoratorBase ****/
    SVGHTMLPartBrowserWidget.prototype.$DOMBase = (function () {
        var el = $(SVGDecoratorTemplate);
        //use the same HTML template as the DefaultDecorator.DiagramDesignerWidget
        //but remove the connector DOM elements since they are not needed in the PartBrowser
        el.find('.' + DiagramDesignerWidgetConstants.CONNECTOR_CLASS).remove();
        return el;
    })();


    /**** Override from PartBrowserWidgetDecoratorBase ****/
    SVGHTMLPartBrowserWidget.prototype.beforeAppend = function () {
        this.$el = this.$DOMBase.clone();

        this._renderContent();
    };


    /**** Override from PartBrowserWidgetDecoratorBase ****/
    SVGHTMLPartBrowserWidget.prototype.afterAppend = function () {
    };


    /**** Override from PartBrowserWidgetDecoratorBase ****/
    SVGHTMLPartBrowserWidget.prototype.update = function () {
        this._update();
    };

    SVGHTMLPartBrowserWidget.prototype.afterAppend = function () {
        this.svgContainerWidth = this.$svgContent.outerWidth(true);
        this.svgWidth = this.$svgContent.find('svg').outerWidth(true);
        this.svgHeight = this.$svgContent.find('svg').outerHeight(true);

        var xShift = (this.svgContainerWidth - this.svgWidth) / 2;

        // this._fixPortContainerPosition(xShift);
    };

    /**** Override from PartBrowserWidgetDecoratorBase ****/
    SVGHTMLPartBrowserWidget.prototype.notifyComponentEvent = function (componentList) {
        var len = componentList.length;
        while (len--) {
            this._updatePort(componentList[len]);
        }
    };


    return SVGHTMLPartBrowserWidget;
});
