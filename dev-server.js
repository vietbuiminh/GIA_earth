/**
 * dev-server - serves static resources for developing "earth" locally
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

var util = require("util");
var fs = require("fs");
var path = require("path");

/**
 * Returns true if the response should be compressed.
 */
function compressionFilter(req, res) {
    return (/json|text|javascript|font/).test(res.getHeader('Content-Type'));
}

/**
 * Adds headers to a response to enable caching.
 */
function cacheControl() {
    return function(req, res, next) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return next();
    };
}

const morgan = require('morgan');

// Define custom tokens for morgan
morgan.token('date', function() {
    return new Date().toISOString();
});
morgan.token('response-all', function(req, res) {
    return (res._header ? res._header : '').trim();
});
morgan.token('request-all', function(req, res) {
    return util.inspect(req.headers);
});

function logger() {
    return morgan(
        ':date - info: :remote-addr :req[cf-connecting-ip] :req[cf-ipcountry] :method :url HTTP/:http-version ' +
        '" :user-agent" :referrer :req[cf-ray] :req[accept-encoding]\n:request-all\n\n:response-all\n'
    );
}

// auto-generate GIA catalog from available files
function generateGIACatalog() {
    const giaDir = path.join(__dirname, 'public', 'data', 'gia');
    const catalogPath = path.join(giaDir, 'catalog.json');
    
    try {
        const files = fs.readdirSync(giaDir)
            .filter(file => /^gia-\d+ya\.json$/.test(file))
            .sort((a, b) => {
                const getYear = filename => parseInt(filename.match(/gia-(\d+)ya/)[1]);
                return getYear(a) - getYear(b);
            });
        
        fs.writeFileSync(catalogPath, JSON.stringify(files, null, 2));
        console.log(`Generated GIA catalog with ${files.length} datasets: ${files.join(', ')}`);
    } catch (error) {
        console.error('Error generating GIA catalog:', error.message);
    }
}

// TODO: kind of a hack - ideally this would be part of a build step???
generateGIACatalog();

var port = process.argv[2];
var express = require("express");
var app = express();

app.use(cacheControl());
// app.use(express.compress({filter: compressionFilter}));
const compression = require('compression');
app.use(compression({ filter: compressionFilter }));
app.use(logger());
app.use(express.static("public"));

app.listen(port);
console.log("Listening on port " + port + "...");
