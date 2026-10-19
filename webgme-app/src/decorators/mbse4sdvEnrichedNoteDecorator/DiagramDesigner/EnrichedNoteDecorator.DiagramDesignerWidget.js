/*globals define, _, $*/

/**
 * Enriched variant of NoteDecorator.DiagramDesignerWidget: renders the
 * "description" attribute as sanitized rich HTML (headings, lists, links,
 * images) instead of plain text, and opens EnrichedNoteDialog - a WYSIWYG
 * editor that embeds images as data: URIs in the attribute (i.e. stored in
 * MongoDB, not in webgme's Blob storage) - on double click.
 */
define([
    'js/Constants',
    'js/Utils/ComponentSettings',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.DecoratorBase',
    'decorators/ModelDecorator/Core/ModelDecorator.Core',
    '../Core/EnrichedNoteDecorator.Core',
    './EnrichedNoteDialog',
    'text!./EnrichedNoteDecorator.DiagramDesignerWidget.html',
    'css!./EnrichedNoteDecorator.DiagramDesignerWidget.css'
], function (CONSTANTS,
             ComponentSettings,
             DiagramDesignerWidgetDecoratorBase,
             ModelDecoratorCore,
             EnrichedNoteDecoratorCore,
             EnrichedNoteDialog,
             EnrichedNoteDecoratorTemplate) {

    'use strict';

    var DECORATOR_ID = 'mbse4sdvEnrichedNoteDecorator',
        HEIGHT_REG_KEY = 'decoratorHeight',
        WIDTH_REG_KEY = 'decoratorWidth',
        MIN_WIDTH = 60,
        MIN_HEIGHT = 40;

    function EnrichedNoteDecorator(options) {
        var opts = _.extend({}, options);

        DiagramDesignerWidgetDecoratorBase.apply(this, [opts]);

        this.config = this.getDefaultConfig();
        ComponentSettings.resolveWithWebGMEGlobal(this.config, this.getComponentId());

        this.name = '';
        this.description = '';
        this.size = {
            width: MIN_WIDTH,
            height: MIN_HEIGHT
        };

        this.logger.debug('mbse4sdvEnrichedNoteDecorator ctor');
    }

    _.extend(EnrichedNoteDecorator.prototype, DiagramDesignerWidgetDecoratorBase.prototype);
    EnrichedNoteDecorator.prototype.DECORATORID = DECORATOR_ID;

    EnrichedNoteDecorator.prototype.getComponentId = function () {
        return DECORATOR_ID;
    };

    EnrichedNoteDecorator.prototype.getDefaultConfig = function () {
        return {
            textAlign: 'left',
            attrBlackList: [],
        };
    };

    /*********************** OVERRIDE DiagramDesignerWidgetDecoratorBase MEMBERS **************************/

    EnrichedNoteDecorator.prototype.$DOMBase = $(EnrichedNoteDecoratorTemplate);

    EnrichedNoteDecorator.prototype.on_addTo = function () {
        var self = this;

        // initializations
        this.nodeId = this._metaInfo[CONSTANTS.GME_ID];
        this.client = this._control._client;
        this.$name = this.$el.find('.name');
        this.$attributeContainer = this.$el.find('.attribute-container');
        this.$reszieIcon = this.$el.find('.resize-icon');
        this.mouseStartPos = null;
        this.elStartSize = null;

        // event handlers
        this.$el.on('dblclick.editOnDblClick', null, function (event) {
            if (self.hostDesignerItem.canvas.getIsReadOnlyMode() !== true) {
                self._showEditorDialog();
            }

            event.stopPropagation();
            event.preventDefault();
        });

        function calculateNewSize(event) {
            var dX = event.pageX - self.mouseStartPos.x,
                dY = event.pageY - self.mouseStartPos.y,
                width = self.elStartSize.width,
                height = self.elStartSize.height,
                newX,
                newY;

            dX = dX / self.hostDesignerItem.canvas._zoomRatio;
            dY = dY / self.hostDesignerItem.canvas._zoomRatio;
            newX = width + dX;
            newY = height + dY;

            newX = newX > MIN_WIDTH ? newX : MIN_WIDTH;
            newY = newY > MIN_HEIGHT ? newY : MIN_HEIGHT;

            return {
                width: Math.round(newX),
                height: Math.round(newY)
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
            self.mouseCurrPos = null;
            $(document).off('mousemove', mouseMoveHandler);
            $(document).off('mouseup', mouseUpHandler);

            self.client.startTransaction();
            self.client.setRegistry(self.nodeId, WIDTH_REG_KEY, newSize.width);
            self.client.setRegistry(self.nodeId, HEIGHT_REG_KEY, newSize.height);
            self.client.completeTransaction();
        }

        this.$reszieIcon.on('mousedown', function (event) {
            self.mouseStartPos = {
                x: event.pageX,
                y: event.pageY,
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

        // Render the stuff.
        this._renderSize();
        this._renderName();
        this._renderColors();
    };

    EnrichedNoteDecorator.prototype.update = function () {
        this._renderSize();
        this._renderName();
        this._renderColors();
    };

    EnrichedNoteDecorator.prototype._renderSize = function () {
        var nodeObj = this.client.getNode(this.nodeId),
            width,
            height;

        if (nodeObj) {
            width = nodeObj.getRegistry(WIDTH_REG_KEY);
            height = nodeObj.getRegistry(HEIGHT_REG_KEY);
        }

        if (width && width !== this.size.width) {
            this.size.width = width;
            this.$el.width(width);
        }

        if (height && height !== this.size.height) {
            this.size.height = height;
            this.$el.height(height);
        }
    };

    EnrichedNoteDecorator.prototype._renderName = function () {
        var nodeObj = this.client.getNode(this.nodeId),
            name,
            description;

        if (nodeObj) {
            name = nodeObj.getAttribute('name') || '';
            description = nodeObj.getAttribute('description') || '';
        }

        if (name !== this.name) {
            this.name = name;
            this.$name.text(this.name);
        }
        if (description !== this.description) {
            this.description = description;
            this.$attributeContainer.html(EnrichedNoteDecoratorCore.renderDescription(this.description));
        }
    };

    EnrichedNoteDecorator.prototype.getConnectionAreas = function (id /*, isEnd, connectionMetaInfo*/) {
        var result = [],
            edge = 10,
            LEN = 20;

        //by default return the bounding box edge's midpoints

        if (id === undefined || id === this.hostDesignerItem.id) {
            //NORTH
            result.push({
                id: '0',
                x1: edge,
                y1: 0,
                x2: this.hostDesignerItem.getWidth() - edge,
                y2: 0,
                angle1: 270,
                angle2: 270,
                len: LEN
            });

            //EAST
            result.push({
                id: '1',
                x1: this.hostDesignerItem.getWidth(),
                y1: edge,
                x2: this.hostDesignerItem.getWidth(),
                y2: this.hostDesignerItem.getHeight() - edge,
                angle1: 0,
                angle2: 0,
                len: LEN
            });

            //SOUTH
            result.push({
                id: '2',
                x1: edge,
                y1: this.hostDesignerItem.getHeight(),
                x2: this.hostDesignerItem.getWidth() - edge,
                y2: this.hostDesignerItem.getHeight(),
                angle1: 90,
                angle2: 90,
                len: LEN
            });

            //WEST
            result.push({
                id: '3',
                x1: 0,
                y1: edge,
                x2: 0,
                y2: this.hostDesignerItem.getHeight() - edge,
                angle1: 180,
                angle2: 180,
                len: LEN
            });
        }

        return result;
    };

    EnrichedNoteDecorator.prototype.doSearch = function (searchDesc) {
        var searchText = searchDesc.toString();

        if (this.name &&
            this.name.toLowerCase().indexOf(searchText.toLowerCase()) > -1) {
            return true;
        }

        return false;
    };

    EnrichedNoteDecorator.prototype._renderColors = function () {
        ModelDecoratorCore.prototype._getNodeColorsFromRegistry.apply(this);
        var nodeObj = this.client.getNode(this.nodeId),
            borderColor,
            backgroundColor,
            textColor;

        if (nodeObj) {
            borderColor = nodeObj.getAttribute('bordercolor') || '';
            backgroundColor = nodeObj.getAttribute('backgroundcolor') || '';
            textColor = nodeObj.getAttribute('textcolor') || '';
        }

        var style = {
            backgroundColor: backgroundColor ? backgroundColor : '#ffffff',
            borderColor: borderColor ? borderColor : '#000000',
            color: textColor ? textColor : '#000000',
        };

        this.$el.css(style);
        this.$attributeContainer.css({
            backgroundColor: backgroundColor ? backgroundColor : '',
            color: textColor ? textColor : ''
        });
    };

    EnrichedNoteDecorator.prototype._canAcceptTarget = function (dataTransfer) {
        //We handle only a single drop element, but microsoft word copies two elements actually for a single text...
        if (dataTransfer.items.length > 0) {
            if (dataTransfer.items[0].kind === 'string' ||
                (dataTransfer.items[0].kind === 'file' && (dataTransfer.items[0].type.indexOf('text') === 0 || dataTransfer.items[0].type === ''))) {
                return true;
            }
        }
        return false;
    };

    EnrichedNoteDecorator.prototype._getDropContentAsString = function (dataTransfer, callback) {
        var file,
            reader;

        if (dataTransfer.items[0].kind === 'string') {
            callback(dataTransfer.getData('Text'));
        } else {
            file = dataTransfer.files[0];
            reader = new FileReader();

            reader.onload = function (event) {
                callback(event.target.result);
            };
            reader.readAsText(file);
        }
    };

    /**
     * Opens the rich text editor dialog and persists name/description on save.
     * @return {void}
     */
    EnrichedNoteDecorator.prototype._showEditorDialog = function () {
        var self = this;
        var client = this._control._client;
        var nodeObj = client.getNode(this._metaInfo[CONSTANTS.GME_ID]);
        var description = nodeObj.getAttribute('description') || '';
        var name = nodeObj.getAttribute('name') || '';
        var editorDialog = new EnrichedNoteDialog();

        editorDialog.initialize(name, description,
            function (formObject) {
                try {
                    client.startTransaction();
                    client.setAttributes(self._metaInfo[CONSTANTS.GME_ID], 'name', formObject.name);
                    client.setAttributes(self._metaInfo[CONSTANTS.GME_ID], 'description', formObject.description);
                    client.completeTransaction();
                } catch (e) {
                    self.logger.error('Saving enriched note attributes failed', e);
                }
            }
        );

        editorDialog.show();
    };

    return EnrichedNoteDecorator;
});
