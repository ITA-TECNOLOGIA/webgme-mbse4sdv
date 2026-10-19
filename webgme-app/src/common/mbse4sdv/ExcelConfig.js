/*globals define, _ */
/*jshint browser: true*/

/**
 * @author rkereskenyi / https://github.com/rkereskenyi
 */

define(['js/Utils/GMEConcepts'], function (GMEConcepts) {

    'use strict';
    /*
     * a connection is an object that has CONSTANTS.POINTER_SOURCE and CONSTANTS.POINTER_TARGET
     * pointers and those values are set
     */
    function autoGenerateConfig(nodeId, node, client){
        let metaAttributes = _obtainAttribute(nodeId, client);
        let actualNode = {
            attributes:metaAttributes,
            title: node.getAttribute("name"),
            guid: node.getGuid(),
            path: nodeId,
            metaPath: node.getMetaTypeId(),
            form: true,
            vissible: true 
        }
        let children = _getChildren(nodeId, client);
        return {
            node: actualNode,
            children:children
        }
    }
    function _obtainAttribute(id, client) {
        let metaAttributes = [];
        let node = client.getNode(id);
        node.getAttributeNames().forEach(attributeName=>{
            let attributeNode = node.getAttributeMeta(attributeName);
            attributeNode.name = attributeName;
            switch (attributeNode.type){
                case "integer":attributeNode.representation = "integerInput"; break;
                case "float": attributeNode.representation = "floatInput"; break;
                case "boolean": attributeNode.representation = "booleanInput"; break;
                case "asset": attributeNode.representation = "fileInput"; break;
                default: 
                    if(attributeNode.multiline){
                        attributeNode.representation = "multiLineInput";
                        attributeNode.lenguaje = attributeNode.multilineType;break; 
                    }else if (attributeNode.enum){
                        attributeNode.representation = "select";
                        attributeNode.options = attributeNode.enum;
                    }else{
                        attributeNode.representation = "inputText";
                    }
            }
            if (!attributeNode.hidden){
                metaAttributes.push(attributeNode);
            }
        })
        return metaAttributes;
    };
    function _getChildren (id, client) {
        let node = client.getNode(id);
        let metaNodes = client.getAllMetaNodes();
        let validChilds = node.getValidChildrenMetaIds(metaNodes);
        let childs = [];
        validChilds.forEach(path=>{
            let childMetaNode = client.getNode(path);
            if (!GMEConcepts.isConnectionType(path) && !childMetaNode.isAbstract()) {
                childs.push(path);
            }
        });
        let table = childs.map(child =>{
            let meta = client.getNode(child);
            let attributes = _obtainAttribute(child, client);
            let tableNode = {
                editable: true,
                addable: true,
                deleteable: true,
                title: meta.getAttribute("name"),
                guid: meta.getGuid(),
                attributes: attributes,
                metaPath: meta.getId(),
                form: false,
                vissible: true,
                id: child 
            }
            return tableNode;
        });
    return table;
    }
    //return utility functions
    return {
        autoGenerateConfig: autoGenerateConfig,
        
    };
});