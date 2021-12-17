import { O } from 'ts-toolbelt';
import { AbiOutputParameter, AbiParameter, EvmOutputType, TupleType } from 'typechain';

export function codegenInputTypes(inputs: O.Optional<AbiParameter, 'name'>[]): string {
  if (inputs.length === 0) {
    return 'void';
  }
  return `{
    ${inputs
      .map((input, index) => `${input.name || `arg${index}`}: ${codegenType(input.type)}`)
      .join(';\n')}
  }`;
}

export function codegenOutputTypes(outputs: O.Optional<AbiOutputParameter, 'name'>[]): string {
  if (outputs.length === 1) {
    return codegenType(outputs[0].type);
  }
  return `{
      ${outputs.map(t => t.name && `${t.name}: ${codegenType(t.type)};\n`).join('')}
      ${outputs.map((t, i) => `${i}: ${codegenType(t.type)}`).join(';\n')}
    }`;
}

export function codegenType(evmType: EvmOutputType): string {
  switch (evmType.type) {
    case 'integer':
    case 'uinteger':
      return 'BN';
    case 'address':
      return 'string';
    case 'bytes':
    case 'dynamic-bytes':
      return 'string';
    case 'array':
      return `(${codegenType(evmType.itemType)})[]`;
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    case 'tuple':
      return codegenTupleType(evmType);
    case 'unknown':
      return 'any';
    case 'void':
      return 'void';
    default:
      return 'any';
  }
}

export function codegenTupleType(tuple: TupleType) {
  return `{
    ${tuple.components
      .map(component => `${component.name}: ${codegenType(component.type)}`)
      .join(';\n')}
  }`;
}
