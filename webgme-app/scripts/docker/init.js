/*jshint node: true, esversion: 11*/
/**
 * Container start-up initialisation (idempotent). Runs before the WebGME server starts:
 *
 *  1. creates the JWT key pair if it does not exist (stored in a volume, never in the image or the repository);
 *  2. waits for MongoDB;
 *  3. creates the administrator account if it does not exist
 *     (ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD; a random password is generated and printed once if
 *     ADMIN_PASSWORD is empty);
 *  4. imports the example project (seed Mbse4sdvExample, linked to the SDV and HFSM libraries) for the
 *     administrator if it does not exist (IMPORT_EXAMPLE=false to skip).
 */
'use strict';

var path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    execFileSync = require('child_process').execFileSync;

var APP_DIR = path.join(__dirname, '..', '..'),
    ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin',
    ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.org',
    EXAMPLE_NAME = process.env.EXAMPLE_PROJECT_NAME || 'Mbse4sdvExample',
    EXAMPLE_SEED = path.join(APP_DIR, 'src', 'seeds', 'Mbse4sdvExample', 'Mbse4sdvExample.webgmex');

function log(msg) {
    console.log('[mbse4sdv-init] ' + msg);
}

function ensureJwtKeys(gmeConfig) {
    var privateKey = gmeConfig.authentication.jwt.privateKey,
        publicKey = gmeConfig.authentication.jwt.publicKey,
        pair;

    if (fs.existsSync(privateKey) && fs.existsSync(publicKey)) {
        log('JWT keys found.');
        return;
    }

    pair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {type: 'spki', format: 'pem'},
        privateKeyEncoding: {type: 'pkcs8', format: 'pem'}
    });
    fs.mkdirSync(path.dirname(privateKey), {recursive: true});
    fs.writeFileSync(privateKey, pair.privateKey, {mode: 0o600});
    fs.writeFileSync(publicKey, pair.publicKey, {mode: 0o644});
    log('JWT keys generated.');
}

function waitForMongo(webgme, gmeConfig, attempts) {
    return webgme.getGmeAuth(gmeConfig)
        .catch(function (err) {
            if (attempts <= 0) {
                throw err;
            }
            log('Waiting for MongoDB (' + err.message + ')...');
            return new Promise(function (resolve) {
                setTimeout(resolve, 2000);
            }).then(function () {
                return waitForMongo(webgme, gmeConfig, attempts - 1);
            });
        });
}

function ensureAdmin(gmeAuth) {
    return gmeAuth.getUser(ADMIN_USERNAME)
        .then(function () {
            log('Administrator "' + ADMIN_USERNAME + '" already exists.');
            return false;
        })
        .catch(function () {
            var password = process.env.ADMIN_PASSWORD,
                generated = !password;

            if (generated) {
                password = crypto.randomBytes(12).toString('base64url');
            }

            return gmeAuth.addUser(ADMIN_USERNAME, ADMIN_EMAIL, password, true, {overwrite: false, siteAdmin: true})
                .then(function () {
                    log('Administrator "' + ADMIN_USERNAME + '" created.');
                    if (generated) {
                        log('*** Generated password for "' + ADMIN_USERNAME + '": ' + password +
                            '  (printed on first start only and kept in the container logs: change it after ' +
                            'logging in, or set ADMIN_PASSWORD) ***');
                    }
                    return true;
                });
        });
}

function ensureExample(webgme, gmeConfig, gmeAuth) {
    var logger = webgme.Logger.create('mbse4sdv:init', gmeConfig.bin.log, false),
        storage = webgme.getStorage(logger, gmeConfig, gmeAuth),
        projectId = ADMIN_USERNAME + '+' + EXAMPLE_NAME;

    if (process.env.IMPORT_EXAMPLE === 'false') {
        log('Example project import disabled.');
        return Promise.resolve();
    }

    return storage.openDatabase()
        .then(function () {
            return storage.getProjects({username: ADMIN_USERNAME});
        })
        .then(function (projects) {
            var exists = projects.some(function (p) {
                return p._id === projectId;
            });

            if (exists) {
                log('Example project "' + projectId + '" already exists.');
                return;
            }

            log('Importing example project "' + projectId + '"...');
            execFileSync(process.execPath, [path.join(APP_DIR, 'node_modules/webgme-engine/src/bin/import.js'),
                EXAMPLE_SEED, '-p', EXAMPLE_NAME, '-u', ADMIN_USERNAME], {cwd: APP_DIR, stdio: 'ignore'});
            log('Example project imported.');
        })
        .then(function () {
            return storage.closeDatabase();
        });
}

function main() {
    var gmeConfig = require(path.join(APP_DIR, 'config')),
        webgme = require('webgme'),
        gmeAuth;

    if (gmeConfig.authentication.enable) {
        ensureJwtKeys(gmeConfig);
    }

    return waitForMongo(webgme, gmeConfig, 30)
        .then(function (gmeAuth_) {
            gmeAuth = gmeAuth_;
            log('MongoDB is ready.');
            return gmeConfig.authentication.enable ? ensureAdmin(gmeAuth) : null;
        })
        .then(function () {
            return ensureExample(webgme, gmeConfig, gmeAuth);
        })
        .then(function () {
            return gmeAuth.unload();
        });
}

main()
    .then(function () {
        process.exit(0);
    })
    .catch(function (err) {
        console.error('[mbse4sdv-init] Initialisation failed:', err);
        process.exit(1);
    });
