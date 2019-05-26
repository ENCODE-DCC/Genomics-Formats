"use strict";
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
var __values = (this && this.__values) || function (o) {
    var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
    if (m) return m.call(o);
    return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
};
Object.defineProperty(exports, "__esModule", { value: true });
var Strand_1 = require("./Strand");
var Gff3LineParser = /** @class */ (function () {
    function Gff3LineParser(callbacks) {
        var _this = this;
        this.callbacks = {
            onVersion: function (versionString) { },
            onSequenceRegion: function (seqId, start, end) { },
            onFeatureOntology: function (uri) { },
            onAttributeOntology: function (uri) { },
            onSourceOntology: function (uri) { },
            onSpecies: function (ncbiTaxonomyUri) { },
            onGenomeBuild: function (source, buildName) { },
            onFeatureGroupTermination: function () { },
            onFastaStart: function () { },
            onComment: function (comment) { },
            onFeature: function (seqId, source, type, start, end, score, strand, phase, attributes) { },
            // error handling
            onUnknownDirective: function (name, parameter) { },
            onInvalidDirective: function (content, reason) { },
            onInvalidFeature: function (line, reason) { },
            onInvalidAttribute: function (assignment, reason) { },
            onFastaChunk: function (string) { },
            onComplete: function () { }
        };
        this.reset = function () {
            _this.lineNumber = 0;
            _this.incompleteLineBuffer = '';
            _this.fastaMode = false;
            _this.gtfCompatMode = false;
        };
        this.parseChunk = function (string) {
            if (_this.fastaMode) {
                _this.callbacks.onFastaChunk(string);
                return;
            }
            var lineStart = 0;
            for (var i = 0; i < string.length; i++) {
                var char = string.charAt(i);
                if (char === '\n') {
                    _this.parseLine(_this.incompleteLineBuffer + string.substring(lineStart, i), _this.lineNumber++);
                    lineStart = i + 1;
                    _this.incompleteLineBuffer = '';
                }
            }
            _this.incompleteLineBuffer = string.substring(lineStart);
        };
        this.end = function () {
            _this.parseLine(_this.incompleteLineBuffer, _this.lineNumber++);
            _this.callbacks.onComplete();
        };
        this.callbacks = __assign({}, this.callbacks, callbacks);
        this.reset();
    }
    Gff3LineParser.prototype.parseLine = function (line, lineNumber) {
        // empty lines are allowed and skipped
        if (line === '')
            return;
        // if line starts with a # it's a meta line – a comment or a directive
        if (line[0] === '#') {
            this.parseMeta(line);
        }
        else {
            // parse line
            var columns = line.split('\t');
            if (columns.length !== 9) {
                this.callbacks.onInvalidFeature(line, "Expected 9 tab-separated columns, got " + columns.length);
            }
            else {
                this.callbacks.onFeature(
                // seqId
                decodeURIComponent(columns[0]), 
                // source
                this.parseOptional(columns[1]) === null ? null : decodeURIComponent(columns[1]), 
                // type
                decodeURIComponent(columns[2]), 
                // start
                this.parseOptional(columns[3]) === null ? null : parseInt(columns[3]), 
                // end
                this.parseOptional(columns[4]) === null ? null : parseInt(columns[4]), 
                // score
                this.parseOptional(columns[5]) === null ? null : parseFloat(columns[5]), 
                // strand
                this.parseStrand(this.parseOptional(columns[6])), 
                // phase
                this.parseOptional(columns[7]) === null ? null : parseInt(columns[7]), 
                // attributes
                this.parseAttributes(this.parseOptional(columns[8])));
            }
        }
    };
    Gff3LineParser.prototype.parseOptional = function (field) {
        return field === '.' ? null : field;
    };
    Gff3LineParser.prototype.parseStrand = function (field) {
        switch (field) {
            case '+': return Strand_1.Strand.Positive;
            case '-': return Strand_1.Strand.Negative;
            case '?': return Strand_1.Strand.Unknown;
            default: return Strand_1.Strand.None;
        }
    };
    Gff3LineParser.prototype.parseAttributes = function (field) {
        var e_1, _a;
        // create empty attributes object
        var attributes = {
            isCircular: false,
            custom: {}
        };
        // field can be null
        if (field == null) {
            return attributes;
        }
        var assignments = field.split(';');
        try {
            for (var assignments_1 = __values(assignments), assignments_1_1 = assignments_1.next(); !assignments_1_1.done; assignments_1_1 = assignments_1.next()) {
                var assignment = assignments_1_1.value;
                if (assignment.trim() == '')
                    continue;
                if (this.gtfCompatMode) {
                    this.parseGff2AttributeAssignment(assignment, attributes);
                }
                else {
                    this.parseGff3AttributeAssignment(assignment, attributes);
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (assignments_1_1 && !assignments_1_1.done && (_a = assignments_1.return)) _a.call(assignments_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return attributes;
    };
    Gff3LineParser.prototype.parseGff3AttributeAssignment = function (assignment, attributes) {
        try {
            var e = assignment.indexOf('=');
            if (e === -1) {
                throw "Assignment must contain a '=' character";
            }
            var tag = decodeURIComponent(assignment.substring(0, e)).trim();
            var values = assignment.substring(e + 1).split(',').map(decodeURIComponent);
            // tags are case sensitive
            switch (tag) {
                case 'ID': {
                    attributes.id = values[0];
                    break;
                }
                case 'Name': {
                    attributes.name = values[0];
                    break;
                }
                case 'Alias': {
                    attributes.aliases = values;
                    break;
                }
                case 'Parent': {
                    attributes.parentIds = values;
                    break;
                }
                case 'Target': {
                    var result = values[0].match(/([^\s]+)\s+(\d+)\s+(\d+)(\s+([+-]))?/);
                    if (result !== null) {
                        attributes.target = {
                            id: result[1],
                            start: parseInt(result[2]),
                            end: parseInt(result[3]),
                            strand: this.parseStrand(result[5]),
                        };
                    }
                    else {
                        throw 'Could not parse target format';
                    }
                    break;
                }
                case 'Gap': {
                    attributes.gap = values[0];
                    break;
                }
                case 'Derives_from': {
                    attributes.derivesFromId = values[0];
                    break;
                }
                case 'Note': {
                    attributes.notes = values;
                    break;
                }
                case 'Dbxref': {
                    attributes.dbxrefs = values;
                    break;
                }
                case 'Ontology_term': {
                    attributes.ontologyTerms = values;
                    break;
                }
                case 'Is_circular': {
                    attributes.isCircular = (values[0].toLowerCase().trim()) === 'true';
                    break;
                }
                default: {
                    attributes.custom[tag] = values;
                    break;
                }
            }
        }
        catch (e) {
            this.callbacks.onInvalidAttribute(assignment, e);
        }
    };
    Gff3LineParser.prototype.parseGff2AttributeAssignment = function (assignment, attributes) {
        try {
            var e = assignment.indexOf(' ');
            if (e === -1) {
                throw "Assignment must contain a space character";
            }
            var tag = decodeURIComponent(assignment.substring(0, e)).trim().toLocaleLowerCase();
            var value = assignment.substring(e + 1);
            // tags are case sensitive
            switch (tag) {
                case 'gene_id': {
                    attributes.id = this.unwrapQuotes(value);
                    break;
                }
                case 'gene_name': {
                    attributes.name = this.unwrapQuotes(value);
                    break;
                }
                default: {
                    attributes.custom[tag] = [this.unwrapQuotes(value)];
                    break;
                }
            }
        }
        catch (e) {
            this.callbacks.onInvalidAttribute(assignment, e);
        }
    };
    // #...
    Gff3LineParser.prototype.parseMeta = function (line) {
        if (line[1] === '#') {
            // if a meta starts with ## then it's a directive
            this.parseDirective(line);
        }
        else {
            this.callbacks.onComment(line.substr(1));
        }
    };
    // ##...
    Gff3LineParser.prototype.parseDirective = function (line) {
        var content = line.substring(2);
        var namePattern = /^([^\s]+)(\s+(.*))?/;
        var result = namePattern.exec(content);
        if (result === null) {
            this.callbacks.onInvalidDirective(content, 'Invalid directive name');
            return;
        }
        var name = result[1].toLowerCase();
        var parameter = result[3];
        try {
            switch (name) {
                case '#': { // ###
                    if (parameter != null)
                        throw 'Feature termination directive must not have any parameter';
                    this.callbacks.onFeatureGroupTermination();
                    break;
                }
                case 'gff-version': {
                    if (parameter == null)
                        throw 'Missing version string';
                    this.callbacks.onVersion(parameter.trim());
                    break;
                }
                case 'sequence-region': {
                    var seqId = null;
                    var start = null;
                    var end = null;
                    var match = (parameter || '').match(/^([^\s]+)(\s+(\d+))?(\s+(\d+))?/);
                    if (match !== null) {
                        seqId = decodeURIComponent(match[1]);
                        start = match[3] === undefined ? null : parseInt(match[3]);
                        end = match[5] === undefined ? null : parseInt(match[5]);
                    }
                    this.callbacks.onSequenceRegion(seqId, start, end);
                    break;
                }
                case 'feature-ontology': {
                    if (parameter == null)
                        throw 'Missing URI';
                    this.callbacks.onFeatureOntology(parameter);
                    break;
                }
                case 'attribute-ontology': {
                    if (parameter == null)
                        throw 'Missing URI';
                    this.callbacks.onAttributeOntology(parameter);
                    break;
                }
                case 'source-ontology': {
                    if (parameter == null)
                        throw 'Missing URI';
                    this.callbacks.onSourceOntology(parameter);
                    break;
                }
                case 'species': {
                    if (parameter == null)
                        throw 'Missing species';
                    this.callbacks.onSpecies(decodeURIComponent(parameter));
                    break;
                }
                case 'genome-build': {
                    if (parameter == null)
                        throw 'Missing source and build name';
                    var parts = (parameter || '').split(/\s+/);
                    this.callbacks.onGenomeBuild(decodeURIComponent(parts[0]), decodeURIComponent(parts[1]));
                    break;
                }
                case 'fasta': {
                    this.fastaMode = true;
                    this.callbacks.onFastaStart();
                    break;
                }
                // Compatibility with GFF2 / GTF directives
                case 'description:': {
                    if (parameter != null)
                        this.callbacks.onComment('Description: ' + parameter);
                    break;
                }
                case 'provider:': {
                    if (parameter != null)
                        this.callbacks.onComment('Provider: ' + parameter);
                    break;
                }
                case 'contact:': {
                    if (parameter != null)
                        this.callbacks.onComment('Contact: ' + parameter);
                    break;
                }
                case 'format:': {
                    if (parameter != null) {
                        var versionString = parameter.trim().toLowerCase();
                        this.callbacks.onVersion(versionString);
                        switch (versionString) {
                            case 'gtf':
                            case 'gff2':
                                this.gtfCompatMode = true;
                                break;
                        }
                    }
                    break;
                }
                case 'date:': {
                    if (parameter != null)
                        this.callbacks.onComment('Date: ' + parameter);
                    break;
                }
                default: {
                    this.callbacks.onUnknownDirective(name, parameter);
                    break;
                }
            }
        }
        catch (reason) {
            this.callbacks.onInvalidDirective(content, reason);
        }
    };
    Gff3LineParser.prototype.unwrapQuotes = function (s) {
        return s.substring(1, s.length - 1);
    };
    return Gff3LineParser;
}());
exports.Gff3LineParser = Gff3LineParser;
exports.default = Gff3LineParser;
//# sourceMappingURL=Gff3LineParser.js.map