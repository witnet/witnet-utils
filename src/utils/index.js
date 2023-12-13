const cbor = require('cbor')
const ethUtils = require("ethereumjs-util")
const { execSync } = require("child_process")
require("dotenv").config()
const fs = require("fs")
const readline = require("readline")
const Witnet = require("../")

module.exports = {
  deployWitnetRequest,
  deployWitnetRequestTemplate,
  dryRunBytecode,
  dryRunBytecodeVerbose,
  extractErc2362CaptionFromKey,
  findKeyInObject,
  findTemplateArtifact,
  fromAscii,
  getChainFromProcessArgv,
  getRealmNetworkFromArgs,
  getRealmNetworkFromString,
  getRequestMethodString,
  getRequestResultDataTypeString,
  getMaxArgsIndexFromString,
  getWitnetArtifactsFromArgs,
  getWitnetRequestArtifactsFromArgs,
  getWitnetRequestTemplateArtifactsFromArgs,
  isHexString,
  isHexStringOfLength,
  isNullAddress,
  isWildcard,
  padLeft,
  parseURL,
  processDryRunJson,
  prompt,
  saveAddresses,
  saveHashes,
  spliceWildcards,
  splitSelectionFromProcessArgv,
  stringifyWitnetRequestMethod,  
  traceHeader,
  traceTx,
  web3BuildWitnetRequestFromTemplate,
  web3DeployWitnetCoreArtifact,
  web3DetermineWitnetProxyAddr,
  web3Encode,
  web3VerifyWitnetRadonReducer,
  web3VerifyWitnetRadonRetrieval,
}

async function deployWitnetRequest(web3, from, registry, factory, request, templateArtifact, key) {
  const templateAddr = await deployWitnetRequestTemplate(web3, from, registry, factory, request)
  if (key) traceHeader(`Building '\x1b[1;37m${key}\x1b[0m'...`)
  console.info("  ", "> Template address: ", templateAddr)
  const args = []
  if (request?.args) {
    console.info("  ", "> Instance parameters:")
    request?.args?.map((subargs, index) => {
      console.info("  ", " ", `Retrieval #${index}: \x1b[1;32m${JSON.stringify(subargs)}\x1b[0m => \x1b[32m${request.specs?.retrieve[index].url} ...\x1b[0m`)
      args[index] = subargs
    })
  } else {
    request.specs.retrieve.map(retrieval => args.push([]))
  }
  return await web3BuildWitnetRequestFromTemplate(web3, from, await templateArtifact.at(templateAddr), args)
}

async function deployWitnetRequestTemplate (web3, from, registry, factory, template, key) {
  const aggregate = await web3VerifyWitnetRadonReducer(from, registry, template.specs.aggregate)
  const tally = await web3VerifyWitnetRadonReducer(from, registry, template.specs.tally)
  const retrievals = []
  const args = []
  for (var j = 0; j < template?.specs.retrieve.length; j ++) {
    retrievals.push(await web3VerifyWitnetRadonRetrieval(from, registry, template.specs.retrieve[j]))
    args.push([])
  }
  if (key) traceHeader(`Building '\x1b[1;37m${key}\x1b[0m'...`)
  let templateAddr = await factory.buildRequestTemplate.call(
    retrievals, aggregate, tally,
    template?.specs?.maxSize || 32,
    { from }
  )
  if (isNullAddress(templateAddr) || (await web3.eth.getCode(templateAddr)).length <= 3) {
    const tx = await factory.buildRequestTemplate(
      retrievals, aggregate, tally,
      template?.specs?.maxSize || 32,
      { from }
    )
    traceTx(tx.receipt)
    tx.logs = tx.logs.filter(log => log.event === "WitnetRequestTemplateBuilt")
    templateAddr = tx.logs[0].args.template
  }
  return templateAddr
}


async function dryRunBytecode (bytecode) {
  return (await execSync(`npx witnet-toolkit try-data-request --hex ${bytecode}`)).toString()
}

async function dryRunBytecodeVerbose (bytecode) {
  return (await execSync(`npx witnet-toolkit try-query --hex ${bytecode}`)).toString()
}

function extractErc2362CaptionFromKey (prefix, key) {
  const decimals = key.match(/\d+$/)
  if (decimals) {
    const camels = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, function (str) { return str.toUpperCase() })
      .split(" ")
    return `${prefix}-${
      camels[camels.length - 2].toUpperCase()
    }/${
      camels[camels.length - 1].replace(/\d$/, "").toUpperCase()
    }-${decimals[0]}`
  } else return null;
} 

function findKeyInObject(dict, tag) {
  for (const key in dict) {
      if (typeof dict[key] === 'object') {
          if (key === tag) {
              return dict[key]
          } else {
              let found = findKeyInObject(dict[key], tag)
              if (found) return found
          }
      }
  }
}

function findTemplateArtifact (templates, artifact) {
  if (typeof templates === "object") {
    for (const key in templates) {
      if (key === artifact) {
        return templates[key]
      }
      if (typeof templates[key] === "object") {
        const template = findTemplateArtifact(templates[key], artifact)
        if (template !== "") return template
      }
    }
  }
  return ""
}

function fromAscii(str) {
  const arr1 = []
  for (let n = 0, l = str.length; n < l; n++) {
    const hex = Number(str.charCodeAt(n)).toString(16)
    arr1.push(hex)
  }
  return "0x" + arr1.join("")
}

function getChainFromProcessArgv() {
  let network = process.env.WITNET_SIDECHAIN
  process.argv.map((argv, index, args) => {
      if (argv === "--chain") {
          network = args[index + 1]
      }
  })
  if (network) {
    network = network.replaceAll(":", ".")
      return getRealmNetworkFromString(network)
  }
}

function getMaxArgsIndexFromString(str) {
  let maxArgsIndex = 0
  if (str) {
    let match
    const regexp = /\\\d\\/g
    while ((match = regexp.exec(str)) !== null) {
      let argsIndex = parseInt(match[0][1]) + 1
      if (argsIndex > maxArgsIndex) maxArgsIndex = argsIndex
    }
  }
  return maxArgsIndex
}

function getRealmNetworkFromArgs() {
  let networkString = process.argv.includes("test") ? "test" : "development"
  // If a `--network` argument is provided, use that instead
  const args = process.argv.join("=").split("=")
  const networkIndex = args.indexOf("--network")
  if (networkIndex >= 0) {
    networkString = args[networkIndex + 1]
  }
  return getRealmNetworkFromString(networkString)
}

function getRealmNetworkFromString(network) {
  network = network ? network.toLowerCase() : "development"

  // Try to extract realm/network info from environment
  const envRealm = process.env.WITNET_EVM_REALM
    ? process.env.WITNET_EVM_REALM.toLowerCase()
    : null

  let realm
  if (network.split(".")[1]) {
    realm = network.split(".")[0]
    if (realm === "ethereum") {
      // Realm in "ethereum.*" networks must be set to "default"
      realm = "default"
    }
    if (envRealm && realm !== envRealm) {
      // Check that WITNET_EVM_REALM, if defined, and network's realm actually match
      console.error(
        `\n> Fatal: network "${network}" and WITNET_EVM_REALM value`,
        `("${envRealm.toUpperCase()}") don't match.\n`
      )
      process.exit(1)
    }
  } else {
    realm = envRealm || "default"
    network = `${realm === "default" ? "ethereum" : realm}.${network}`
  }
  if (realm === "default") {
    const subnetwork = network.split(".")[1]
    if (subnetwork === "development" || subnetwork === "test") {
      // In "default" realm, networks "development" and "test" must be returned without a prefix.
      network = subnetwork
    }
  }
  return [realm, network]
}

function getWitnetArtifactsFromArgs() {
  let selection = []
  process.argv.map((argv, index, args) => {
    if (argv === "--artifacts") {
      selection = args[index + 1].split(",")
    }
    return argv
  })
  return selection
}

function getWitnetRequestArtifactsFromArgs() {
  let selection = []
  process.argv.map((argv, index, args) => {
    if (argv === "--requests") {
      selection = args[index + 1].split(",")
    }
    return argv
  })
  return selection
}

function getWitnetRequestTemplateArtifactsFromArgs() {
  let selection = []
  process.argv.map((argv, index, args) => {
    if (argv === "--templates") {
      selection = args[index + 1].split(",")
    }
    return argv
  })
  return selection
}

function getRequestMethodString(method) {
  if (method == 0) {
    return "UNKNOWN"
  } else if (method == 1 || !method) {
    return "HTTP-GET"
  } else if (method == 2) {
    return "RNG"
  } else if (method == 3) {
    return "HTTP-POST"
  } else if (method == 4) {
    return "HTTP-HEAD"
  } else {
    return method.toString()
  }
}

function getRequestResultDataTypeString(type) {
  if (type == 1) {
    return "Array"
  } else if (type == 2) {
    return "Bool"
  } else if (type == 3) {
    return "Bytes"
  } else if (type == 4) {
    return "Integer"
  } else if (type == 5) {
    return "Float"
  } else if (type == 6) {
    return "Map"
  } else if (type == 7) {
    return "String"
  } else {
    return "(Undetermined)"
  }
}

function isHexString(str) {
  return (
    !Number.isInteger(str)
      && str.startsWith("0x")
      && /^[a-fA-F0-9]+$/i.test(str.slice(2))
  );
}

function isHexStringOfLength(str, max) {
  return (isHexString(str)
    && str.slice(2).length <= max * 2
  );
}

function isNullAddress(addr) {
  return !addr ||
    addr === "" ||
    addr === "0x0000000000000000000000000000000000000000"
}

function isWildcard(str) {
  return str.length == 3 && /\\\d\\/g.test(str)  
}

function mapObjectRecursively(obj, callback) {
  let newObj = {};
  for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === "object") {
              newObj[key] = mapObjectRecursively(obj[key], callback);
          } else {
              newObj[key] = callback(key, obj[key]);
          }
      }
  }
  return newObj;
}

function padLeft(str, char, size) {
  if (str.length < size) {
    return char.repeat((size - str.length) / char.length) + str
  } else {
    return str
  }
}

function parseURL(url) {
  if (url && typeof url === 'string' && url.indexOf("://") > -1) {
    const hostIndex = url.indexOf("://") + 3
    const schema = url.slice(0, hostIndex)
    let host = url.slice(hostIndex)
    let path = ""
    let query = ""
    const pathIndex = host.indexOf("/")
    if (pathIndex > -1) {
      path = host.slice(pathIndex + 1)
      host = host.slice(0, pathIndex)
      const queryIndex = path.indexOf("?")
      if (queryIndex > -1) {
        query = path.slice(queryIndex + 1)
        path = path.slice(0, queryIndex)
      }
    }
    return [ schema, host, path, query ];
  } else {
    throw new EvalError(`Invalid URL was provided: ${url}`)
  }
}

function processDryRunJson(dryrun) {
  let error = ""
  let msecs = []
  dryrun?.retrieve.map(retrieve => {
    msecs.push(retrieve?.running_time?.secs * 1000 + retrieve?.running_time?.nanos / 1000000)
  })
  const itWorks = !("RadonError" in dryrun?.aggregate?.result)
  if (!itWorks) {
    error = `Aggregation failed: ${unescape(dryrun?.aggregate?.result?.RadonError)}`
  }
  const nokRetrievals = Object.values(
    dryrun?.retrieve.filter((retrieval, index) => {
      const nok = "RadonError" in retrieval.result
      if (nok && !error) {
        error = `Retrieval #${index + 1}: ${unescape(retrieval.result?.RadonError)}`
      }
      return nok
    })
  ).length;
  const totalRetrievals = Object.values(dryrun?.retrieve).length
  const status = itWorks ? (nokRetrievals > 0 ? "WARN": "OK") : "FAIL"
  return {
    error,
    itWorks: itWorks,
    nokRetrievals,
    totalRetrievals,
    runningTime: Math.round(msecs.reduce((a, b) => a > b ? a : b)) / 1000,
    status,
    tally: dryrun?.tally.result
  }
}

async function prompt(text) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  let answer
  await new Promise((resolve) => {
    rl.question(
      text,
      function (input) {
        answer = input
        rl.close()
      })
    rl.on("close", function () {
      resolve()
    })
  })
  return answer
}

function saveAddresses(addrs, path) {
  fs.writeFileSync(
    `${path || './migrations/witnet'}/addresses.json`,
    JSON.stringify(addrs, null, 4),
    { flag: 'w+' }
  )
}

function saveHashes(hashes, path) {
  fs.writeFileSync(
    `${path || './migrations/witnet'}/hashes.json`,
    JSON.stringify(hashes, null, 4),
    { flag: 'w+' }
  )
}

function spliceWildcards(obj, argIndex, argValue, argsCount) {
  if (obj && typeof obj === "string") {
    const wildcard = `\\${argIndex}\\`
    obj = obj.replaceAll(wildcard, argValue)
    for (var j = argIndex + 1; j < argsCount; j ++) {
        obj = obj.replaceAll(`\\${j}\\`, `\\${j - 1}\\`)
    }
  } else if (obj && Array.isArray(obj)) {
    obj = obj.map(value => typeof value === "string" || Array.isArray(value) 
      ? spliceWildcards(value, argIndex, argValue, argsCount)
      : value
    )
  }
  return obj;
}

function splitSelectionFromProcessArgv(operand) {
  let selection = []
  if (process.argv.includes(operand)) {
      process.argv.map((argv, index, args) => {
          if (argv === operand) {
              if (index < process.argv.length - 1 && !args[index + 1].startsWith("--")) {
                  selection = args[index + 1].replaceAll(":", ".").split(",")
              }
          }
      })
  }
  return selection
}

function stringifyWitnetRequestMethod(method) {
  switch (method) {
    case Witnet.Retrievals.Methods.HttpGet: return "HTTP-GET";
    case Witnet.Retrievals.Methods.HttpHead: return "HTTP-HEAD";
    case Witnet.Retrievals.Methods.HttpPost: return "HTTP-POST";
    case Witnet.Retrievals.Methods.RNG: return "WITNET-RNG";
    default: return "UNKNOWN"
  }
}

function traceHeader(header) {
  console.log("")
  console.log("  ", header)
  console.log("  ", `${"-".repeat(header.length)}`)
}

function traceTx (receipt) {
  console.log("  ", "> Transaction block:", receipt.blockNumber)
  console.log("  ", "> Transaction hash: ", receipt.transactionHash)
  console.log("  ", "> Transaction gas:  ", receipt.gasUsed)
}

async function web3BuildWitnetRequestFromTemplate(web3, from, templateContract, args) {
  // convert all args values to string
  args = args.map(subargs => subargs.map(v => v.toString()))
  let requestAddr = await templateContract.buildRequest.call(args, { from })
  if ((await web3.eth.getCode(requestAddr)).length <= 3) {
    const tx = await templateContract.buildRequest(args, { from })
    console.info("  ", "> Template settlement hash:", tx.receipt.transactionHash)
    console.info("  ", "> Template settlement gas: ", tx.receipt.gasUsed)
  }
  return requestAddr
}

async function web3DeployWitnetCoreArtifact(web3, artifacts, specs) {
    const { from, key, libs, intrinsics, immutables, targets, verbose } = specs;
    const contract = artifacts.require(key)
    const deployer = await artifacts.require("WitnetDeployer").deployed()
    if (verbose) traceHeader(`Deploying '${key}'...`)
    if (verbose) console.info("  ", "> account:          ", from)
    if (verbose) console.info("  ", "> balance:          ", web3.utils.fromWei(await web3.eth.getBalance(from), 'ether'), "ETH")
    let { types, values } = intrinsics
    if (immutables?.types) types = [ ...types, ...immutables.types ]
    if (immutables?.values) values = [ ...values, ...immutables.values ]
    const constructorArgs = web3.eth.abi.encodeParameters(types, values)
    if (constructorArgs.length > 2) {
      if (verbose) console.info("  ", "> constructor types:", types)
      if (verbose) console.info("  ", "> constructor args: ", constructorArgs.slice(2))
    }
    const coreBytecode = _linkBytecodeToLibs(artifacts, contract.toJSON().bytecode, libs, targets)
    if (coreBytecode.indexOf("__") > -1) {
        if (verbose) console.info(coreBytecode)
        if (verbose) console.info("Error: Cannot deploy due to some missing libs")
        process.exit(1)
    }
    const coreInitCode = coreBytecode + constructorArgs.slice(2)
    const coreAddr = await deployer.determineAddr.call(coreInitCode, "0x0", { from })
    const tx = await deployer.deploy(coreInitCode, "0x0", { from })
    if (verbose) traceTx(tx)
    if ((await web3.eth.getCode(coreAddr)).length <= 3) {
        console.info(`Error: Contract was not deployed on expected address: ${coreAddr}`)
        process.exit(1)
    }
    contract.address = coreAddr
    if (verbose) console.info("  ", "> contract address: ", contract.address)
    if (verbose) console.info("  ", "> contract codehash:", web3.utils.soliditySha3(await web3.eth.getCode(contract.address)))
    if (verbose) console.info()
    return contract
}

function _linkBytecodeToLibs(artifacts, bytecode, libs, targets, verbose) {
    if (libs && Array.isArray(libs) && libs.length > 0) {
        for (var ix in libs) {
            const key = targets[libs[ix]]
            const lib = artifacts.require(key)
            bytecode = bytecode.replaceAll(`__${key}${"_".repeat(38-key.length)}`, lib.address.slice(2))
            if (verbose) console.info("  ", `> linked library:    ${key} => ${lib.address}`)
        }
    }
    return bytecode
}

async function web3DetermineWitnetProxyAddr(deployer, from, nonce) {
    const salt = nonce ? "0x" + ethUtils.setLengthLeft(ethUtils.toBuffer(nonce), 32).toString("hex") : "0x0"
    return await deployer.determineProxyAddr.call(salt, { from })
}

function web3Encode(T) {
  if (T instanceof Witnet.Reducers.Class) {
      return [
          T.opcode,
          T.filters?.map(filter => web3Encode(filter)) || [],
      ];
  } else if (T instanceof Witnet.Filters.Class) {
      return [
          T.opcode,
          `0x${T.args ? cbor.encode(T.args).toString("hex"): ""}`
      ];
  } else if (T instanceof Witnet.Retrievals.Class) {
      return [
          T.method,
          T.url || "",
          T.body || "",
          T.headers || "",
          web3Encode(T.script) || "0x80"
      ];
  } else if (T instanceof Witnet.Types.RadonType) {
      return cbor.encode(T._encodeArray())
  }
  return T;
}

async function web3VerifyWitnetRadonReducer(from, registry, reducer) {
  let hash
  if (reducer instanceof Witnet.Reducers.Class) {
    hash = await registry.verifyRadonReducer.call(web3Encode(reducer), { from })
    try {
      await registry.lookupRadonReducer.call(hash, { from })
    } catch {
      // register new reducer, otherwise:
      traceHeader(`Verifying Radon Reducer ...`)
      console.info(`   > Hash:        \x1b[35m${hash}\x1b[0m`)
      console.info(`   > Reducer:     \x1b[1;35m${reducer.toString()}\x1b[0m`)
      const tx = await registry.verifyRadonReducer(web3Encode(reducer), { from })
      traceTx(tx.receipt)
    }
  } else {
    throw `Witnet Radon Reducer: invalid type: '\x1b[1;31m${reducer}\x1b[0m'`
  }
  return hash
}

async function web3VerifyWitnetRadonRetrieval(from, registry, retrieval) {
  // get actual hash for this data source
  var hash
  if (retrieval) {
    try {
      hash = await registry.methods['verifyRadonRetrieval(uint8,string,string,string[2][],bytes)'].call(...web3Encode(retrieval), { from })
    } catch (e) {
      throw `Cannot check if Witnet Radon Retrieval is already verified: ${e}`
    }
    // checks whether hash is already registered
    try {
      await registry.lookupRadonRetrieval.call(hash, { from })
    } catch {
      // register new retrieval, otherwise:
      traceHeader(`Verifying Radon Retrieval ...`)
      console.info(`   > Hash:       \x1b[32m${hash}\x1b[0m`)
      if (retrieval?.url) {
        console.info(`   > URL:        \x1b[1;32m${retrieval.url}\x1b[0m`)
      } 
      console.info(`   > Method:     \x1b[1;32m${getRequestMethodString(retrieval?.method)}\x1b[0m`)
      if (retrieval?.body) {
        console.info(`   > Body:       \x1b[1;32m${retrieval.body}\x1b[0m`)
      }
      if (retrieval?.headers && retrieval?.headers[0] && retrieval?.headers[0][0] !== "") {
        console.info(`   > Headers:    \x1b[1;32m${retrieval.headers}\x1b[0m`)
      }
      if (retrieval?.script) {
        console.info(`   > Script:     \x1b[1;33m${retrieval.script.toString()}\x1b[0m`)
      }
      if (retrieval?.argsCount) {
        console.info(`   > Total args: \x1b[1;33m${retrieval.argsCount}\x1b[0m`)
      }
      const tx = await registry.methods['verifyRadonRetrieval(uint8,string,string,string[2][],bytes)'].sendTransaction(...web3Encode(retrieval), { from })
      traceTx(tx.receipt)
    }
  } else {
    throw `Witnet Radon Retrieval: invalid type: '\x1b[1;31m${retrieval}\x1b[0m'`
  }
  return hash
}
