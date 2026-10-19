/*globals define*/

/**
 * Shared rendering/sanitizing helpers for the mbse4sdvEnrichedNoteDecorator,
 * used by both the canvas widget (read-only render) and the edit dialog
 * (sanitizing on load/save).
 */
define([], function () {

    'use strict';

    function isHtml(text) {
        return /<[a-zA-Z][^>]*>/.test(text);
    }

    function inlineFormat(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
    }

    /**
     * Fallback renderer for legacy plain-text/markdown-ish notes, e.g. content
     * created before a "Note" instance was switched to this decorator.
     */
    function markdownToHtml(text) {
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
                html.push('<h' + lvl + '>' + inlineFormat(headingMatch[2]) + '</h' + lvl + '>');
            } else if (ulMatch) {
                if (listType !== 'ul') {
                    flushList();
                    listType = 'ul';
                }
                listItems.push('<li>' + inlineFormat(ulMatch[1]) + '</li>');
            } else if (olMatch) {
                if (listType !== 'ol') {
                    flushList();
                    listType = 'ol';
                }
                listItems.push('<li>' + inlineFormat(olMatch[1]) + '</li>');
            } else if (line.trim() === '') {
                flushList();
                if (html.length > 0) {
                    html.push('<br>');
                }
            } else {
                flushList();
                html.push('<span>' + inlineFormat(line) + '</span><br>');
            }
        });

        flushList();
        return html.join('');
    }

    function isDangerousUrl(value) {
        var v = (value || '').trim().toLowerCase();
        return v.indexOf('javascript:') === 0 || v.indexOf('vbscript:') === 0 || v.indexOf('data:text/html') === 0;
    }

    /**
     * Strips script-executing tags/attributes while keeping formatting,
     * links and images (including blob-storage URLs and data: image URIs
     * pasted from other editors). Not a full XSS sanitizer replacement for
     * untrusted/multi-tenant content, but sufficient for authenticated
     * project collaborators editing their own model notes.
     */
    function sanitizeHtml(html) {
        var div = document.createElement('div');
        div.innerHTML = html;

        [].slice.call(div.querySelectorAll('script,style,iframe,object,embed,link,meta')).forEach(function (el) {
            el.parentNode.removeChild(el);
        });

        [].slice.call(div.querySelectorAll('*')).forEach(function (el) {
            [].slice.call(el.attributes).forEach(function (attr) {
                var name = attr.name.toLowerCase();

                if (name.indexOf('on') === 0) {
                    el.removeAttribute(attr.name);
                } else if ((name === 'href' || name === 'src') && isDangerousUrl(attr.value)) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        return div.innerHTML;
    }

    function renderDescription(text) {
        if (!text) {
            return '';
        }
        if (isHtml(text)) {
            return sanitizeHtml(text);
        }
        return markdownToHtml(text);
    }

    return {
        isHtml: isHtml,
        markdownToHtml: markdownToHtml,
        sanitizeHtml: sanitizeHtml,
        renderDescription: renderDescription
    };
});
