/*globals define, _*/

define([
    'js/Decorators/DecoratorBase',
    './DiagramDesigner/InteractionCombinedFragmentDecorator.DiagramDesignerWidget',
    'decorators/ModelDecorator/PartBrowser/ModelDecorator.PartBrowserWidget'
], function (
    DecoratorBase,
    InteractionCombinedFragmentDecoratorDiagramDesignerWidget,
    ModelDecoratorPartBrowserWidget
) {
    'use strict';

    var DECORATOR_ID = 'InteractionCombinedFragmentDecorator';

    function InteractionCombinedFragmentDecorator(params) {
        var opts = _.extend({loggerName: DECORATOR_ID}, params);

        DecoratorBase.apply(this, [opts]);
    }

    _.extend(InteractionCombinedFragmentDecorator.prototype, DecoratorBase.prototype);
    InteractionCombinedFragmentDecorator.prototype.DECORATORID = DECORATOR_ID;

    InteractionCombinedFragmentDecorator.prototype.initializeSupportedWidgetMap = function () {
        this.supportedWidgetMap = {
            DiagramDesigner: InteractionCombinedFragmentDecoratorDiagramDesignerWidget,
            PartBrowser: ModelDecoratorPartBrowserWidget
        };
    };

    return InteractionCombinedFragmentDecorator;
});
