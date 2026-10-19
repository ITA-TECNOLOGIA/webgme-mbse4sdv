/*globals define, $, _*/
/*jshint browser: true, camelcase: false*/

/**
 * js/Widgets/DiagramDesigner
 * @author rkereskenyi / https://github.com/rkereskenyi
 */

define([
    'js/DragDrop/DragHelper',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget'

], function (DragHelper, DiagramDesignerWidget) {

    'use strict';

    var ScenarioEditorWidget;
    var WIDGET_CLASS = 'scenarios-visualizer';


    ScenarioEditorWidget = function (logger, container, params) {
    
        params = params || {};
        params.loggerName = 'gme:Widgets:ScenarioEditor:ScenarioEditorWidget';

        params.tabsEnabled = true;
        params.addTabs = false;
        params.deleteTabs = false;
        params.reorderTabs = false;

        DiagramDesignerWidget.call(this, container, params);

        this.logger.debug('ScenarioEditorWidget ctor');
    };

    _.extend(ScenarioEditorWidget.prototype, DiagramDesignerWidget.prototype);

    /**
     * Draws the swim-lane regions (columns) on top of the canvas.
     * @param {Array<{id: string, name: string}>} regions
     */
    ScenarioEditorWidget.prototype.addRegions = function (regions) {
        var row,
            width,
            height,
            columnWidth;

        this.regions = regions;
        if (!regions) {
            return;
        }

        row = document.getElementById('rowIdentifier');
        if (row) {
            row.remove();
        }

        width = this._containerSize.w * this._zoomRatio;
        height = this._containerSize.h * this._zoomRatio;
        columnWidth = width / regions.length;

        row = document.createElement('div');
        row.setAttribute('id', 'rowIdentifier');
        row.setAttribute('style', 'height: ' + height + 'px; width:' + width + 'px;');
        this.$el.append(row);

        regions.forEach(function (region) {
            var column = document.createElement('div');
            column.setAttribute('id', region.id);
            column.setAttribute('class', 'column');
            column.setAttribute('style', 'width: ' + columnWidth + 'px; float: left;height: ' + height +
                'px; border-style: solid; border-width: 4px; text-align: center; font-size: 17px;');
            column.textContent = region.name;
            row.append(column);
        });
    };

    // Regions must follow the canvas size, so they are redrawn whenever the item container is resized.
    ScenarioEditorWidget.prototype._resizeItemContainer = function () {
        DiagramDesignerWidget.prototype._resizeItemContainer.apply(this, arguments);
        this.addRegions(this.regions);
    };

   
    ScenarioEditorWidget.prototype._afterManagersInitialized = function () {
        //turn on open btn
        this.enableOpenButton(true);
    };

    ScenarioEditorWidget.prototype.getDragEffects = function (selectedElements, event) {
        var ctrlKey = event.ctrlKey || event.metaKey,
            altKey = event.altKey,
            shiftKey = event.shiftKey,
            effects = DiagramDesignerWidget.prototype.getDragEffects.apply(this, [selectedElements, event]);

        //ALT_KEY --> DRAG_CREATE_INSTANCE
        if (!ctrlKey && altKey && !shiftKey) {
            effects = [DragHelper.DRAG_EFFECTS.DRAG_CREATE_INSTANCE];
        } else if (!ctrlKey && !altKey && shiftKey) {
            effects = [DragHelper.DRAG_EFFECTS.DRAG_CREATE_POINTER];
        }

        return effects;
    };

    /* OVERWRITE DiagramDesignerWidget.prototype._dragHelper */
    ScenarioEditorWidget.prototype._dragHelper = function (el, event, dragInfo) {
        var helperEl = DiagramDesignerWidget.prototype._dragHelper.apply(this, [el, event, dragInfo]),
            dragEffects = DragHelper.getDragEffects(dragInfo);

        if (dragEffects.length === 1) {
            if (dragEffects[0] === DragHelper.DRAG_EFFECTS.DRAG_CREATE_INSTANCE) {
                helperEl.html($('<i class="glyphicon glyphicon-share-alt"></i>')).append(' Create instance...');
            } else if (dragEffects[0] === DragHelper.DRAG_EFFECTS.DRAG_CREATE_POINTER) {
                helperEl.html($('<i class="glyphicon glyphicon-share"></i>')).append(' Create pointer...');
            }
        }

        return helperEl;
    };

    return ScenarioEditorWidget;
});