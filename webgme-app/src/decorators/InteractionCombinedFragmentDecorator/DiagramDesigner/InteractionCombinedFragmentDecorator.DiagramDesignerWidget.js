/*globals define, _, $*/

define([
    'js/Constants',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.DecoratorBase',
    'text!./InteractionCombinedFragmentDecorator.DiagramDesignerWidget.html',
    'css!../../mbse4sdvNoteDecorator/DiagramDesigner/NoteDecorator.DiagramDesignerWidget.css',
    'css!./InteractionCombinedFragmentDecorator.DiagramDesignerWidget.css'
], function (
    CONSTANTS,
    DiagramDesignerWidgetDecoratorBase,
    template
) {
    'use strict';

    var DECORATOR_ID = 'InteractionCombinedFragmentDecoratorDiagramDesignerWidget',
        HEIGHT_REG_KEY = 'decoratorHeight',
        WIDTH_REG_KEY = 'decoratorWidth',
        MIN_WIDTH = 240,
        MIN_HEIGHT = 140;

    function InteractionCombinedFragmentDecorator(options) {
        DiagramDesignerWidgetDecoratorBase.apply(this, [_.extend({}, options)]);
    }

    _.extend(InteractionCombinedFragmentDecorator.prototype, DiagramDesignerWidgetDecoratorBase.prototype);
    InteractionCombinedFragmentDecorator.prototype.DECORATORID = DECORATOR_ID;
    InteractionCombinedFragmentDecorator.prototype.$DOMBase = $(template);

    InteractionCombinedFragmentDecorator.prototype.on_addTo = function () {
        this.nodeId = this._metaInfo[CONSTANTS.GME_ID];
        this.client = this._control._client;
        this.$operator = this.$el.find('.interaction-combined-fragment-decorator__operator');
        this.$guard = this.$el.find('.interaction-combined-fragment-decorator__guard');
        this.$resizeIcon = this.$el.find('.resize-icon');
        this.mouseStartPos = null;
        this.elStartSize = null;
        this._wireResize();
        this._render();
    };

    InteractionCombinedFragmentDecorator.prototype.update = function () {
        this._render();
    };

    InteractionCombinedFragmentDecorator.prototype._wireResize = function () {
        var self = this;

        if (this._resizeWired) {
            return;
        }

        this._resizeWired = true;
        function calculateNewSize(event) {
            var dX = event.pageX - self.mouseStartPos.x,
                dY = event.pageY - self.mouseStartPos.y,
                width = self.elStartSize.width,
                height = self.elStartSize.height,
                newWidth,
                newHeight;

            dX = dX / self.hostDesignerItem.canvas._zoomRatio;
            dY = dY / self.hostDesignerItem.canvas._zoomRatio;
            newWidth = width + dX;
            newHeight = height + dY;

            newWidth = newWidth > MIN_WIDTH ? newWidth : MIN_WIDTH;
            newHeight = newHeight > MIN_HEIGHT ? newHeight : MIN_HEIGHT;

            return {
                width: Math.round(newWidth),
                height: Math.round(newHeight)
            };
        }

        function mouseMoveHandler(event) {
            var newSize = calculateNewSize(event);

            self.$el.width(newSize.width);
            self.$el.height(newSize.height);
            event.stopPropagation();
            event.preventDefault();
        }

        function mouseUpHandler(event) {
            var newSize = calculateNewSize(event);

            self.mouseStartPos = null;
            $(document).off('mousemove', mouseMoveHandler);
            $(document).off('mouseup', mouseUpHandler);

            self.client.startTransaction();
            self.client.setRegistry(self.nodeId, WIDTH_REG_KEY, newSize.width);
            self.client.setRegistry(self.nodeId, HEIGHT_REG_KEY, newSize.height);
            self.client.completeTransaction();
        }

        this.$resizeIcon.on('mousedown', function (event) {
            self.mouseStartPos = {
                x: event.pageX,
                y: event.pageY
            };
            self.elStartSize = {
                width: self.$el.width(),
                height: self.$el.height()
            };
            $(document).on('mousemove', mouseMoveHandler);
            $(document).on('mouseup', mouseUpHandler);
            event.stopPropagation();
            event.preventDefault();
        });
    };

    InteractionCombinedFragmentDecorator.prototype._render = function () {
        var nodeObj = this.client.getNode(this.nodeId),
            width,
            height;

        if (!nodeObj) {
            return;
        }

        width = nodeObj.getRegistry(WIDTH_REG_KEY) || MIN_WIDTH;
        height = nodeObj.getRegistry(HEIGHT_REG_KEY) || MIN_HEIGHT;

        this.$el.width(width);
        this.$el.height(height);
        this.$operator.text(nodeObj.getAttribute('operator') || 'opt');
        this.$guard.text(nodeObj.getAttribute('guard') || '');
    };

    InteractionCombinedFragmentDecorator.prototype.getConnectionAreas = function () {
        return [];
    };

    return InteractionCombinedFragmentDecorator;
});
