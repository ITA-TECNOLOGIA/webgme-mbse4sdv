/* Generated file based on ejs templates */
define([], function() {
    return {
    "Project.html.ejs": "<div id=\"<%= id %>-node-panel\" data-sort=\"<%= title %>\" class=\"root-viz-item\">\n  <div class=\"panel-heading\">\n    <h3 class=\"panel-title\"><%= title %></h3>\n  </div>\n  <div class=\"panel-body\">\n    <div class=\"row\" style=\"text-align:center;\">\n     <div style=\"width:'100%';height :'100%';max-width:'80px';max-height :'100px';\"><object data=\"<%- image %>\" width=\"100\" height=\"80\"> </object>\n   </div> </div>\n<div class='row'><div class='col-xs-5'><button id=\"learn-<%= id %>\" type='button' class='btn btn-default'>Help</button></div></div>\n  <div class=\"row root-viz-details\"><%- description %></div>\n   </div>\n</div>\n "
}});