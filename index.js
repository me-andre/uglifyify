var minimatch = require('minimatch').Minimatch
    , convert = require('convert-source-map')
    , through = require('through')
    , path = require('path')
    , ujs = require('uglify-js')
    , extend = require('extend');

module.exports = uglifyify;

function uglifyify(file, opts) {
    opts = opts || {};

    var debug = '_flags' in opts
        ? opts._flags.debug
        : true;

    delete opts._flags;

    if (ignore(file, opts.ignore)) {
        return through();
    }

    var buffer = '';
    var exts = []
        .concat(opts.exts || [])
        .concat(opts.x || [])
        .map(function (d) {
            if (d.charAt(0) === '.') return d;
            return '.' + d
        });

    if (
        /\.json$/.test(file) ||
        exts.length &&
        exts.indexOf(path.extname(file)) === -1
    ) {
        return through()
    }

    return through(function write(chunk) {
        buffer += chunk
    }, capture(function ready() {
        var matched = buffer.match(
            /\/\/[#@] ?sourceMappingURL=data:application\/json;base64,([a-zA-Z0-9+\/]+)={0,2}\n?$/
        );

        debug = opts.sourcemap !== false && (debug || matched);
        opts = extend({}, {
            fromString: true,
            filename: file,
            sourceMaps: debug
        }, opts);

        if (typeof opts.compress === 'object') {
            delete opts.compress._
        }

        if (debug) opts.outSourceMap = 'out.js.map';

        // Check if incoming source code already has source map comment.
        // If so, send it in to ujs.minify as the inSourceMap parameter
        if (debug && matched) {
            opts.inSourceMap = convert.fromJSON(
                new Buffer(matched[1], 'base64').toString()
            ).sourcemap
        }

        buffer = 'function module(){\n' + buffer + '\n}';

        var min = ujs.minify(buffer, opts);

        // Wrapping the code in the function allows uglify to drop unused named functions
        // that are declared in the module top-level scope
        min.code = function (code) {
            var start = code.indexOf('{');
            var end = code.lastIndexOf('}');
            return code.slice(start + 1, end);
        }(min.code);
        this.queue(min.code);

        if (min.map && min.map !== 'null') {
            var map = convert.fromJSON(min.map);

            map.setProperty('sources', [file]);
            map.setProperty('sourcesContent', matched
                    ? opts.inSourceMap.sourcesContent
                    : [buffer]
            );

            this.queue('\n');
            this.queue(map.toComment())
        }

        this.queue(null)
    }));

    function capture(fn) {
        return function () {
            try {
                fn.apply(this, arguments)
            } catch (err) {
                return this.emit('error', err)
            }
        }
    }
}

function ignore(file, list) {
    if (!list) return;

    list = Array.isArray(list) ? list : [list];

    return list.some(function (pattern) {
        var match = minimatch(pattern);
        return match.match(file)
    })
}
