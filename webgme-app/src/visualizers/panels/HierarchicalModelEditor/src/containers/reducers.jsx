/**
 * DISTRIBUTION STATEMENT C: U.S. Government agencies and their contractors.
 * Other requests shall be referred to DARPA’s Public Release Center via email at prc@darpa.mil.
 *
 * NOTE (MBSE4SDV): this file comes from https://github.com/webgme/hierarchical-model-editor
 * (commit 243eec7), which is published under the MIT License, Copyright (c) 2019
 * Vanderbilt University, ISIS. The distribution statement above is kept as it
 * appears in the original source. See THIRD_PARTY_LICENSES at the root of this
 * repository.
 * @author pmeijer / https://github.com/pmeijer
 */
import {combineReducers} from 'redux';
// import update from 'immutability-helper';

const activeNode = (state = null, action) => {
    if (action.type === 'SET_ACTIVE_NODE') {
        return action.activeNode;
    }

    return state;
};

const activeSelection = (state = [], action) => {
    if (action.type === 'SET_ACTIVE_SELECTION') {
        return action.activeSelection;
    }

    return state;
};

const readOnly = (state = false, action) => {
    if (action.type === 'SET_READ_ONLY') {
        return action.readOnly;
    }

    return state;
};

const isActivePanel = (state = false, action) => {
    if (action.type === 'SET_IS_ACTIVE_PANEL') {
        return action.isActivePanel;
    }

    return state;
};

const panelSize = (state = {width: 0, height: 0}, action) => {
    if (action.type === 'SET_PANEL_SIZE') {
        return action.panelSize;
    }

    return state;
};

export default combineReducers({
    // WebGMEGlobal State
    activeNode,
    activeSelection,

    // Panel events
    readOnly,
    isActivePanel,
    panelSize,
});
