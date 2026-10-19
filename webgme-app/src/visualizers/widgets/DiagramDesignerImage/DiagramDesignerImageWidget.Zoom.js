/*globals define*/
/*jshint browser: true*/

/**
 * @author rkereskenyi / https://github.com/rkereskenyi
 */

define(['widgets/DiagramDesignerImage/ZoomWidgetImage'], function (ZoomWidget) {

    'use strict';

    var DiagramDesignerWidgetZoom;

    DiagramDesignerWidgetZoom = function () {
    };

    DiagramDesignerWidgetZoom.prototype._initZoom = function (params) {
        var self = this,
            zoomValues = params.zoomValues,
            zoomWidget = new ZoomWidget({
                class: 'diagram-designer-zoom-container',
                sliderClass: 'diagram-designer-zoom-slider',
                zoomTarget: self.skinParts.$itemsContainer,
                zoomValues: zoomValues,
                onZoom: function (zoomLevel) {
                    self._zoomRatio = zoomLevel;
                    self._resizeItemContainer();
                    if(self.skinParts.$itemsContainer){
                        var elem = self.skinParts.$itemsContainer.children();
                        if (elem.length>1){
                            let i=0;
                            let zoomWidget = 1/zoomLevel;
                            for (i=0; i<elem.length; i++){
                                if(elem[i].nodeName==='DIV'){
                                    elem[i].style.transform = 'scale('+zoomWidget+')';
                                }
                            }
                        }
                        
                      
                       /* for(var i=0; i<elem.length; i++){
                          elem[i].css+={'transform':'scale('+zoomWidget+', '+zoomWidget+')'};
                          console.log(elem[i]);
                        }*/
                    }
                    self._updateDraggableItems();
                }
            });

        this._zoomSlider = zoomWidget.$zoomSlider;
        this.$el.parent().append(zoomWidget.$zoomContainer);

        //add zoom level UI and handlers
        this._addZoomMouseHandler(this.$el);
    };

    DiagramDesignerWidgetZoom.prototype._addZoomMouseHandler = function (el) {
        var self = this;

        //IE, Chrome, etc
        el.on('mousewheel', function (event) {
            var org = event.originalEvent;

            if (org && (org.ctrlKey || org.metaKey || org.altKey)) {
                //CTRL + mouse scroll
                if (org.wheelDelta < 0) {
                    self._zoomSlider.csszoom('zoomOut');
                } else {
                    self._zoomSlider.csszoom('zoomIn');
                }

                event.stopPropagation();
                event.preventDefault();
            }
        });

        //FIREFOX
        el.on('DOMMouseScroll', function (event) {
            var org = event.originalEvent;

            if (org && (org.ctrlKey || org.metaKey || org.altKey)) {
                //CTRL + mouse scroll
                if (org.detail > 0) {
                    self._zoomSlider.csszoom('zoomOut');
                } else {
                    self._zoomSlider.csszoom('zoomIn');
                }

                event.stopPropagation();
                event.preventDefault();
            }
        });
    };


    return DiagramDesignerWidgetZoom;
});
