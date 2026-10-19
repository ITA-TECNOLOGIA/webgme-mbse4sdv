/*globals define*/
/*jshint browser: true*/

define([
    'js/Dialogs/PluginConfig/PluginConfigDialog'
], function (PluginConfigDialog) {
    'use strict';

    var ALL_META_TYPES = 'All',
        META_FIELD_NAMES = ['traceabilityRow', 'traceabilityColumn'];

    function mbse4sdvTraceabilityMatrixConfigDialog(params) {
        PluginConfigDialog.call(this, params);
    }

    mbse4sdvTraceabilityMatrixConfigDialog.prototype = Object.create(PluginConfigDialog.prototype);
    mbse4sdvTraceabilityMatrixConfigDialog.prototype.constructor = mbse4sdvTraceabilityMatrixConfigDialog;

    mbse4sdvTraceabilityMatrixConfigDialog.prototype.show = function (globalOptions, pluginMetadata, prevConfig, callback) {
        PluginConfigDialog.prototype.show.call(
            this,
            globalOptions,
            this._getPatchedMetadata(pluginMetadata, prevConfig),
            prevConfig,
            callback
        );
    };

    mbse4sdvTraceabilityMatrixConfigDialog.prototype.displayConfig = function (pluginMetadata, config, callback) {
        PluginConfigDialog.prototype.displayConfig.call(
            this,
            this._getPatchedMetadata(pluginMetadata, config),
            config,
            callback
        );
    };

    mbse4sdvTraceabilityMatrixConfigDialog.prototype._getPatchedMetadata = function (pluginMetadata, prevConfig) {
        var metadata = JSON.parse(JSON.stringify(pluginMetadata)),
            metaTypeOptions = this._getMetaTypeOptions(),
            self = this;

        metadata.configStructure.forEach(function (entry) {
            if (META_FIELD_NAMES.indexOf(entry.name) !== -1) {
                entry.valueItems = metaTypeOptions.slice();
                entry.value = self._getResolvedDefaultValue(entry, prevConfig, metaTypeOptions);
            }
        });

        return metadata;
    };

    mbse4sdvTraceabilityMatrixConfigDialog.prototype._getResolvedDefaultValue = function (entry, prevConfig, metaTypeOptions) {
        var configuredValue = prevConfig && prevConfig[entry.name] ? prevConfig[entry.name] : entry.value,
            resolvedValue = this._resolveMetaOption(configuredValue, metaTypeOptions);

        return resolvedValue || ALL_META_TYPES;
    };

    mbse4sdvTraceabilityMatrixConfigDialog.prototype._resolveMetaOption = function (value, metaTypeOptions) {
        var exactMatch,
            suffixMatches;

        if (!value) {
            return null;
        }

        exactMatch = metaTypeOptions.filter(function (option) {
            return option === value;
        })[0];

        if (exactMatch) {
            return exactMatch;
        }

        suffixMatches = metaTypeOptions.filter(function (option) {
            return option !== ALL_META_TYPES && option.split('.').pop() === value;
        });

        if (suffixMatches.length === 1) {
            return suffixMatches[0];
        }

        return null;
    };

    mbse4sdvTraceabilityMatrixConfigDialog.prototype._getMetaTypeOptions = function () {
        var client = this._client,
            metaNodes = client.getAllMetaNodes() || [],
            options = {};

        if (!Array.isArray(metaNodes)) {
            metaNodes = Object.keys(metaNodes).map(function (key) {
                return metaNodes[key];
            });
        }

        metaNodes.forEach(function (metaNodeInfo) {
            var node = metaNodeInfo;

            if (typeof metaNodeInfo === 'string') {
                node = client.getNode(metaNodeInfo);
            } else if (metaNodeInfo && typeof metaNodeInfo.getId !== 'function') {
                node = client.getNode(metaNodeInfo._id || metaNodeInfo.id);
            }

            if (node && node.getFullyQualifiedName()) {
                options[node.getFullyQualifiedName()] = true;
            }
        });

        return [ALL_META_TYPES].concat(Object.keys(options).sort(function (left, right) {
            return left.localeCompare(right);
        }));
    };

    return mbse4sdvTraceabilityMatrixConfigDialog;
});
