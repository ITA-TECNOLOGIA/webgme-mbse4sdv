/*jshint node: true*/
/**
 * Rebuilds the WebGME client bundle (src/client/dist/webgme.<version>.dist.build.js) after
 * patch-package has applied patches/webgme+*.patch, so that the browser loads the patched modules.
 */
'use strict';

var buildDist = require('webgme/utils/build/dist/build.js');

console.log('Rebuilding the WebGME client bundle (this takes a while)...');
buildDist(function (err) {
    if (err) {
        console.error('Failed to rebuild the WebGME client bundle', err);
        process.exit(1);
    }
    console.log('WebGME client bundle rebuilt.');
});
