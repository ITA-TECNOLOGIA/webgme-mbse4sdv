/*globals define, $, WebGMEGlobal*/
/*jshint browser:true*/

/**
 * Rich text editor dialog for mbse4sdvEnrichedNoteDecorator.
 *
 * Uses a plain contenteditable + document.execCommand toolbar (no extra
 * third-party WYSIWYG dependency) so it stays consistent with the rest of
 * this decorator set.
 *
 * Images (toolbar button, pasted screenshots, dropped files) are downscaled,
 * re-encoded in the browser and embedded as data: URIs inside the
 * "description" attribute, so they are persisted in MongoDB together with
 * the model. webgme's Blob storage is NOT used on purpose: by default it is a
 * plain folder inside the container (blob-local-storage) and is lost whenever
 * the image is rebuilt. Legacy notes whose <img> still point at
 * /rest/blob/download/<hash> are converted to data: URIs when opened here.
 */
define([
    'js/util',
    'js/logger',
    '../Core/EnrichedNoteDecorator.Core',
    'text!./EnrichedNoteDialog.html',
    'css!./EnrichedNoteDialog.css'
], function (Util,
             Logger,
             EnrichedNoteDecoratorCore,
             EnrichedNoteDialogTemplate) {
    'use strict';

    var EnrichedNoteDialog,
        // Longest side of an embedded image; enough to read diagram screenshots.
        MAX_IMAGE_DIMENSION = 1600,
        IMAGE_QUALITY = 0.85,
        // New images below this size (and within MAX_IMAGE_DIMENSION) are kept
        // byte-for-byte, e.g. small PNG icons or animated GIFs.
        SMALL_IMAGE_DATAURL_LENGTH = 200 * 1024,
        // Hard cap per embedded image, keeps node objects well below the
        // 16MB MongoDB document limit even with several images per note.
        MAX_IMAGE_DATAURL_LENGTH = 1.5 * 1024 * 1024,
        BLOB_DOWNLOAD_RE = /\/blob\/download\//;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeTextToHtml(str) {
        return escapeHtml(str).replace(/\n/g, '<br>');
    }

    function readAsDataUrl(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();

            reader.onload = function () {
                resolve(reader.result);
            };
            reader.onerror = function () {
                reject(reader.error || new Error('Could not read image'));
            };
            reader.readAsDataURL(blob);
        });
    }

    function loadImage(src) {
        return new Promise(function (resolve, reject) {
            var img = new Image();

            img.onload = function () {
                resolve(img);
            };
            img.onerror = function () {
                reject(new Error('Could not decode image'));
            };
            img.src = src;
        });
    }

    function mimeOfDataUrl(dataUrl) {
        var match = /^data:([^;,]+)/i.exec(dataUrl);
        return match ? match[1].toLowerCase() : '';
    }

    /**
     * Downscales/re-encodes a data: URI so it can be embedded in the model
     * without bloating it. SVGs are kept as they are (vector, usually small).
     * @param {string} dataUrl
     * @param {boolean} isNew - new images are re-encoded above
     *  SMALL_IMAGE_DATAURL_LENGTH; images already in the note only when they
     *  exceed the limits, so reopening a note does not degrade them again.
     * @return {Promise<string>}
     */
    function compressDataUrl(dataUrl, isNew) {
        var mime = mimeOfDataUrl(dataUrl);

        if (mime === 'image/svg+xml') {
            return Promise.resolve(dataUrl);
        }

        return loadImage(dataUrl).then(function (img) {
            var width = img.naturalWidth,
                height = img.naturalHeight,
                scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height, 1)),
                sizeLimit = isNew ? SMALL_IMAGE_DATAURL_LENGTH : MAX_IMAGE_DATAURL_LENGTH,
                canvas,
                result;

            if (scale === 1 && mime.indexOf('image/') === 0 && dataUrl.length <= sizeLimit) {
                return dataUrl;
            }

            canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

            // WebP keeps transparency and compresses screenshots well; browsers
            // that cannot encode it silently return PNG, so fall back explicitly.
            result = canvas.toDataURL('image/webp', IMAGE_QUALITY);
            if (result.indexOf('data:image/webp') !== 0) {
                result = mime === 'image/jpeg' ?
                    canvas.toDataURL('image/jpeg', IMAGE_QUALITY) : canvas.toDataURL('image/png');
            }

            return scale === 1 && mime.indexOf('image/') === 0 && result.length >= dataUrl.length ?
                dataUrl : result;
        });
    }

    function assertEmbeddable(dataUrl, name) {
        if (dataUrl.length > MAX_IMAGE_DATAURL_LENGTH) {
            throw new Error((name || 'Image') + ' is too large to embed (' +
                Math.round(dataUrl.length / 1024) + ' KB after compression)');
        }
        return dataUrl;
    }

    function imageFilesFrom(dataTransfer) {
        var files = [];

        if (!dataTransfer) {
            return files;
        }

        if (dataTransfer.items && dataTransfer.items.length) {
            [].slice.call(dataTransfer.items).forEach(function (item) {
                var file;

                if (item.kind === 'file' && /^image\//i.test(item.type)) {
                    file = item.getAsFile();
                    if (file) {
                        files.push(file);
                    }
                }
            });
        } else if (dataTransfer.files) {
            [].slice.call(dataTransfer.files).forEach(function (file) {
                if (/^image\//i.test(file.type)) {
                    files.push(file);
                }
            });
        }

        return files;
    }

    /**
     * True if pasted HTML carries something beyond an image placeholder, e.g.
     * screenshots tools put both an image file and an <img src="file://...">.
     */
    function hasMeaningfulHtml(html) {
        var div = document.createElement('div');

        if (!html) {
            return false;
        }

        div.innerHTML = EnrichedNoteDecoratorCore.sanitizeHtml(html);

        return div.textContent.trim() !== '' || [].slice.call(div.querySelectorAll('img')).some(function (img) {
            return /^(https?:|data:image\/)/i.test(img.getAttribute('src') || '');
        });
    }

    function caretRangeFromPoint(x, y) {
        var pos,
            range;

        if (document.caretRangeFromPoint) {
            return document.caretRangeFromPoint(x, y);
        }
        if (document.caretPositionFromPoint) {
            pos = document.caretPositionFromPoint(x, y);
            if (pos) {
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
                return range;
            }
        }
        return null;
    }

    /**
     * EnrichedNoteDialog Constructor.
     * Inserts the dialog modal into the body.
     */
    EnrichedNoteDialog = function (title) {
        this._dialog = $(EnrichedNoteDialogTemplate);
        this._dialog.appendTo($(document.body));

        this._el = this._dialog.find('.modal-body').first();
        this._btnSave = this._dialog.find('.btn-save').first();
        this._title = this._dialog.find('#dialog-title').first();
        this._editor = this._dialog.find('#pDescriptionEditor').first();
        this._imageInput = this._dialog.find('.enriched-note-image-input').first();
        this._uploadStatus = this._dialog.find('.enriched-note-upload-status').first();

        this._logger = Logger.create('gme:decorators:mbse4sdvEnrichedNoteDecorator:EnrichedNoteDialog',
            WebGMEGlobal.gmeConfig.client.log);

        this._savedRange = null;
        this._pendingImageWork = [];
        this._pendingImageCount = 0;
        this._imageError = null;
        // <img> elements currently being converted, avoids double processing.
        this._imagesInProgress = typeof WeakSet === 'function' ? new WeakSet() : null;

        if (title) {
            this._title.html(title);
        }
    };

    /**
     * Remembers the current selection inside the editor so that toolbar
     * actions (which may steal focus, e.g. opening the native file picker
     * for image upload) can restore the caret position afterwards.
     */
    EnrichedNoteDialog.prototype._saveSelection = function () {
        var sel = window.getSelection();

        if (sel.rangeCount > 0 && this._editor[0].contains(sel.anchorNode)) {
            this._savedRange = sel.getRangeAt(0).cloneRange();
        }
    };

    EnrichedNoteDialog.prototype._restoreSelection = function () {
        var sel = window.getSelection(),
            range;

        this._editor.focus();
        sel.removeAllRanges();

        if (this._savedRange) {
            sel.addRange(this._savedRange);
        } else {
            range = document.createRange();
            range.selectNodeContents(this._editor[0]);
            range.collapse(false);
            sel.addRange(range);
        }
    };

    EnrichedNoteDialog.prototype._insertHtmlAtSelection = function (html) {
        this._restoreSelection();
        document.execCommand('insertHTML', false, html);
        this._saveSelection();
    };

    EnrichedNoteDialog.prototype._refreshImageStatus = function () {
        if (this._pendingImageCount > 0) {
            this._uploadStatus.text('Processing images...');
        } else {
            this._uploadStatus.text(this._imageError || '');
        }
    };

    /**
     * Registers async image work so Save can wait for it. The returned
     * promise never rejects; failures are logged and shown in the toolbar.
     */
    EnrichedNoteDialog.prototype._trackImageWork = function (work) {
        var self = this,
            tracked;

        this._pendingImageCount += 1;
        this._imageError = null;
        this._refreshImageStatus();

        tracked = work
            .catch(function (err) {
                self._logger.error('Image processing failed', err);
                self._imageError = err && err.message ? err.message : String(err);
            })
            .then(function () {
                self._pendingImageCount -= 1;
                self._refreshImageStatus();
            });

        this._pendingImageWork.push(tracked);
        return tracked;
    };

    EnrichedNoteDialog.prototype._waitForImageWork = function () {
        var self = this,
            count = this._pendingImageWork.length;

        return Promise.all(this._pendingImageWork.slice()).then(function () {
            // More work may have been queued while waiting (e.g. a late paste).
            return self._pendingImageWork.length > count ? self._waitForImageWork() : undefined;
        });
    };

    /**
     * Inserts image files at the current selection as embedded data: URIs,
     * keeping their order.
     * @param {File[]} files
     */
    EnrichedNoteDialog.prototype._insertImageFiles = function (files) {
        var self = this;

        files.reduce(function (previous, file) {
            var step = previous.then(function () {
                return readAsDataUrl(file)
                    .then(function (dataUrl) {
                        return compressDataUrl(dataUrl, true);
                    })
                    .then(function (dataUrl) {
                        assertEmbeddable(dataUrl, file.name);
                        self._insertHtmlAtSelection('<img src="' + escapeHtml(dataUrl) + '" alt="' +
                            escapeHtml(file.name || 'image') + '">');
                    });
            });

            return self._trackImageWork(step);
        }, Promise.resolve());
    };

    /**
     * Converts <img> elements that are not yet self-contained: legacy images
     * pointing at webgme's Blob storage (fetched and embedded) and oversized
     * data: URIs (e.g. pasted from other editors).
     * @param {HTMLElement} rootEl
     */
    EnrichedNoteDialog.prototype._embedImages = function (rootEl) {
        var self = this;

        [].slice.call(rootEl.querySelectorAll('img')).forEach(function (img) {
            var src = img.getAttribute('src') || '',
                isNew,
                work;

            if (self._imagesInProgress && self._imagesInProgress.has(img)) {
                return;
            }

            if (BLOB_DOWNLOAD_RE.test(src) || img.hasAttribute('data-blob-hash')) {
                isNew = true;
                work = fetch(src, {credentials: 'same-origin'})
                    .then(function (res) {
                        if (!res.ok) {
                            throw new Error('Image ' + (img.getAttribute('alt') || src) +
                                ' is no longer available in blob storage (HTTP ' + res.status + ')');
                        }
                        return res.blob();
                    })
                    .then(readAsDataUrl);
            } else if (/^data:image\//i.test(src) && src.length > SMALL_IMAGE_DATAURL_LENGTH) {
                isNew = false;
                work = Promise.resolve(src);
            } else {
                return;
            }

            if (self._imagesInProgress) {
                self._imagesInProgress.add(img);
            }

            self._trackImageWork(work
                .then(function (dataUrl) {
                    return compressDataUrl(dataUrl, isNew);
                })
                .then(function (dataUrl) {
                    assertEmbeddable(dataUrl, img.getAttribute('alt'));
                    img.setAttribute('src', dataUrl);
                    img.removeAttribute('data-blob-hash');
                })
                .then(function () {
                    if (self._imagesInProgress) {
                        self._imagesInProgress.delete(img);
                    }
                }, function (err) {
                    if (self._imagesInProgress) {
                        self._imagesInProgress.delete(img);
                    }
                    throw err;
                }));
        });
    };

    EnrichedNoteDialog.prototype._attachToolbarHandlers = function () {
        var self = this;

        this._dialog.find('.enriched-note-toolbar [data-cmd]').on('click', function (event) {
            var $btn = $(this),
                cmd = $btn.attr('data-cmd'),
                value = $btn.attr('data-value') || null;

            event.preventDefault();
            self._restoreSelection();
            document.execCommand(cmd, false, value);
            self._saveSelection();
        });

        this._dialog.find('[data-action="link"]').on('click', function (event) {
            var url;

            event.preventDefault();
            url = window.prompt('Link URL:', 'https://');

            if (url) {
                self._restoreSelection();
                document.execCommand('createLink', false, url);
                self._saveSelection();
            }
        });

        this._dialog.find('[data-action="image"]').on('click', function (event) {
            event.preventDefault();
            self._saveSelection();
            self._imageInput.val('');
            self._imageInput.trigger('click');
        });

        this._imageInput.on('change', function (event) {
            var files = event.target.files ? [].slice.call(event.target.files) : [];

            if (files.length > 0) {
                self._insertImageFiles(files);
            }
        });

        this._editor.on('mouseup keyup', function () {
            self._saveSelection();
        });

        this._editor.on('paste', function (event) {
            var clipboardData = event.originalEvent.clipboardData,
                files,
                html,
                text;

            if (!clipboardData) {
                return;
            }

            event.preventDefault();

            files = imageFilesFrom(clipboardData);
            html = clipboardData.getData('text/html');
            text = clipboardData.getData('text/plain');

            if (files.length > 0 && !hasMeaningfulHtml(html)) {
                self._saveSelection();
                self._insertImageFiles(files);
            } else if (html) {
                self._insertHtmlAtSelection(EnrichedNoteDecoratorCore.sanitizeHtml(html));
                self._embedImages(self._editor[0]);
            } else if (text) {
                self._insertHtmlAtSelection(escapeTextToHtml(text));
            }
        });

        this._editor.on('drop', function (event) {
            var originalEvent = event.originalEvent,
                files = imageFilesFrom(originalEvent.dataTransfer),
                range;

            if (files.length === 0) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            range = caretRangeFromPoint(originalEvent.clientX, originalEvent.clientY);
            if (range && self._editor[0].contains(range.startContainer)) {
                self._savedRange = range;
            }

            self._insertImageFiles(files);
        });
    };

    /**
     * Loads the current name/description into the dialog and wires up save/cancel.
     * @param {string} name
     * @param {string} description - may be plain text (legacy) or sanitized HTML
     * @param {function(Object)} saveCallback
     */
    EnrichedNoteDialog.prototype.initialize = function (name, description, saveCallback) {
        var self = this,
            saving = false;

        this._dialog.find('#pNameField').val(name);
        this._editor.html(EnrichedNoteDecoratorCore.renderDescription(description));

        this._attachToolbarHandlers();
        this._embedImages(this._editor[0]);

        this._dialog.modal({show: false});

        this._btnSave.on('click', function (event) {
            event.stopPropagation();
            event.preventDefault();

            if (saving) {
                return;
            }

            saving = true;
            self._btnSave.addClass('disabled');

            self._waitForImageWork().then(function () {
                var formObject = {
                    name: self._dialog.find('#pNameField').val(),
                    description: EnrichedNoteDecoratorCore.sanitizeHtml(self._editor.html())
                };

                if (saveCallback) {
                    saveCallback.call(null, formObject);
                }

                self._dialog.modal('hide');
            });
        });

        this._dialog.on('hidden.bs.modal', function () {
            self._dialog.empty();
            self._dialog.remove();
        });
    };

    EnrichedNoteDialog.prototype.show = function () {
        this._dialog.modal('show');
    };

    return EnrichedNoteDialog;
});
