import { BigNumber, Contract, providers, utils } from 'ethers';
import { deepCopy, LogDescription, zeroPad } from 'ethers/lib/utils';

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

export type LogFetcherConfig = {
  numBlocksToFetchAtStart?: number;
  maxBlocksPerFetch?: number;
  percentageToReach?: number;
  maxEventsPerFetch?: number;
  numRetry?: number;
};

type InternalLogFetcherConfig = {
  numBlocksToFetchAtStart: number;
  maxBlocksPerFetch: number;
  percentageToReach: number;
  maxEventsPerFetch: number;
  numRetry: number;
};

export function getNewToBlockFromError(err: any): number | undefined {
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

      if (values && !isNaN(values[1])) {
        return values[1];
      }
    }
  }
}

export class LogFetcher {
  protected config: InternalLogFetcherConfig;
  protected numBlocksToFetch: number;
  constructor(
    protected provider: providers.JsonRpcProvider,
    protected contractAddresses: string[],
    config: LogFetcherConfig = {},
  ) {
    this.config = Object.assign(
      {
        numBlocksToFetchAtStart: 1000,
        percentageToReach: 80,
        maxEventsPerFetch: 10000,
        maxBlocksPerFetch: 100000,
        numRetry: 3,
      },
      config,
    );
    this.numBlocksToFetch = Math.min(
      this.config.numBlocksToFetchAtStart,
      this.config.maxBlocksPerFetch,
    );
  }

  async getLogs(options: {
    fromBlock: number;
    toBlock: number;
    retry?: number;
  }): Promise<{ logs: Log[]; toBlockUsed: number }> {
    let logs: Log[];

    const fromBlock = options.fromBlock;
    let toBlock = Math.min(
      options.toBlock,
      fromBlock + this.numBlocksToFetch - 1,
    );

    if (toBlock != options.toBlock) {
      console.log(`capping at ${toBlock - fromBlock + 1}`);
    }

    const retry =
      options.retry !== undefined ? options.retry : this.config.numRetry;

    try {
      logs = await getLogs(this.provider, this.contractAddresses, {
        fromBlock,
        toBlock,
      });
    } catch (err: any) {
      console.log(`failed to fetch ${toBlock - fromBlock + 1} blocks`);
      if (retry <= 0) {
        throw err;
      }
      let numBlocksToFetchThisTime = this.numBlocksToFetch;
      // ----------------------------------------------------------------------
      // compute the new number of block to fetch this time:
      // ----------------------------------------------------------------------
      const toBlockClue = getNewToBlockFromError(err);
      if (toBlockClue) {
        console.log(`clue found, numBlocks ${toBlockClue - fromBlock + 1}`);
        const totalNumOfBlocksToFetch = toBlockClue - fromBlock + 1;
        if (totalNumOfBlocksToFetch > 1) {
          numBlocksToFetchThisTime = Math.floor(
            (totalNumOfBlocksToFetch * this.config.percentageToReach) / 100,
          );
        }
      } else {
        console.log(`no clue divide by 2 ...`);
        const totalNumOfBlocksThatWasFetched = toBlock - fromBlock;
        if (totalNumOfBlocksThatWasFetched > 1) {
          numBlocksToFetchThisTime = Math.floor(
            totalNumOfBlocksThatWasFetched / 2,
          );
        } else {
          numBlocksToFetchThisTime = 1;
        }
      }
      console.log(
        `new number of block to fetch is : ${numBlocksToFetchThisTime}`,
      );
      // ----------------------------------------------------------------------

      this.numBlocksToFetch = numBlocksToFetchThisTime;

      toBlock = fromBlock + this.numBlocksToFetch - 1;
      const result = await this.getLogs({
        fromBlock,
        toBlock,
        retry: retry - 1,
      });
      logs = result.logs;
      toBlock = result.toBlockUsed;
    }

    const targetNumberOfLog = Math.max(
      1,
      Math.floor(
        (this.config.maxEventsPerFetch * this.config.percentageToReach) / 100,
      ),
    );
    const totalNumOfBlocksThatWasFetched = toBlock - fromBlock + 1;
    if (logs.length === 0) {
      this.numBlocksToFetch = this.config.maxBlocksPerFetch;
    } else {
      this.numBlocksToFetch = Math.min(
        this.config.maxBlocksPerFetch,
        Math.max(
          1,
          Math.floor(
            (targetNumberOfLog * totalNumOfBlocksThatWasFetched) / logs.length,
          ),
        ),
      );
    }

    console.log(
      ` (${
        logs.length / totalNumOfBlocksThatWasFetched
      } logs per block) will fetch ${this.numBlocksToFetch} from now on `,
    );

    if (toBlock !== options.toBlock) {
      console.log(`${options.toBlock - toBlock} block less`);
    }

    return { logs, toBlockUsed: toBlock };
  }
}

export class LogEventFetcher extends LogFetcher {
  constructor(
    protected provider: providers.JsonRpcProvider,
    protected contracts: Contract[],
    config: LogFetcherConfig = {},
  ) {
    super(
      provider,
      contracts.map((v) => v.address),
      config,
    );
  }

  async getLogEvents(options: {
    fromBlock: number;
    toBlock: number;
    retry?: number;
  }): Promise<{ events: LogEvent[]; toBlockUsed: number }> {
    const { logs, toBlockUsed } = await this.getLogs(options);
    const events: LogEvent[] = [];
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const eventAddress = utils.getAddress(log.address);
      const correspondingContract = this.contracts.find(
        (v) => v.address.toLowerCase() === eventAddress.toLowerCase(),
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
        console.error(`unknown contract : ${eventAddress}`);
        // TODO typing
        (globalThis as any).logger &&
          (globalThis as any).logger.error(`unknown contract: ${eventAddress}`);
      }
    }
    return { events, toBlockUsed };
  }
}

export async function getLogs(
  provider: providers.JsonRpcProvider,
  contracts: string[],
  options: { fromBlock: number; toBlock: number },
): Promise<Log[]> {
  let toBlock = options.toBlock;
  const logs = await provider.send('eth_getLogs', [
    {
      address: contracts,
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
  return logs;
}
