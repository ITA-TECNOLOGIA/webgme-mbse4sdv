/*jshint node: true*/
// Runtime settings. Secrets and environment-specific values come from environment variables.
'use strict';

var path = require('path'),
    config = require('./config.webgme');

config.server.port = parseInt(process.env.PORT, 10) || 8888;
config.mongo.uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mbse4sdv';

// Authentication (JWT keys are generated at container start-up, never committed)
config.authentication.enable = process.env.AUTH_ENABLE !== 'false';
config.authentication.allowGuests = false;
config.authentication.allowUserRegistration = process.env.ALLOW_USER_REGISTRATION === 'true';
config.authentication.logInUrl = '/profile/login';
config.authentication.logOutUrl = '/profile/login';
config.authentication.jwt.privateKey = process.env.JWT_PRIVATE_KEY ||
    path.join(__dirname, '..', 'token_keys', 'private_key');
config.authentication.jwt.publicKey = process.env.JWT_PUBLIC_KEY ||
    path.join(__dirname, '..', 'token_keys', 'public_key');
config.authentication.jwt.allowInsecureKeySizes = false; // keys are generated with 2048+ bits

// Plugins
config.plugin.allowBrowserExecution = true;
config.plugin.allowServerExecution = true;

// Client
// NOTE: config.client.appVersion must stay the WebGME version (default): it selects the client bundle file.
config.client.defaultConnectionRouter = 'basic3';
config.client.allowUserDefinedSVG = true;
config.client.errorReporting.enable = false;

config.storage.autoMerge.enable = true;

// Logging: in containers log only to stdout (docker logs) instead of ./server.log files
if (process.env.LOG_TO_FILES === 'false') {
    config.server.log.transports = config.server.log.transports.filter(function (transport) {
        return transport.transportType === 'Console';
    });
    config.server.log.transports.forEach(function (transport) {
        transport.options.colorize = false;
    });
}

module.exports = config;
