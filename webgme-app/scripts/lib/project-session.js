/*jshint node: true*/
/**
 * Small helper for command-line scripts that need to read/modify WebGME projects with the core API.
 * Usage:
 *   const session = await openSession();            // uses ./config (MONGO_URI, ...)
 *   const ctx = await session.open('owner+Project');  // {project, core, root, commitHash, branch}
 *   ...modify ctx.root with ctx.core...
 *   await session.commit(ctx, 'message');
 *   await session.close();
 */
'use strict';

var path = require('path'),
    Q = require('q'),
    webgme = require('webgme'),
    Core = webgme.requirejs('common/core/coreQ');

function openSession(options) {
    var gmeConfig = require(path.join(__dirname, '..', '..', 'config')),
        logger = webgme.Logger.create('mbse4sdv:scripts', gmeConfig.bin.log, false),
        username = (options && options.username) || gmeConfig.authentication.guestAccount,
        gmeAuth,
        storage;

    webgme.addToRequireJsPaths(gmeConfig);

    return webgme.getGmeAuth(gmeConfig)
        .then(function (gmeAuth_) {
            gmeAuth = gmeAuth_;
            storage = webgme.getStorage(logger.fork('storage'), gmeConfig, gmeAuth);
            return storage.openDatabase();
        })
        .then(function () {
            return {
                gmeConfig: gmeConfig,
                logger: logger,
                storage: storage,
                gmeAuth: gmeAuth,

                open: function (projectId, branch) {
                    var ctx = {branch: branch || 'master'};

                    return storage.openProject({projectId: projectId, username: username})
                        .then(function (project) {
                            ctx.project = project;
                            ctx.core = new Core(project, {globConf: gmeConfig, logger: logger.fork('core')});
                            return project.getBranchHash(ctx.branch);
                        })
                        .then(function (commitHash) {
                            ctx.commitHash = commitHash;
                            return Q.ninvoke(ctx.project, 'loadObject', commitHash);
                        })
                        .then(function (commitObj) {
                            return ctx.core.loadRoot(commitObj.root);
                        })
                        .then(function (root) {
                            ctx.root = root;
                            return ctx;
                        });
                },

                commit: function (ctx, message) {
                    var persisted = ctx.core.persist(ctx.root);

                    return ctx.project.makeCommit(ctx.branch, [ctx.commitHash], persisted.rootHash,
                        persisted.objects, message)
                        .then(function (result) {
                            ctx.commitHash = result.hash;
                            return result;
                        });
                },

                close: function () {
                    return storage.closeDatabase()
                        .then(function () {
                            return gmeAuth.unload();
                        });
                }
            };
        });
}

module.exports = {openSession: openSession};
