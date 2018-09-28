import { Strand } from "./Strand";

export type FeatureAttributes = {
    id?: string,
    name?: string,
    aliases?: Array<string>,
    parentIds?: Array<string>,
    target?: { // Target=EST23 1 21
        id: string,
        start: number,
        end: number,
        strand?: Strand,
    },
    gap?: string,
    derivesFromId?: string,
    notes?: Array<string>,
    dbxrefs?: Array<string>,
    ontologyTerms?: Array<string>,
    isCircular: boolean,
    custom: { [key: string]: Array<string> }
}

export type Feature = {
    sequenceId: string,
    id: string | undefined;
    name: string | undefined;
    type: string;
    children: Array<Feature>;
    start: number;
    end: number;
    strand: Strand;
    phase: number | null;
    attributes: FeatureAttributes;
};

export default Feature;