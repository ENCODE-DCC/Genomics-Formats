import { Feature, FeatureAttributes } from "./Feature";
import Gff3LineParser, { Phase } from './Gff3LineParser';
import { Strand } from "./Strand";

export type Gff3 = {
    version: string,
    
    featureOntologyUri?: Array<string>,
    attributeOntologyUri?: Array<string>,
    sourceOntologyUri?: Array<string>,

    genomeBuild?: {
        source: string,
        buildName: string,
    }

    speciesUri?: string,

    sequences: {
        [seqId: string]: {
            start?: number,
            end?: number,
            features: Set<Feature>
        }
    },

    fasta?: string,
}


export type Callbacks = {
    onFeatureComplete: (feature: Feature) => void,
    onComplete: (gff3: Gff3) => void,
    onError: (reason: string) => void,
    onComment: (comment: string) => void,
}

export class Gff3Parser {

    protected lineParser: Gff3LineParser;
    protected callbacks: Callbacks = {
        onFeatureComplete: () => { },
        onComplete: () => { },
        onError: () => { },
        onComment: () => { },
    }

    constructor(callbacks: Partial<Callbacks>, protected storeFeatures: boolean) {
        this.callbacks = {
            ...this.callbacks,
            ...callbacks,
        }

        this.reset();
    }

    parseChunk = (chunk: string) => {
        this.lineParser.parseChunk(chunk);
    }

    end = () => {
        this.lineParser.end();
        this.reset();
    }

    // parser state
    protected gff3: Gff3;
    protected currentScope: { [id: string]: Feature };
    protected currentScopeTopLevel: Set<Feature>;

    protected reset() {
        // initialize parser state
        this.gff3 = {
            version: '3', // default to 3, may be overridden
            sequences: {},
        }

        this.currentScope = {};
        this.currentScopeTopLevel = new Set();

        this.lineParser = new Gff3LineParser({
            onSequenceRegion: this.setSequenceRange,

            // GFF3 metadata
            onVersion: (v) => this.gff3.version = v,
            onFeatureOntology: (uri) => { let a = this.gff3.featureOntologyUri || []; a.push(uri); },
            onAttributeOntology: (uri) => { let a = this.gff3.attributeOntologyUri || []; a.push(uri); },
            onSourceOntology: (uri) => { let a = this.gff3.sourceOntologyUri || []; a.push(uri); },
            onSpecies: (uri) => this.gff3.speciesUri = uri,
            onGenomeBuild: (source, buildName) => {
                this.gff3.genomeBuild = {
                    source: source,
                    buildName: buildName,
                }
            },
            onComment: this.callbacks.onComment,

            // feature handling
            onFeature: this.defineFeature,
            onFeatureGroupTermination: this.closeCurrentScope,

            // fasta portion
            onFastaStart: () => this.gff3.fasta = '',
            onFastaChunk: (fastaStr: string) => this.gff3.fasta += fastaStr,

            onComplete: this.onLineParserComplete,

            // error handling
            onUnknownDirective: (n, p) => this.callbacks.onError(`Unknown directive "${n} ${p}"`),
            onInvalidAttribute: (a, m) => this.callbacks.onError(`Invalid attribute: "${a}", ${m}`),
            onInvalidDirective: (c, m) => this.callbacks.onError(`Invalid directive: "${c}", ${m}`),
            onInvalidFeature: (f, m) => this.callbacks.onError(`Invalid feature: ${m}`),
        });
    }

    protected defineFeature = (
        seqId: string,
        source: string | null,
        type: string,
        start: number | null,
        end: number | null,
        score: number | null,
        strand: Strand,
        phase: Phase | null,
        attributes: FeatureAttributes,
    ) => {
        if (start == null || end == null) {
            this.callbacks.onError(`Invalid range for ${type} - ${attributes.id}/${attributes.name}; start or end is null (${start} - ${end})`);
            return;
        }

        let feature: Feature = {
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

        // declare into local scope if it has an ID
        if (attributes.id != null) {
            this.currentScope[attributes.id] = feature;
        }

        // add to feature set
        if (attributes.parentIds == null) {
            // define a top-level feature
            if (this.storeFeatures) {
                this.getSequence(seqId).features.add(feature);
            }
            this.currentScopeTopLevel.add(feature);
        } else {
            // attach to a feature in the local scope
            for (let parentId of attributes.parentIds) {
                let parentObject = this.currentScope[parentId];

                if (parentObject == null) {
                    this.callbacks.onError(`Feature "${seqId}" referenced parent "${parentId}" before definition`);
                    continue;
                }

                parentObject.children.push(feature);
            }
        }
    }

    protected closeCurrentScope = () => {
        // all features in the current scope are now complete and can no longer be changed
        for (let feature of this.currentScopeTopLevel) {
            this.callbacks.onFeatureComplete(feature);
        }

        this.currentScope = {};
        this.currentScopeTopLevel = new Set();
    }

    protected onLineParserComplete = () => {
        this.callbacks.onComplete(this.gff3);
    }

    protected getSequence(seqId: string) {
        let sequence = this.gff3.sequences[seqId];
        if (sequence === undefined) {
            sequence = this.gff3.sequences[seqId] = {
                features: new Set(),
            }
        }
        return sequence;
    }

    protected setSequenceRange = (seqId: string, start: number | null, end: number | null) => {
        let sequence = this.getSequence(seqId);

        if (start !== null) {
            sequence.start = start;
        }

        if (end !== null) {
            sequence.end = end;
        }
    }

}

export default Gff3Parser;