export const Utils = require("./utils")

import * as Artifacts from "./artifacts"
import * as Filters from "./filters"
import * as Reducers from "./reducers"
import * as Retrievals from "./retrievals"
import * as Types from "./types"

export { Artifacts, Filters, Reducers, Retrievals, Types }

/**
 * Creates a Radon script capable of processing the returned
 * string value from some remote data source (i.e. Radon Retrieval). 
 * All involved computation will take place on the Witnet Oracle 
 * layer-1 side-chain, not in the EVM context. 
 */
export const Script = () => InnerScript(Types.RadonString);

/**
 * Creates a Radon script that can be passed to certain Radon
 * operators (e.g. `RadonString.filter(..)`, `RadonArray.map(..)`, ...)
 * as to internally process some input value of the specified kind.
 * @param t Radon type of the input data to be processed by the new script.
 */
export function InnerScript<T extends Types.RadonType>(t: { new(): T; }): T { return new t(); }

export function Dictionary<T>(t: { new(): T; }, dict: Object): Object {
    return new Proxy(dict, proxyHandler<T>(t))
}

function proxyHandler<T>(t: { new(): T; }) {
    return {
        get(target: any, prop: string) {
            let found = target[prop] ?? Utils.findKeyInObject(target, prop)
            if (!found) {
                throw EvalError(`\x1b[1;31m['${prop}']\x1b[1;33m was not found in dictionary\x1b[0m`)
            } else if (!(found instanceof t)) {
                throw EvalError(`\x1b[1;31m['${prop}']\x1b[1;33m was found with unexpected type!\x1b[0m`)
            }
            return found
        }
    }
}

export function countLeaves<T>(t: { new(): T; }, obj: any): number {
    if (!obj) {
        return 0;
    } else if (obj instanceof t) {
        return 1;
    }
    else if (Array.isArray(obj)) {
        return obj.map(item => countLeaves(t, item)).reduce((a, b) => a + b, 0)
    } else {
        return Object.values(obj).map(item => countLeaves(t, item)).reduce((a, b) => a + b, 0)
    }
}


/// ===================================================================================================================
/// --- Request and Template factory methods --------------------------------------------------------------------------

export const PriceTickerRequest = (dict: any, tags: Map<string, string | string[] | undefined>) => {
    return RequestFromDictionary({
        retrieve: {
            dict, 
            tags,
        }, 
        aggregate: Reducers.PriceAggregate(), 
        tally: Reducers.PriceTally()
    })
};

export const PriceTickerTemplate = (specs: {
    retrieve: Retrievals.Class[],
    tests?: Map<string, string[][]>,
}) => new Artifacts.Template({ 
        retrieve: specs.retrieve, 
        aggregate: Reducers.PriceAggregate(), 
        tally: Reducers.PriceTally() 
    }, 
    specs?.tests
);
 
export const RequestFromDictionary = (specs: {
    retrieve: {
        dict: any, 
        tags: Map<string, string | string[] | undefined>, 
    },
    aggregate?: Reducers.Class, 
    tally?: Reducers.Class
}) => {
    const retrievals: Retrievals.Class[] = []
    const args: string[][] = []
    Object.keys(specs.retrieve.tags).forEach(key => {    
        const retrieval: Retrievals.Class = specs.retrieve.dict[key]
        const value: any = (specs.retrieve.tags as any)[key]
        if (typeof value === 'string') {
            if (retrieval?.tuples) {
                args.push((retrieval.tuples as any)[value] || [])
            } else {
                throw EvalError(`\x1b[1;33mRequestFromDictionary: No tuple \x1b[1;31m'${value}'\x1b[1;33m was declared for retrieval \x1b[1;37m['${key}']\x1b[0m`)
            }
        } else {
            args.push(value || [])
        }
        retrievals.push(retrieval)
    })
    return new Artifacts.Parameterized(
        new Artifacts.Template({ retrieve: retrievals, aggregate: specs.aggregate, tally: specs.tally }),
        args
    )
};

export const RequestFromTemplate = (template: Artifacts.Template, args: string[] | string[][]) => new Artifacts.Parameterized(template, args);

export const RequestTemplate = (specs: {
        retrieve: Retrievals.Class[], 
        aggregate?: Reducers.Class, 
        tally?: Reducers.Class,
        tests?: Map<string, string[] | string[][]>,   
}) => new Artifacts.Template({
        retrieve: specs.retrieve,
        aggregate: specs?.aggregate,
        tally: specs?.tally
    }, specs.tests
);

export const RequestTemplateSingleSource = (
    retrieval: Retrievals.Class,
    tests?: Map<string, string[] | string[][]>
) => new Artifacts.Template({
        retrieve: [ retrieval ],
        aggregate: Reducers.Mode(),
        tally: Reducers.Mode(Filters.Mode()),
    }, tests
);

export const StaticRequest = (specs: { retrieve: Retrievals.Class[], aggregate?: Reducers.Class, tally?: Reducers.Class }) => new Artifacts.Precompiled(specs)
