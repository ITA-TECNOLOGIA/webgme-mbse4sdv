/*jshint node: true, esversion: 11*/
/**
 * Exports a project as a WebGME seed (src/seeds/<SeedName>/<SeedName>.webgmex) and replaces the project id
 * stored in the package (which contains the exporting user) by a neutral "mbse4sdv+<SeedName>".
 *
 *   MONGO_URI=... node scripts/migration/export-seed.js <owner+project> <SeedName> --user <user>
 */
'use strict';

var path = require('path'),
    fs = require('fs'),
    execFileSync = require('child_process').execFileSync,
    AdmZip = require('adm-zip');

function main(argv) {
    var projectId = argv[2],
        seedName = argv[3],
        user = argv[argv.indexOf('--user') + 1],
        appDir = path.join(__dirname, '..', '..'),
        outDir = path.join(appDir, 'src', 'seeds', seedName),
        outFile = path.join(outDir, seedName + '.webgmex'),
        zip,
        json;

    if (!projectId || !seedName || argv.indexOf('--user') === -1) {
        throw new Error('Usage: export-seed.js <owner+project> <SeedName> --user <user>');
    }

    fs.mkdirSync(outDir, {recursive: true});
    execFileSync(process.execPath, [path.join(appDir, 'node_modules/webgme-engine/src/bin/export.js'),
        '-p', projectId.split('+')[1], '-o', projectId.split('+')[0], '-u', user, '-s', 'master', '-f', outFile],
    {cwd: appDir, stdio: ['ignore', 'ignore', 'inherit']});

    zip = new AdmZip(outFile);
    json = JSON.parse(zip.readAsText('project.json'));
    json.projectId = 'mbse4sdv+' + seedName;
    zip.updateFile('project.json', Buffer.from(JSON.stringify(json)));
    zip.writeZip(outFile);

    console.log('Seed written: ' + path.relative(appDir, outFile) + ' (' + json.objects.length + ' objects, root ' +
        json.rootHash + ')');
}

if (require.main === module) {
    main(process.argv);
}
