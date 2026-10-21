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
import {connect} from 'react-redux';
import SubTreeWatcher from 'webgme-react-components/src/components/SubTreeWatcher';
import {setActiveNode, setActiveSelection} from './actions';


const mapStateToProps = state => ({
    activeNode: state.activeNode,
    activeSelection: state.activeSelection,

    readOnly: state.readOnly,
    isActivePanel: state.isActivePanel,
    width: state.panelSize.width,
    height: state.panelSize.height,
});

const mapDispatchToProps = dispatch => ({
    setActiveNode: (activeNode) => {
        dispatch(setActiveNode(activeNode));
    },
    setActiveSelection: (activeSelection) => {
        dispatch(setActiveSelection(activeSelection));
    },
});

export default connect(mapStateToProps, mapDispatchToProps)(SubTreeWatcher);
