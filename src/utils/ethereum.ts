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
): Promise<{ toBlock: number; events: LogEvent[] }> {
  const events: LogEvent[] = [];

  let logs: Log[] | undefined;

  let toBlock = options.toBlock;

  try {
    logs = await provider.send('eth_getLogs', [
      {
        address: contracts.map((v) => v.address),
        fromBlock: BigNumber.from(options.fromBlock).toHexString(),
        toBlock: BigNumber.from(toBlock).toHexString(),
        //   topics: [
        //     [
        //       // topic[0]
        //       contract.filters.EventName().topics[0],
        //     ],
        //   ],
      },
    ]);
  } catch (err: any) {
    let retried = false;
    if (err.body) {
      const json = JSON.parse(err.body);
      // alchemy API, getting the range that should work
      // should still fallback on division by 2
      if (json.error?.code === -32602 && json.error.message) {
        const regex = /\[.*\]/gm;
        const result = regex.exec(json.error.message);
        let values: number[] | undefined;
        if (result && result[0]) {
          values = result[0]
            .slice(1, result[0].length - 1)
            .split(', ')
            .map((v) => parseInt(v.slice(2), 16));
        }

        if (values && values.length === 2) {
          toBlock = values[1];
          retried = true;
          logs = await provider.send('eth_getLogs', [
            {
              address: contracts.map((v) => v.address),
              fromBlock: BigNumber.from(options.fromBlock).toHexString(),
              toBlock: BigNumber.from(toBlock).toHexString(),
              //   topics: [
              //     [
              //       // topic[0]
              //       contract.filters.EventName().topics[0],
              //     ],
              //   ],
            },
          ]);
        }
      }
    }
    if (!retried) {
      throw err;
    }
  }

  if (!logs) {
    throw new Error(`no logs`);
  }

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
  return { events, toBlock };
}
