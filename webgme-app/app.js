/*jshint node: true*/
'use strict';

var gmeConfig = require('./config'),
    webgme = require('webgme'),
    myServer;

webgme.addToRequireJsPaths(gmeConfig);

myServer = new webgme.standaloneServer(gmeConfig);
myServer.start(function (err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
});
