"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gff3Parser = void 0;
var Gff3LineParser_1 = require("./Gff3LineParser");
var Gff3Parser = /** @class */ (function () {
    function Gff3Parser(callbacks, storeFeatures) {
        var _this = this;
        this.storeFeatures = storeFeatures;
        this.callbacks = {
            onFeatureComplete: function () { },
            onComplete: function () { },
            onError: function () { },
            onComment: function () { },
        };
        this.parseChunk = function (chunk) {
            _this.lineParser.parseChunk(chunk);
        };
        this.end = function () {
            _this.lineParser.end();
            _this.reset();
        };
        this.defineFeature = function (seqId, source, type, start, end, score, strand, phase, attributes) {
            var e_1, _a;
            if (start == null || end == null) {
                _this.callbacks.onError("Invalid range for " + type + " - " + attributes.id + "/" + attributes.name + "; start or end is null (" + start + " - " + end + ")");
                return;
            }
            var feature = {
                sequenceId: seqId,
                id: attributes.id,
                name: attributes.name,
                type: type,
                start: start,
                end: end,
                strand: strand,
                children: new Array(),
                phase: phase,
                attributes: attributes
            };
            // add to feature set
            if (attributes.parentIds == null) {
                // define a top-level feature
                if (_this.storeFeatures) {
                    _this.getSequence(seqId).features.add(feature);
                }
                // assume this new top-level feature means we're finished with the previous top-level feature
                _this.closeCurrentScope();
                _this.currentScopeTopLevel.add(feature);
            }
            else {
                try {
                    // attach to a feature in the local scope
                    for (var _b = __values(attributes.parentIds), _c = _b.next(); !_c.done; _c = _b.next()) {
                        var parentId = _c.value;
                        var parentObject = _this.currentScope[parentId];
                        if (parentObject == null) {
                            _this.callbacks.onError("Feature \"" + seqId + "\" referenced parent \"" + parentId + "\" before definition");
                            continue;
                        }
                        parentObject.children.push(feature);
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
            // declare into local scope if it has an ID
            if (attributes.id != null) {
                _this.currentScope[attributes.id] = feature;
            }
        };
        this.closeCurrentScope = function () {
            var e_2, _a;
            try {
                // all features in the current scope are now complete and can no longer be changed
                for (var _b = __values(_this.currentScopeTopLevel), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var feature = _c.value;
                    _this.callbacks.onFeatureComplete(feature);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_2) throw e_2.error; }
            }
            _this.currentScope = {};
            _this.currentScopeTopLevel = new Set();
        };
        this.onLineParserComplete = function () {
            _this.callbacks.onComplete(_this.gff3);
        };
        this.setSequenceRange = function (seqId, start, end) {
            var sequence = _this.getSequence(seqId);
            if (start !== null) {
                sequence.start = start;
            }
            if (end !== null) {
                sequence.end = end;
            }
        };
        this.callbacks = __assign(__assign({}, this.callbacks), callbacks);
        this.reset();
    }
    Gff3Parser.prototype.reset = function () {
        var _this = this;
        // initialize parser state
        this.gff3 = {
            version: '3',
            sequences: {},
        };
        this.currentScope = {};
        this.currentScopeTopLevel = new Set();
        this.lineParser = new Gff3LineParser_1.default({
            onSequenceRegion: this.setSequenceRange,
            // GFF3 metadata
            onVersion: function (v) { return _this.gff3.version = v; },
            onFeatureOntology: function (uri) { var a = _this.gff3.featureOntologyUri || []; a.push(uri); },
            onAttributeOntology: function (uri) { var a = _this.gff3.attributeOntologyUri || []; a.push(uri); },
            onSourceOntology: function (uri) { var a = _this.gff3.sourceOntologyUri || []; a.push(uri); },
            onSpecies: function (uri) { return _this.gff3.speciesUri = uri; },
            onGenomeBuild: function (source, buildName) {
                _this.gff3.genomeBuild = {
                    source: source,
                    buildName: buildName,
                };
            },
            onComment: this.callbacks.onComment,
            // feature handling
            onFeature: this.defineFeature,
            onFeatureGroupTermination: this.closeCurrentScope,
            // fasta portion
            onFastaStart: function () { return _this.gff3.fasta = ''; },
            onFastaChunk: function (fastaStr) { return _this.gff3.fasta += fastaStr; },
            onComplete: function () {
                _this.closeCurrentScope();
                _this.onLineParserComplete();
            },
            // error handling
            onUnknownDirective: function (n, p, lineNo) { return _this.callbacks.onError("Unknown directive \"" + n + " " + p + "\" (line " + lineNo + ")"); },
            onInvalidAttribute: function (a, m, lineNo) { return _this.callbacks.onError("Invalid attribute: \"" + a + "\", " + m + " (line " + lineNo + ")"); },
            onInvalidDirective: function (c, m, lineNo) { return _this.callbacks.onError("Invalid directive: \"" + c + "\", " + m + " (line " + lineNo + ")"); },
            onInvalidFeature: function (f, m, lineNo) { return _this.callbacks.onError("Invalid feature: " + m + " (line " + lineNo + ")"); },
        });
    };
    Gff3Parser.prototype.getSequence = function (seqId) {
        var sequence = this.gff3.sequences[seqId];
        if (sequence === undefined) {
            sequence = this.gff3.sequences[seqId] = {
                features: new Set(),
            };
        }
        return sequence;
    };
    return Gff3Parser;
}());
exports.Gff3Parser = Gff3Parser;
exports.default = Gff3Parser;
//# sourceMappingURL=Gff3Parser.js.map