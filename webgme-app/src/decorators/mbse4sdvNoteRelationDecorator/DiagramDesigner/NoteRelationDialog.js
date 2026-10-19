/*globals define, $, EpicEditor*/
/*jshint browser:true*/
/**
 * @author Qishen Zhang / https://github.com/VictorCoder123
 */

define(['js/util',
    'text!./NoteRelationDialog.html'
], function (Util,
    NoteRelationDialogTemplate) {
    'use strict';

    var NoteRelationDialog;

    /**
     * NoteRelationDialog Constructor
     * Insert dialog modal into body and initialize editor with
     * customized options
     */
    NoteRelationDialog = function (title) {
        // Get Modal Template node for Editor Dialog and append it to body
        this._dialog = $(NoteRelationDialogTemplate);
        this._dialog.appendTo($(document.body));

        // Get element nodes
        this._el = this._dialog.find('.modal-body').first();
        this._btnSave = this._dialog.find('.btn-save').first();
        this._title = this._dialog.find('#dialog-title').first();
        if (title) {
            this._title.html(title);
        }

    };

    /**
     * Initialize NoteRelationDialog by creating EpicEditor in Bootstrap modal
     * window and set event listeners on its subcomponents like save button. Notice
     * EpicEditor is created but not loaded yet. The creation and loading of editor
     * are seperated due to the reason decorator component is not appended to DOM within
     * its own domain.
     * @param  {String}     text           Text to be rendered in editor initially
     * @param  {Function}   saveCallback   Callback function after click save button
     * @return {void}
     */
    NoteRelationDialog.prototype.initialize = function (name, description, saveCallback) {
        var self = this;
        document.getElementById('pNameField').value = name;
        document.getElementById('pDescriptionField').value = description;
        // Initialize Modal and append it to main DOM
        this._dialog.modal({show: false});

        // Event listener on click for SAVE button
        this._btnSave.on('click', function (event) {
            let formObject = {
                name: document.getElementById('pNameField').value,
                description: document.getElementById('pDescriptionField').value,
            }

            if (saveCallback) {
                saveCallback.call(null, formObject);
            }

            // Close dialog
            self._dialog.modal('hide');
            event.stopPropagation();
            event.preventDefault();
        });

        // Listener on event when dialog is shown
        // Use callback to show editor after Modal window is shown.


        // Listener on event when dialog is hidden
        this._dialog.on('hidden.bs.modal', function () {
            self._dialog.empty();
            self._dialog.remove();
        });
    };

    /**
     * @param  {String} newtext [new text to replace old one]
     */
    NoteRelationDialog.prototype.updateText = function (newtext) {
        this.text = newtext;
    };

    /**
     * Show actual text editor in its container by loading EpicEditor, this method
     * must be put into listener's callback function because its container is not appended
     * into DOM at this point and load() cannot access other DOM elements.
     * @return {void}
     */
    NoteRelationDialog.prototype.show = function () {
        var self = this;
        self._dialog.modal('show');
    };

    return NoteRelationDialog;
});
