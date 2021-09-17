import { Observable } from 'rxjs';
import { A, B } from 'ts-toolbelt';
import BN from 'bn.js';
import Web3 from 'web3';
import { PromiEvent, TransactionReceipt } from 'web3-core';
import { Contract } from 'web3-eth-contract';

import { getContractData$ } from './getContractData$';
import {
  EventEmitter,
  SendOptions,
  CallOptions,
  TransactionObject,
  EventLog,
  InputEvmType,
  InputEvmTypeToJSTypeMap,
  JSType,
} from './types';

/* ***** OVERRIDE WEB3 TYPES ***** */

type BlockType = 'latest' | 'pending' | 'genesis' | number;

type Callback<T> = (error: Error, result: T) => void;

/* ***** */

interface GenericDescriptor {
  callMethods: Record<string, MethodDescriptor>;
  sendMethods: Record<string, MethodDescriptor>;
  events: Record<string, EventDescriptor>;
}

type MethodDescriptor = {
  inputs?: readonly NamedInput<string, InputEvmType | Input<InputEvmType, boolean>, boolean>[];
  output?: readonly Output<OutputEvmType, boolean>[];
};

interface EventDescriptor {
  inputs: readonly NamedInput<string, InputEvmType | Input<InputEvmType, boolean>, boolean>[];
}

interface NamedInput<
  N extends string = string,
  T extends InputEvmType | Input<InputEvmType, boolean> =
    | InputEvmType
    | Input<InputEvmType, boolean>,
  IA extends boolean = false
> {
  name: N;
  type: T;
  isArray: IA;
}

interface Input<T extends InputEvmType = InputEvmType, IA extends boolean = false> {
  type: T;
  isArray: IA;
}

type Output<T extends OutputEvmType = OutputEvmType, IA extends boolean = false> = {
  type: T;
  isArray: IA;
};

type OutputEvmTypeToJSTypeMap = InputEvmTypeToJSTypeMap & {
  void: void;
};
type OutputEvmType = keyof OutputEvmTypeToJSTypeMap;

type IOToJSType<
  T extends Output<any, any>,
  ToJSTypeMap extends Record<string, JSType | void>
> = T['isArray'] extends true ? ToJSTypeMap[T['type']][] : ToJSTypeMap[T['type']];

type InferTypeProp<T> = T extends NamedInput<infer Name, infer Type, boolean>
  ? Type extends OutputEvmType
    ? {
        [key in Name]: IOToJSType<T, InputEvmTypeToJSTypeMap>;
      }
    : { [key in Name]: IOToJSType<Exclude<Type, OutputEvmType>, InputEvmTypeToJSTypeMap>[] }
  : never;
type InputsToArg<T> = MergeTupleMembers<{ [P in keyof T]: InferTypeProp<T[P]> }>;
type MaybeInputsToArgs<S> = S extends readonly any[]
  ? A.Equals<S, readonly []> extends B.True
    ? void
    : A.Equals<S, []> extends B.True
    ? void
    : InputsToArg<S>
  : void;

type MaybeOutputToResponse<O> = O extends readonly any[]
  ? A.Equals<O, readonly []> extends B.True
    ? void
    : A.Equals<O, []> extends B.True
    ? void
    : O extends [any] | readonly [any]
    ? IOToJSType<Extract<O[0], Output<OutputEvmType, boolean>>, OutputEvmTypeToJSTypeMap>
    : {
        -readonly [key in keyof O]: IOToJSType<Extract<O[key], Output>, OutputEvmTypeToJSTypeMap>;
      }
  : void;

type CallMethod<M extends MethodDescriptor = MethodDescriptor> = (
  input: MaybeInputsToArgs<M['inputs']>,
  eventsForReload?: EventEmitter<any> | EventEmitter<any>[],
  updatingDelay?: number,
  tx?: CallOptions,
) => Observable<MaybeOutputToResponse<NonNullable<M['output']>>>;

// for read non view methods
type ReadMethod<M extends MethodDescriptor = MethodDescriptor> = (
  input: MaybeInputsToArgs<M['inputs']>,
  tx: SendOptions,
  eventsForReload?: EventEmitter<any> | EventEmitter<any>[],
  updatingDelay?: number,
) => Observable<MaybeOutputToResponse<NonNullable<M['output']>>>;

type SendMethod<M extends MethodDescriptor = MethodDescriptor> = ((
  input: MaybeInputsToArgs<M['inputs']>,
  tx: SendOptions,
) => PromiEvent<TransactionReceipt>) & {
  getTransaction(input: MaybeInputsToArgs<M['inputs']>): TransactionObject;
  read: ReadMethod<M>;
};

type EventMethod<E extends EventDescriptor> = (
  options?: SubscribeEventOptions<E>,
  cb?: Callback<EventLog<MaybeInputsToArgs<E>>>,
) => EventEmitter<MaybeInputsToArgs<E>>;

interface SubscribeEventOptions<E extends EventDescriptor> {
  filter?: Partial<MaybeInputsToArgs<E['inputs']>>;
  fromBlock?: BlockType;
  topics?: string[];
}

type ContractWrapper<D extends GenericDescriptor> = {
  methods: {
    [key in keyof D['callMethods']]: CallMethod<D['callMethods'][key]>;
  } &
    {
      [key in keyof D['sendMethods']]: SendMethod<D['sendMethods'][key]>;
    };
  events: {
    [key in keyof D['events']]: EventMethod<D['events'][key]>;
  } & {
    allEvents: Contract['events']['allEvents'];
  };
  getPastEvents: Contract['getPastEvents'];
};

export function getNamedInput<
  N extends string,
  T extends InputEvmType | Input<InputEvmType, boolean>
>(name: N, type: T): NamedInput<N, T>;
export function getNamedInput<
  N extends string,
  T extends InputEvmType | Input<InputEvmType, boolean>
>(name: N, type: T, isArray: true): NamedInput<N, T, true>;
export function getNamedInput<
  N extends string,
  T extends InputEvmType | Input<InputEvmType, boolean>
>(name: N, type: T, isArray: boolean = false): NamedInput<N, T, boolean> {
  return { name, type, isArray };
}

export function getInput<T extends InputEvmType>(type: T): Input<T>;
export function getInput<T extends InputEvmType>(type: T, isArray: true): Input<T, true>;
export function getInput<T extends InputEvmType>(
  type: T,
  isArray: boolean = false,
): Input<T, boolean> {
  return { type, isArray };
}

export function getOutput<T extends OutputEvmType = OutputEvmType>(type: T): Output<T>;
export function getOutput<T extends OutputEvmType = OutputEvmType>(
  type: T,
  isArray: true,
): Output<T, true>;
export function getOutput<T extends OutputEvmType = OutputEvmType>(
  type: T,
  isArray: boolean = false,
): Output<T, boolean> {
  return { type, isArray };
}

const toRequest: {
  [key in InputEvmType]: (input: InputEvmTypeToJSTypeMap[key]) => JSType;
} = {
  address: value => value,
  boolean: value => value,
  integer: value => value.toString(),
  uinteger: value => value.toString(),
  string: value => value,
  bytes: value => value,
  'dynamic-bytes': value => value,
};

const fromResponse: {
  [key in OutputEvmType]: (input: JSType) => OutputEvmTypeToJSTypeMap[key];
} = {
  address: value => String(value),
  boolean: value => Boolean(value),
  integer: value => new BN(value as string | BN),
  uinteger: value => new BN(value as string | BN),
  string: value => String(value),
  bytes: value => String(value),
  'dynamic-bytes': value => String(value),
  void: () => {},
};

export function makeContractCreator<D extends GenericDescriptor>(_abi: any[], _descriptor: D) {
  return (web3: Web3, address: string): ContractWrapper<D> => {
    const baseContract = new web3.eth.Contract(_abi, address);

    const methodsProxy = new Proxy<Contract['methods']>(
      {},
      {
        get(target: Contract['methods'], prop: string) {
          const callMethodDescriptor = _descriptor.callMethods[prop];
          const sendMethodDescriptor = _descriptor.sendMethods[prop];

          if (!callMethodDescriptor && !sendMethodDescriptor) {
            return target[prop];
          }

          const { inputs: callInputs = [], output: callOutput } =
            callMethodDescriptor || sendMethodDescriptor;

          const baseCallFunction = (
            input: void | Record<string, JSType | JSType[]>,
            eventsForReload?: EventEmitter<any> | EventEmitter<any>[],
            updatingDelay?: number,
            tx?: CallOptions,
          ) => {
            return getContractData$(baseContract, web3.eth, prop, {
              tx,
              args: input
                ? callInputs.map(({ name, type }) => convertInputValueToRequest(type, input[name]))
                : [],
              eventsForReload,
              updatingDelay,
              convert: makeConvertFromResponse(callOutput && [...callOutput]),
            }) as Observable<any>;
          };

          const callFunction: CallMethod<any> = baseCallFunction;

          const readFunction: ReadMethod<any> = (
            input: void | Record<string, JSType | JSType[]>,
            tx: SendOptions,
            eventsForReload?: EventEmitter<any> | EventEmitter<any>[],
            updatingDelay?: number,
          ) => baseCallFunction(input, eventsForReload, updatingDelay, tx);

          if (callMethodDescriptor) {
            return callFunction;
          }

          if (sendMethodDescriptor) {
            const { inputs = [] } = sendMethodDescriptor;

            const getTransactionFunction = (
              input: void | Record<string, BN | string | boolean>,
            ) => {
              const args = input
                ? inputs.map(({ name, type }) => convertInputValueToRequest(type, input[name]))
                : [];
              return baseContract.methods[prop](...args);
            };

            const sendFunction: SendMethod<any> = attachStaticFields(
              (input: void | Record<string, BN | string | boolean>, tx: SendOptions) => {
                return getTransactionFunction(input).send(tx);
              },
              {
                getTransaction: getTransactionFunction,
                read: readFunction,
              },
            );

            return sendFunction;
          }

          return target[prop];
        },
      },
    );

    return (new Proxy<Contract>(baseContract, {
      get(target, prop: keyof Contract) {
        if (prop === 'methods') {
          return methodsProxy;
        }
        if (prop === 'events') {
          return target[prop];
        }
        return target[prop];
      },
    }) as unknown) as ContractWrapper<D>;
  };
}

export function attachStaticFields<T extends {}, I extends Record<string, any>>(
  target: T,
  staticFields: I,
): T & I {
  const result: T & I = target as T & I;

  Object.keys(staticFields).forEach((key: keyof I) => {
    (result as I)[key] = staticFields[key];
  });

  return result;
}

function convertInputValueToRequest(
  type: InputEvmType | Input<InputEvmType, boolean>,
  inputValue: JSType | JSType[],
): JSType | JSType[] {
  function convert(value: JSType | JSType[]) {
    return typeof type === 'string'
      ? (toRequest[type] as any)(value)
      : convertInputValueToRequest(type.type, value);
  }
  return Array.isArray(inputValue) ? inputValue.map(convert) : convert(inputValue);
}

function makeConvertFromResponse(output?: Output<OutputEvmType, boolean>[]) {
  return (value: JSType | JSType[]) => {
    if (!output || !output.length) {
      return value;
    }
    return output.length > 1
      ? output.map((outputItem, index) =>
          convertOutputValueFromResponse(outputItem.type, (value as JSType[])[index]),
        )
      : convertOutputValueFromResponse(output[0].type, value as JSType);
  };
}

function convertOutputValueFromResponse(
  type: OutputEvmType,
  value: JSType | JSType[],
): JSType | JSType[] {
  return Array.isArray(value)
    ? value.map(fromResponse[type] as any)
    : (fromResponse[type] as any)(value);
}

/* ***** MERGE ***** */

type MergeArguments<T, K extends string = 'whatever'> = {
  [Key in K]: T extends (first: infer A) => void ? A : MergeOnePlus<T, K>;
}[K];

type MergeOnePlus<T, K extends string> = {
  [Key in K]: T extends (first: infer A, ...args: infer U) => void
    ? A & MergeArguments<(...args: U) => void, K>
    : never;
}[K];

type IntoSignature<T extends readonly unknown[]> = (...args: T) => void;

type MergeTupleMembers<T extends readonly unknown[] | {}> = T extends readonly unknown[]
  ? MergeArguments<IntoSignature<T>>
  : never;
