/*globals define, _, $*/

/**
 * @author pmeijer / https://github.com/pmeijer
 */

define([
    'js/Constants',
    'js/Utils/ComponentSettings',
    'js/Widgets/DiagramDesigner/DiagramDesignerWidget.DecoratorBase',
    'decorators/ModelDecorator/Core/ModelDecorator.Core',
    './NoteDialog',
    'text!./NoteDecorator.DiagramDesignerWidget.html',
    'css!./NoteDecorator.DiagramDesignerWidget.css'
], function (CONSTANTS,
             ComponentSettings,
             DiagramDesignerWidgetDecoratorBase,
             ModelDecoratorCore,
             NoteDialog,
             NoteDecoratorTemplate) {

    'use strict';

    function _isHtml(text) {
        return /<[a-zA-Z][^>]*>/.test(text);
    }

    function _inlineFormat(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
    }

    function _markdownToHtml(text) {
        var lines = text.split('\n');
        var html = [];
        var listItems = [];
        var listType = null;

        function flushList() {
            if (listItems.length > 0) {
                html.push('<' + listType + '>' + listItems.join('') + '</' + listType + '>');
                listItems = [];
                listType = null;
            }
        }

        lines.forEach(function (line) {
            var headingMatch = line.match(/^(#{1,6}) (.+)$/);
            var ulMatch = line.match(/^[-*] (.+)$/);
            var olMatch = line.match(/^\d+\. (.+)$/);

            if (headingMatch) {
                flushList();
                var lvl = headingMatch[1].length;
                html.push('<h' + lvl + '>' + _inlineFormat(headingMatch[2]) + '</h' + lvl + '>');
            } else if (ulMatch) {
                if (listType !== 'ul') { flushList(); listType = 'ul'; }
                listItems.push('<li>' + _inlineFormat(ulMatch[1]) + '</li>');
            } else if (olMatch) {
                if (listType !== 'ol') { flushList(); listType = 'ol'; }
                listItems.push('<li>' + _inlineFormat(olMatch[1]) + '</li>');
            } else if (line.trim() === '') {
                flushList();
                if (html.length > 0) { html.push('<br>'); }
            } else {
                flushList();
                html.push('<span>' + _inlineFormat(line) + '</span><br>');
            }
        });

        flushList();
        return html.join('');
    }

    function _sanitizeHtml(html) {
        var div = document.createElement('div');
        div.innerHTML = html;
        [].slice.call(div.querySelectorAll('script,style,iframe,object,embed')).forEach(function (el) {
            el.parentNode.removeChild(el);
        });
        [].slice.call(div.querySelectorAll('*')).forEach(function (el) {
            [].slice.call(el.attributes).forEach(function (attr) {
                if (/^on/i.test(attr.name) ||
                    (attr.name === 'href' && /^javascript:/i.test(attr.value))) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return div.innerHTML;
    }

    function _renderDescription(text) {
        if (!text) {
            return '';
        }
        if (_isHtml(text)) {
            return _sanitizeHtml(text);
        }
        return _markdownToHtml(text);
    }

    var DECORATOR_ID = 'mbse4sdvNoteDecorator',
        HEIGHT_REG_KEY = 'decoratorHeight',
        WIDTH_REG_KEY = 'decoratorWidth',
        MIN_WIDTH = 60,
        MIN_HEIGHT = 40,
        NO_DROP_COLOR = 'rgba(255, 0, 0, 0.1)',
        ALLOW_DROP_COLOR = 'rgba(0, 255, 0, 0.1)';

    function NoteDecorator(options) {
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

        this.fields = {
            // <attrName>: {
            //   el: <$el>,
            //   value: <string>,
            //   name: <string>,
            //   type: <null||string>,
            //   lineCnt: <number>
            // }
        };

        this.logger.debug('mbse4sdvNoteDecorator ctor');
    }

    _.extend(NoteDecorator.prototype, DiagramDesignerWidgetDecoratorBase.prototype);
    NoteDecorator.prototype.DECORATORID = DECORATOR_ID;

    NoteDecorator.prototype.getComponentId = function () {
        return DECORATOR_ID;
    };

    NoteDecorator.prototype.getDefaultConfig = function () {
        return {
            textAlign: 'left',
            attrBlackList: [],
        };
    };

    /*********************** OVERRIDE DiagramDesignerWidgetDecoratorBase MEMBERS **************************/

    NoteDecorator.prototype.$DOMBase = $(NoteDecoratorTemplate);

    NoteDecorator.prototype.on_addTo = function () {
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

            // console.log('mouse down on icon', JSON.stringify(self.mouseStartPos));

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

    NoteDecorator.prototype.update = function () {
        this._renderSize();
        this._renderName();
        this._renderColors();
    };

    NoteDecorator.prototype._renderSize = function () {
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



    NoteDecorator.prototype._renderName = function () {
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
            this.$attributeContainer.html(_renderDescription(this.description));
        }
    };

    NoteDecorator.prototype.getConnectionAreas = function (id /*, isEnd, connectionMetaInfo*/) {
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

    NoteDecorator.prototype.doSearch = function (searchDesc) {
        var searchText = searchDesc.toString();

        if (this.name &&
            this.name.toLowerCase().indexOf(searchText.toLowerCase()) > -1) {
            return true;
        }

        return false;
    };

    NoteDecorator.prototype._renderColors = function () {
        // TODO: apply the user-selected colour here
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

        var self = this,
            style = {
            backgroundColor,
                backgroundColor: backgroundColor ? backgroundColor : '#ffffff',
                borderColor: borderColor ? borderColor : '#000000',
                color: textColor ? textColor : '#000000',
            },
            contentStyle = {
                backgroundColor: backgroundColor ? backgroundColor : '',
                color: textColor ? textColor : '',
            };

        this.$el.css(style);

        Object.keys(self.fields)
            .forEach(function (attrName) {
                self.fields[attrName].el.find('textarea').css(contentStyle);
            });
    };

    NoteDecorator.prototype._canAcceptTarget = function (dataTransfer) {
        //We handle only a single drop element, but microsoft word copies two elements actually for a single text...
        if (dataTransfer.items.length > 0) {
            if (dataTransfer.items[0].kind === 'string' ||
                (dataTransfer.items[0].kind === 'file' && (dataTransfer.items[0].type.indexOf('text') === 0 || dataTransfer.items[0].type === ''))) {
                return true;
            }
        }
        return false;
    };

    NoteDecorator.prototype._getDropContentAsString = function (dataTransfer, callback) {
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
     * Initialize Dialog and Editor creation
     * @return {void}
     */
    NoteDecorator.prototype._showEditorDialog = function () {
        var self = this;
        var client = this._control._client;
        var nodeObj = client.getNode(this._metaInfo[CONSTANTS.GME_ID]);
        var description = nodeObj.getAttribute('description') || '';
        var name = nodeObj.getAttribute('name') || '';
        var editorDialog = new NoteDialog();

        // Initialize with documentation attribute and save callback function
        editorDialog.initialize(name, description,
            function (formObject) {
                try {
                    client.startTransaction();
                    client.setAttributes(self._metaInfo[CONSTANTS.GME_ID], 'name', formObject.name);
                    client.setAttributes(self._metaInfo[CONSTANTS.GME_ID], 'description', formObject.description);
                    client.completeTransaction();
                } catch (e) {
                    self.logger.error('Saving META failed... Either not JSON object or something else went wrong...');
                }
            }
        );

        editorDialog.show();
    };

    return NoteDecorator;
});
