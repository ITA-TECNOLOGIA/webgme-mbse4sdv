/*globals define, _*/

define([
    'js/Decorators/DecoratorBase',
    './DiagramDesigner/InteractionLifelineDecorator.DiagramDesignerWidget',
    'decorators/ModelDecorator/PartBrowser/ModelDecorator.PartBrowserWidget'
], function (
    DecoratorBase,
    InteractionLifelineDecoratorDiagramDesignerWidget,
    ModelDecoratorPartBrowserWidget
) {
    'use strict';

    var DECORATOR_ID = 'InteractionLifelineDecorator';

    function InteractionLifelineDecorator(params) {
        var opts = _.extend({loggerName: DECORATOR_ID}, params);

        DecoratorBase.apply(this, [opts]);
    }

    _.extend(InteractionLifelineDecorator.prototype, DecoratorBase.prototype);
    InteractionLifelineDecorator.prototype.DECORATORID = DECORATOR_ID;

    InteractionLifelineDecorator.prototype.initializeSupportedWidgetMap = function () {
        this.supportedWidgetMap = {
            DiagramDesigner: InteractionLifelineDecoratorDiagramDesignerWidget,
            PartBrowser: ModelDecoratorPartBrowserWidget
        };
    };

    return InteractionLifelineDecorator;
});
