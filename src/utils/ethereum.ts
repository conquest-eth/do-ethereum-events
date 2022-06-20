import { BigNumber, Contract, providers, utils } from 'ethers';
import { deepCopy, LogDescription } from 'ethers/lib/utils';

export function isSignatureValid({
  owner,
  message,
  signature,
}: {
  owner: string;
  message: string;
  signature: string;
}): boolean {
  const addressFromSignature = utils.verifyMessage(message, signature);
  return owner.toLowerCase() === addressFromSignature.toLowerCase();
}

// import {Log} from '@ethersproject/abstract-provider';
interface Log {
  blockNumber: number;
  blockHash: string;
  transactionIndex: number;

  removed: boolean;

  address: string;
  data: string;

  topics: Array<string>;

  transactionHash: string;
  logIndex: number;
}

export interface LogEvent extends Log {
  event?: string;
  // The event signature
  eventSignature?: string;
  // The parsed arguments to the event
  args?: Result;
  // If parsing the arguments failed, this is the error
  decodeError?: Error;
}

interface Result extends ReadonlyArray<any> {
  readonly [key: string]: any;
}

export async function getLogEvents(
  provider: providers.JsonRpcProvider,
  contracts: Contract[],
  options: { fromBlock: number; toBlock: number },
): Promise<LogEvent[]> {
  const events: LogEvent[] = [];
  const logs: Log[] = await provider.send('eth_getLogs', [
    {
      address: contracts.map((v) => v.address),
      fromBlock: BigNumber.from(options.fromBlock).toHexString(),
      toBlock: BigNumber.from(options.toBlock).toHexString(),
      //   topics: [
      //     [
      //       // topic[0]
      //       contract.filters.EventName().topics[0],
      //     ],
      //   ],
    },
  ]);

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const eventAddress = utils.getAddress(log.address);
    const correspondingContract = contracts.find(
      (v) => v.address === eventAddress,
    );
    if (correspondingContract) {
      let event: LogEvent = <LogEvent>deepCopy(log);
      let parsed: LogDescription | null = null;
      try {
        parsed = correspondingContract.interface.parseLog(log);
      } catch (e) {}

      // Successfully parsed the event log; include it
      if (parsed) {
        event.args = parsed.args;
        event.event = parsed.name;
        event.eventSignature = parsed.signature;
      }

      events.push(event);
    } else {
      // TODO typing
      (globalThis as any).logger &&
        (globalThis as any).logger.error(`unknown contract: ${eventAddress}`);
    }
  }
  return events;
}
