import { Strand } from "./Strand";
import { FeatureAttributes } from "./Feature";

/**
 * # GFF3 File format
 * https://github.com/The-Sequence-Ontology/Specifications/blob/master/gff3.md
 */

export type LineCallbacks = {
    // directives
    onVersion: (versionString: string) => void,
    onSequenceRegion: (seqId: string | null, start: number | null, end: number | null) => void,
    onFeatureOntology: (uri: string) => void,
    onAttributeOntology: (uri: string) => void,
    onSourceOntology: (uri: string) => void,
    onSpecies: (ncbiTaxonomyUri: string) => void,
    onGenomeBuild: (source: string, buildName: string) => void,
    onFeatureGroupTermination: () => void, // ###
    onFastaStart: () => void,
    onComment: (comment: string) => void,

    onFeature: (
        seqId: string,
        source: string | null,
        type: string,
        start: number | null,
        end: number | null,
        score: number | null,
        strand: Strand,
        phase: Phase | null,
        attributes: FeatureAttributes,
    ) => void,

    // error handling
    onInvalidFeature: (line: string, reason: string) => void,
    onInvalidAttribute: (assignment: string, reason: string) => void,
    onUnknownDirective: (name: string, parameter: string | null) => void,
    onInvalidDirective: (content: string, reason: string) => void,

    // once the ##FASTA directive has been encountered the rest of the file is FASTA content
    onFastaChunk: (string: string) => void,

    onComplete: () => void
}

export type Phase = number;

export class Gff3LineParser {

    protected callbacks: LineCallbacks = {
        onVersion: (versionString: string) => {},
        onSequenceRegion: (seqId: string, start: number, end: number) => {},
        onFeatureOntology: (uri: string) => {},
        onAttributeOntology: (uri: string) => {},
        onSourceOntology: (uri: string) => {},
        onSpecies: (ncbiTaxonomyUri: string) => {},
        onGenomeBuild: (source: string, buildName: string) => {},
        onFeatureGroupTermination: () => {}, // ###
        onFastaStart: () => {},

        onComment: (comment: string) => {},

        onFeature: (
            seqId: string,
            source: string | null,
            type: string,
            start: number | null,
            end: number | null,
            score: number | null,
            strand: Strand,
            phase: Phase | null,
            attributes: FeatureAttributes,
        ) => {},

        // error handling
        onUnknownDirective: (name: string, parameter: string | null) => {},
        onInvalidDirective: (content: string, reason: string) => {},
        onInvalidFeature: (line: string, reason: string) => {},
        onInvalidAttribute: (assignment: string, reason: string) => {},

        onFastaChunk: (string: string) => {},

        onComplete: () => {}
    };

    // parse state
    protected lineNumber = 0;
    protected fastaMode: boolean;
    protected incompleteLineBuffer: string;

    constructor(callbacks: Partial<LineCallbacks>) {
        this.callbacks = {
            ...this.callbacks,
            ...callbacks
        }

        this.reset();
    }

    parseChunk = (string: string) => {
        if (this.fastaMode) {
            this.callbacks.onFastaChunk(string);
            return;
        }

        let lineStart = 0;

        for (let i = 0; i < string.length; i++) {
            let char = string.charAt(i);

            if (char === '\n') {
                this.parseLine(this.incompleteLineBuffer + string.substring(lineStart, i), this.lineNumber++);
                lineStart = i + 1;
                this.incompleteLineBuffer = '';
            }
        }

        this.incompleteLineBuffer = string.substring(lineStart);
    }

    end = () => {
        this.parseLine(this.incompleteLineBuffer, this.lineNumber++);
        this.callbacks.onComplete();
    }

    reset = () => {
        this.lineNumber = 0;
        this.incompleteLineBuffer = '';
        this.fastaMode = false;
    }
    
    protected parseLine(line: string, lineNumber: number) {
        // empty lines are allowed and skipped
        if (line === '') return;

        // if line starts with a # it's a meta line – a comment or a directive
        if (line[0] === '#') {
            this.parseMeta(line);
        } else {
            // parse line
            let columns = line.split('\t');

            if (columns.length !== 9) {
                this.callbacks.onInvalidFeature(line, `Expected 9 tab-separated columns, got ${columns.length}`);
            } else {
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
                    this.parseAttributes(this.parseOptional(columns[8]))
                );
            }
        }
    }

    protected parseOptional(field: string): string | null {
        return field === '.' ? null : field;
    }

    protected parseStrand(field: string | null): Strand {
        switch (field) {
            case '+': return Strand.Positive;
            case '-': return Strand.Negative;
            case '?': return Strand.Unknown;
            default: return Strand.None;
        }
    }

    protected parseAttributes(field: string | null): FeatureAttributes {
        // create empty attributes object
        let attributes: FeatureAttributes = {
            isCircular: false,
            custom: {}
        };

        // field can be null
        if (field == null) {
            return attributes;
        }

        let assignments = field.split(';');

        for (let assignment of assignments) {
            try {
                let e = assignment.indexOf('=');
                if (e === -1) {
                    throw `Assignment must contain a '=' character`;
                }

                let tag = decodeURIComponent(assignment.substring(0, e)).trim();
                let values = assignment.substring(e + 1).split(',').map(decodeURIComponent);

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
                        let result = values[0].match(/([^\s]+)\s+(\d+)\s+(\d+)(\s+([+-]))?/);
                        if (result !== null) {
                            attributes.target = {
                                id: result[1],
                                start: parseInt(result[2]),
                                end: parseInt(result[3]),
                                strand: this.parseStrand(result[5]),
                            };
                        } else {
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
            } catch (e) {
                this.callbacks.onInvalidAttribute(assignment, e);
            }
        }

        return attributes;
    }

    // #...
    protected parseMeta(line: string) {
        if (line[1] === '#') {
            // if a meta starts with ## then it's a directive
            this.parseDirective(line);
        } else {
            this.callbacks.onComment(line.substr(1));
        }
    }

    // ##...
    protected parseDirective(line: string) {
        let content = line.substring(2);
        let namePattern = /^([^\s]+)(\s+(.*))?/;

        let result = namePattern.exec(content);
        if (result === null) {
            this.callbacks.onInvalidDirective(content, 'Invalid directive name');
            return;
        }

        let name: string = result[1].toLowerCase();
        let parameter: string | null = result[3];

        try {
            switch (name) {
                case '#': {
                    if (parameter != null) throw 'Feature termination directive must not have any parameter';
                    this.callbacks.onFeatureGroupTermination();
                    break;
                }
                case 'gff-version': {
                    if (parameter == null) throw 'Missing version string';
                    this.callbacks.onVersion(parameter.trim());
                    break;
                }
                case 'sequence-region': {
                    let seqId: string | null = null;
                    let start: number | null = null;
                    let end: number | null = null;

                    let match = (parameter || '').match(/^([^\s]+)(\s+(\d+))?(\s+(\d+))?/);
                    if (match !== null) {
                        seqId = decodeURIComponent(match[1]);
                        start = match[3] === undefined ? null : parseInt(match[3]);
                        end = match[5] === undefined ? null : parseInt(match[5]);
                    }

                    this.callbacks.onSequenceRegion(seqId, start, end);
                    break;
                }
                case 'feature-ontology': {
                    if (parameter == null) throw 'Missing URI';
                    this.callbacks.onFeatureOntology(parameter);
                    break;
                }
                case 'attribute-ontology': {
                    if (parameter == null) throw 'Missing URI';
                    this.callbacks.onAttributeOntology(parameter);
                    break;
                }
                case 'source-ontology': {
                    if (parameter == null) throw 'Missing URI';
                    this.callbacks.onSourceOntology(parameter);
                    break;
                }
                case 'species': {
                    if (parameter == null) throw 'Missing species';
                    this.callbacks.onSpecies(decodeURIComponent(parameter));
                    break;
                }
                case 'genome-build': {
                    if (parameter == null) throw 'Missing source and build name';
                    let parts = (parameter || '').split(/\s+/);
                    this.callbacks.onGenomeBuild(decodeURIComponent(parts[0]), decodeURIComponent(parts[1]));
                    break;
                }
                case '#': { // ###
                    this.callbacks.onFeatureGroupTermination();
                    break;
                }
                case 'fasta': {
                    this.fastaMode = true;
                    this.callbacks.onFastaStart();
                    break;
                }
                default: {
                    this.callbacks.onUnknownDirective(name, parameter);
                    break;
                }
            }
        } catch (reason) {
            this.callbacks.onInvalidDirective(content, reason);
        }

    }

}

export default Gff3LineParser;