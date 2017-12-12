var fs = require('fs');
var _ = require('lodash');
var diff = require('deep-object-diff');

var oldReport = JSON.parse(fs.readFileSync(process.cwd() + '/' + process.argv[2]));
var libs = Object.keys(oldReport);
libs.forEach(lib => {
    oldReport[lib].forEach(val => {
        delete val.issuer;
        val.path = _.uniq(val.path).sort();
    });
});
var newReport = JSON.parse(fs.readFileSync(process.cwd() + '/' + process.argv[3]));
libs = Object.keys(newReport);
libs.forEach(lib => {
    newReport[lib].forEach(val => {
        delete val.issuer;
        val.path = _.uniq(val.path).sort();
    });
});

console.log('new', JSON.stringify(diff.addedDiff(oldReport, newReport), null, 4));
console.log('removed', JSON.stringify(diff.deletedDiff(oldReport, newReport), null, 4));