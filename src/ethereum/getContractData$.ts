import { Observable, from, merge, empty, ReplaySubject } from 'rxjs';
import { skipUntil, mergeMap, throttleTime, delay, switchMap, shareReplay } from 'rxjs/operators';
import { Eth } from 'web3-eth';
import { Contract } from 'web3-eth-contract';

import { fromWeb3DataEvent } from './fromWeb3DataEvent';
import { EventEmitter, Tx, JSType } from './types';

interface IOptions<IV, RV> {
  eventsForReload?: EventEmitter<any> | EventEmitter<any>[];
  reloadTrigger$?: Observable<any>;
  args?: Array<JSType | JSType[]>;
  convert?(value: IV): RV;
  updatingDelay?: number;
  tx?: Tx;
}

function identity(value: any) {
  return value;
}

function awaitMs(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

export function getContractData$<IV, RV>(
  contract: Contract,
  eth: Eth,
  method: string,
  options: IOptions<IV, RV> = {},
): Observable<RV> {
  const {
    eventsForReload = [],
    reloadTrigger$ = empty(),
    args = [],
    convert = identity,
    updatingDelay = 0,
  } = options;

  const load = async () => {
    const data = await contract.methods[method](...args).call(options.tx);
    return convert(data);
  };

  const emitters = Array.isArray(eventsForReload) ? eventsForReload : [eventsForReload];

  const first$ = from(load());
  const fromEvents$ = merge(...emitters.map(emitter => fromWeb3DataEvent(emitter))).pipe(
    skipUntil(first$),
    throttleTime(200),
    delay(updatingDelay),
    switchMap(async event => {
      let currentBlock = await eth.getBlockNumber();

      /* eslint-disable no-await-in-loop */
      while (currentBlock < event.blockNumber) {
        await awaitMs(500);
        currentBlock = await eth.getBlockNumber();
      }
      /* eslint-enable no-await-in-loop */

      return event;
    }),
    mergeMap(() => from(load()), 1),
    shareReplay(1),
  );

  const subject = new ReplaySubject<RV>(1);

  merge(first$, fromEvents$, reloadTrigger$).subscribe(subject);

  return subject;
}
