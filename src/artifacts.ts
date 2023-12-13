import { Class as Retrieval } from "./retrievals"
import { Class as Reducer, Mode } from "./reducers"

export type Args = string[] | string[][];

export interface Specs {
    retrieve: Retrieval[];
    aggregate: Reducer;
    tally: Reducer;
    maxSize?: number;
}

export class Class {
    public specs: Specs
    constructor(specs: Specs) {
        if (!specs.retrieve || !Array.isArray(specs.retrieve) || specs.retrieve.length == 0) {
            throw EvalError("\x1b[1;33mArtifact: cannot build if no retrievals are specified\x1b[0m")
        }
        specs.retrieve?.forEach((retrieval, index) => {
            if (retrieval === undefined) {
                throw EvalError(`\x1b[1;31mArtifact: Retrieval #${index}\x1b[1;33m: undefined\x1b[0m`)
            } else if (!(retrieval instanceof Retrieval)) {
                throw EvalError(`\x1b[1;31mArtifact: Retrieval #${index}\x1b[1;33m: invalid type\x1b[0m`)
            }
        })
        this.specs = specs
        this.specs.maxSize = specs?.maxSize || 0
    }
}

export class Template extends Class {
    public argsCount: number;
    public tests?: Map<string, Args>;
    constructor(specs: { 
            retrieve: Retrieval | Retrieval[], 
            aggregate?: Reducer, 
            tally?: Reducer,
            maxSize?: number,
        },
        tests?: Map<string, Args>
    ) {
        const retrieve = Array.isArray(specs.retrieve) ? specs.retrieve as Retrieval[] : [ specs.retrieve ]
        super({
            retrieve,
            aggregate: specs?.aggregate || Mode(),
            tally: specs?.tally || Mode(),
            maxSize: specs?.maxSize || 32,
        })
        this.argsCount = retrieve.map(retrieval => retrieval?.argsCount).reduce((prev, curr) => Math.max(prev, curr), 0)
        if (this.argsCount == 0) {
            throw EvalError("\x1b[1;33mTemplate: cannot build w/ unparameterized retrievals\x1b[0m")
        }
        if (tests) {
            Object.keys(tests).forEach(test => {
                let testArgs: Args = Object(tests)[test]
                if (typeof testArgs === "string") {
                    testArgs =  [ testArgs ] 
                }
                if (testArgs.length > 0) {
                    if (!Array.isArray(testArgs[0])) {
                        Object(tests)[test] = Array(retrieve.length).fill(testArgs)
                        testArgs = Object(tests)[test]
                    } else if (testArgs?.length != retrieve.length) {
                        throw EvalError(`\x1b[1;33mTemplate: arguments mismatch in test \x1b[1;31m'${test}'\x1b[1;33m: ${testArgs?.length} tuples given vs. ${retrieve.length} expected\x1b[0m`)
                    }
                    testArgs?.forEach((subargs, index)=> {
                        if (subargs.length < retrieve[index].argsCount) {
                            throw EvalError(`\x1b[1;33mTemplate: arguments mismatch in test \x1b[1;31m'${test}'\x1b[1;33m: \x1b[1;37mRetrieval #${index}\x1b[1;33m: ${subargs?.length} parameters given vs. ${retrieve[index].argsCount} expected\x1b[0m`)
                        }
                    })
                }
            })
            this.tests = tests
        }
    }
}

export class Parameterized extends Class {
    public args: string[][]
    constructor(template: Template, args: Args) {
        super(template.specs)
        if (!args || !Array.isArray(args) || args.length == 0) {
            throw EvalError(`\x1b[1;31mParameterized: no valid args were provided.\x1b[0m`);
        } else if (!Array.isArray(args[0])) {
            this.args = Array(this.specs.retrieve.length).fill(args);
        } else {
            this.args = args as string[][];
        }
        this.specs.retrieve.map((retrieve, index) => {
            if (args[index].length !== retrieve.argsCount) {
                throw EvalError(`\x1b[1;31mParameterized: Retrieval #${index}\x1b[1;33m: parameters mismatch: ${args[index].length} given vs. ${retrieve.argsCount} required\x1b[0m`)
            }
        })
    }
}

export class Precompiled extends Class {
    constructor(specs: { 
        retrieve: Retrieval | Retrieval[], 
        aggregate?: Reducer, 
        tally?: Reducer,
        maxSize?: number,
    }) {
        const retrieve = Array.isArray(specs.retrieve) ? specs.retrieve as Retrieval[] : [ specs.retrieve ]
        super({
            retrieve,
            aggregate: specs?.aggregate || Mode(),
            tally: specs?.tally || Mode(),
            maxSize: specs?.maxSize || 32,
        })
        let argsCount = retrieve.map(retrieval => retrieval.argsCount).reduce((prev, curr) => prev + curr)
        if (argsCount > 0) {
            throw EvalError("\x1b[1;33mPrecompiled: static requests cannot be built w/ parameterized retrievals\x1b[0m")
        }
    }
}
