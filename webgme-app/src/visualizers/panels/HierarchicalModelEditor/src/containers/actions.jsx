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
export const setActiveNode = activeNode => ({
    type: 'SET_ACTIVE_NODE',
    activeNode,
});

export const setActiveSelection = activeSelection => ({
    type: 'SET_ACTIVE_SELECTION',
    activeSelection,
});


export const setReadOnly = readOnly => ({
    type: 'SET_READ_ONLY',
    readOnly,
});

export const setIsActivePanel = isActivePanel => ({
    type: 'SET_IS_ACTIVE_PANEL',
    isActivePanel,
});

export const setPanelSize = panelSize => ({
    type: 'SET_PANEL_SIZE',
    panelSize,
});
