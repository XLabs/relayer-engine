import * as wormholeSdk from "@certusone/wormhole-sdk";
import {
  ChainId,
  EVMChainId,
  isChain,
  isEVMChain,
  parseVaa,
  SignedVaa,
} from "@certusone/wormhole-sdk";
import { bech32 } from "bech32";
import { deriveWormholeEmitterKey } from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole/index.js";
import { zeroPad } from "ethers/lib/utils.js";
import { ParsedVaaWithBytes } from "./application.js";
import { ethers } from "ethers";
import { inspect } from "util";

export type MakeOptional<T1, T2> = Omit<T1, keyof T2> &
  Partial<Omit<T1, keyof Omit<T1, keyof T2>>> &
  Partial<Omit<T2, keyof T1>>;

export function encodeEmitterAddress(
  chainId: wormholeSdk.ChainId,
  emitterAddressStr: string,
): string {
  if (
    chainId === wormholeSdk.CHAIN_ID_SOLANA ||
    chainId === wormholeSdk.CHAIN_ID_PYTHNET
  ) {
    return deriveWormholeEmitterKey(emitterAddressStr)
      .toBuffer()
      .toString("hex");
  }
  if (wormholeSdk.isCosmWasmChain(chainId)) {
    return Buffer.from(
      zeroPad(bech32.fromWords(bech32.decode(emitterAddressStr).words), 32),
    ).toString("hex");
  }
  if (wormholeSdk.isEVMChain(chainId)) {
    return wormholeSdk.getEmitterAddressEth(emitterAddressStr);
  }
  if (wormholeSdk.CHAIN_ID_ALGORAND === chainId) {
    return wormholeSdk.getEmitterAddressAlgorand(BigInt(emitterAddressStr));
  }
  if (wormholeSdk.CHAIN_ID_NEAR === chainId) {
    return wormholeSdk.getEmitterAddressNear(emitterAddressStr);
  }
  if (wormholeSdk.CHAIN_ID_SUI === chainId) {
    return strip0x(emitterAddressStr);
  }

  throw new Error(`Unrecognized wormhole chainId ${chainId}`);
}

export const strip0x = (str: string) =>
  str.startsWith("0x") ? str.substring(2) : str;

export function sleep(ms: number) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
export function isObject<T>(item: T): item is T & ({} | null) {
  return item && typeof item === "object" && !Array.isArray(item);
}

export function parseVaaWithBytes(bytes: SignedVaa): ParsedVaaWithBytes {
  const parsedVaa = parseVaa(bytes);
  const id = {
    emitterChain: parsedVaa.emitterChain as ChainId,
    emitterAddress: parsedVaa.emitterAddress.toString("hex"),
    sequence: parsedVaa.sequence.toString(),
  };
  return { ...parsedVaa, bytes, id };
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
export function mergeDeep<T>(
  target: Partial<T>,
  sources: Partial<T>[],
  maxDepth = 10,
): T {
  if (!sources.length || maxDepth === 0) {
    // @ts-ignore
    return target;
  }
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      const sourceProp = source[key];
      if (isObject(sourceProp)) {
        // We need to cast because the narrowed type for the key is lost in the object.
        const targetProp: T[Extract<keyof T, string>] =
          target[key] || ({ [key]: {} } as T[Extract<keyof T, string>]);
        if (target[key] === undefined) target[key] = targetProp;
        mergeDeep<T[Extract<keyof T, string>]>(
          targetProp,
          [sourceProp],
          maxDepth - 1,
        );
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, sources, maxDepth);
}

export const second = 1000;
export const minute = 60 * second;
export const hour = 60 * minute;

export class EngineError extends Error {
  constructor(msg: string, public args?: Record<any, any>) {
    super(msg);
  }
}

export function maybeConcat<T>(...arrs: (T[] | undefined)[]): T[] {
  return arrs.flatMap(arr => (arr ? arr : []));
}

export function nnull<T>(x: T | undefined | null, errMsg?: string): T {
  if (x === undefined || x === null) {
    throw new Error("Found unexpected undefined or null. " + errMsg);
  }
  return x;
}

export function assertStr(x: any, fieldName?: string): string {
  if (typeof x !== "string") {
    throw new EngineError(`Expected field to be integer, found ${x}`, {
      fieldName,
    }) as any;
  }
  return x as string;
}

export function assertInt(x: any, fieldName?: string): number {
  if (!Number.isInteger(Number(x))) {
    throw new EngineError(`Expected field to be integer, found ${x}`, {
      fieldName,
    }) as any;
  }
  return x as number;
}

export function assertArray<T>(
  x: any,
  name: string,
  elemsPred?: (x: any) => boolean,
): T[] {
  if (!Array.isArray(x) || (elemsPred && !x.every(elemsPred))) {
    throw new EngineError(`Expected value to be array, found ${x}`, {
      name,
    }) as any;
  }
  return x as T[];
}

export function assertBool(x: any, fieldName?: string): boolean {
  if (x !== false && x !== true) {
    throw new EngineError(`Expected field to be boolean, found ${x}`, {
      fieldName,
    }) as any;
  }
  return x as boolean;
}

export function wormholeBytesToHex(address: Buffer | Uint8Array): string {
  return ethers.utils.hexlify(address).replace("0x", "");
}

export function assertEvmChainId(chainId: number): EVMChainId {
  if (!isEVMChain(chainId as ChainId)) {
    throw new EngineError("Expected number to be valid EVM chainId", {
      chainId,
    });
  }
  return chainId as EVMChainId;
}

export function assertChainId(chainId: number): ChainId {
  if (!isChain(chainId)) {
    throw new EngineError("Expected number to be valid chainId", { chainId });
  }
  return chainId as ChainId;
}

export function dbg<T>(x: T, msg?: string): T {
  if (msg) {
    console.log(msg);
  }
  console.log(x);
  return x;
}

export async function mapConcurrent(
  arr: any[],
  fn: (...args: any[]) => Promise<any>,
  concurrency: number = 5,
) {
  const pendingArgs = [...arr];
  async function evaluateNext() {
    if (pendingArgs.length === 0) return;
    const args = pendingArgs.shift();
    await fn(args);
    // If any pending promise is resolved, then evaluate next
    await evaluateNext();
  }
  // Promises that will be executed parallely, with a maximum of `concurrency` at a time
  const promises = new Array(concurrency).fill(0).map(evaluateNext);
  await Promise.all(promises);
}

export function printError(error: unknown): string {
  if (error instanceof Error) {
    return `${error?.stack || error.message}`;
  }

  // Prints nested properties until a depth of 2 by default.
  return inspect(error);
}

export function min(lhs: bigint, rhs: bigint): bigint {
  return lhs < rhs ? lhs : rhs;
}

export function max(lhs: bigint, rhs: bigint): bigint {
  return lhs < rhs ? rhs : lhs;
}
