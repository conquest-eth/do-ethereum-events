import { EventFragment, Interface } from '@ethersproject/abi';
import { getAddress } from '@ethersproject/address';
import { InterfaceWithLowerCaseAddresses } from './decoding';

export type JSONType =
  | string
  | number
  | string[]
  | number[]
  | JSONType[]
  | {
      [key: string]:
        | number
        | string
        | number[]
        | string[]
        | JSONType
        | JSONType[];
    };

type LogDescription = {
  readonly name: string;
  readonly signature: string;
  readonly topic: string;
  readonly args: Result;
};

export type RawLog = {
  blockNumber: string; // 0x
  blockHash: string;
  transactionIndex: string; // 0x

  removed: boolean;

  address: string;
  data: string;

  topics: Array<string>;

  transactionHash: string;
  logIndex: string; //0x
};
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
  name?: string;
  topic?: string;
  signature?: string;
  args?: { [key: string | number]: string | number };
  // If parsing the arguments failed, this is the error
  decodeError?: Error;
  extra?: JSONType;
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

export function getNewToBlockFromError(error: any): number | undefined {
  // console.log(`looking into`, error);
  // console.log(`message: ${error.message}`);
  // console.log(`code: ${error.code}`);
  if (error.code === -32602 && error.message) {
    const regex = /\[.*\]/gm;
    const result = regex.exec(error.message);
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

export class LogFetcher {
  protected config: InternalLogFetcherConfig;
  protected numBlocksToFetch: number;
  constructor(
    protected endpoint: string,
    protected contractAddresses: string[] | null,
    protected eventNameTopics: (string | string[])[] | null,
    config: LogFetcherConfig = {},
  ) {
    this.config = Object.assign(
      {
        numBlocksToFetchAtStart: 50,
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
  }): Promise<{ logs: RawLog[]; toBlockUsed: number }> {
    let logs: RawLog[];

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
      logs = await getLogs(
        this.endpoint,
        this.contractAddresses,
        this.eventNameTopics,
        {
          fromBlock,
          toBlock,
        },
      );
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
  protected contracts: { address: string; interface: Interface }[] | Interface;
  constructor(
    protected endpoint: string,
    contractsData:
      | { address: string; eventsABI: any[] }[]
      | { eventsABI: any[] },
    config: LogFetcherConfig = {},
  ) {
    let contracts: { address: string; interface: Interface }[] | Interface;
    let contractAddresses: string[] | null = null;
    let eventABIS: Interface[];
    if (Array.isArray(contractsData)) {
      contracts = contractsData.map((v) => ({
        address: v.address,
        interface: new InterfaceWithLowerCaseAddresses(v.eventsABI),
      }));
      contractAddresses = contracts.map((v) => v.address);
      eventABIS = contracts.map((v) => v.interface);
    } else {
      contracts = new InterfaceWithLowerCaseAddresses(contractsData.eventsABI);
      eventABIS = [contracts];
    }

    let eventNameTopics: string[] | null = null;
    for (const contract of eventABIS) {
      for (const fragment of contract.fragments) {
        if (fragment.type === 'event') {
          const eventFragment = fragment as EventFragment;
          const topic = contract.getEventTopic(eventFragment);
          if (topic) {
            eventNameTopics = eventNameTopics || [];
            eventNameTopics.push(topic);
          }
        }
      }
    }

    super(endpoint, contractAddresses, eventNameTopics, config);
    this.contracts = contracts;
  }

  async getLogEvents(options: {
    fromBlock: number;
    toBlock: number;
    retry?: number;
  }): Promise<{ events: LogEvent[]; toBlockUsed: number }> {
    const { logs, toBlockUsed } = await this.getLogs(options);
    const events = this.parse(logs);
    return { events, toBlockUsed };
  }

  parse(logs: RawLog[]): LogEvent[] {
    const events: LogEvent[] = [];
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const eventAddress = getAddress(log.address);
      const correspondingContract = !Array.isArray(this.contracts)
        ? this.contracts
        : this.contracts.find(
            (v) => v.address.toLowerCase() === eventAddress.toLowerCase(),
          )?.interface;
      if (correspondingContract) {
        const event: LogEvent = {
          blockNumber: parseInt(log.blockNumber.slice(2), 16),
          blockHash: log.blockHash,
          transactionIndex: parseInt(log.transactionIndex.slice(2), 16),
          removed: log.removed ? true : false,
          address: log.address,
          data: log.data,
          topics: log.topics,
          transactionHash: log.transactionHash,
          logIndex: parseInt(log.logIndex.slice(2), 16),
        };
        let parsed: LogDescription | null = null;
        try {
          parsed = correspondingContract.parseLog(log);
        } catch (e) {}

        if (parsed) {
          // Successfully parsed the event log; include it
          const args: { [key: string | number]: string | number } = {};
          const parsedArgsKeys = Object.keys(parsed.args);
          for (const key of parsedArgsKeys) {
            // BigNumber to be represented as decimal string
            let value = parsed.args[key];
            if (
              (value as { _isBigNumber?: boolean; toString(): string })
                ._isBigNumber
            ) {
              value = value.toString();
            }
            args[key] = value;
          }
          event.args = args;
          event.name = parsed.name;
          event.signature = parsed.signature;
          event.topic = parsed.topic;
        }

        events.push(event);
      } else {
        console.error(`unknown contract : ${eventAddress}`);
        // TODO typing
        (globalThis as any).logger &&
          (globalThis as any).logger.error(`unknown contract: ${eventAddress}`);
      }
    }
    return events;
  }
}

export async function getBlockNumber(endpoint: string): Promise<number> {
  const blockAsHexString = await send<any, string>(
    endpoint,
    'eth_blockNumber',
    [],
  );
  return parseInt(blockAsHexString.slice(2), 16);
}

export async function getLogs(
  endpoint: string,
  contractAddresses: string[] | null,
  eventNameTopics: (string | string[])[] | null,
  options: { fromBlock: number; toBlock: number },
): Promise<RawLog[]> {
  const logs: RawLog[] = await send<any, RawLog[]>(endpoint, 'eth_getLogs', [
    {
      address: contractAddresses,
      fromBlock: '0x' + options.fromBlock.toString(16),
      toBlock: '0x' + options.toBlock.toString(16),
      topics: eventNameTopics ? [eventNameTopics] : undefined,
    },
  ]);
  return logs;
}

let counter = 0;
export async function send<U extends any[], T>(
  endpoint: string,
  method: string,
  params: U,
): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: ++counter,
      jsonrpc: '2.0',
      method,
      params,
    }),
  });
  const json: { result?: T; error?: any } = await response.json();
  if (json.error || !json.result) {
    throw json.error || { code: 5000, message: 'No Result' };
  }
  return json.result;
}

export async function sendWithChecks<U extends any[], T>(
  endpoint: string,
  method: string,
  params: U,
): Promise<T> {
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: ++counter,
        jsonrpc: '2.0',
        method,
        params,
      }),
    });

    const clone = response.clone();

    try {
      const json: { result?: T; error?: any } = await response.json();
      if (json.error || !json.result) {
        throw json.error || { code: 5000, message: 'No Result' };
      }
      return json.result;
    } catch (err) {
      const text = await clone.text();
      console.log('TEXT');
      console.log(text);
      throw err;
    }
  } catch (err) {
    console.log(`ERRROR`);
    console.log(response);
    throw err;
  }
}

const multicallInterface = new InterfaceWithLowerCaseAddresses([
  {
    inputs: [
      {
        internalType: 'contract IERC165[]',
        name: 'contracts',
        type: 'address[]',
      },
      {
        internalType: 'bytes4',
        name: 'interfaceId',
        type: 'bytes4',
      },
    ],
    name: 'supportsInterface',
    outputs: [
      {
        internalType: 'bool[]',
        name: 'result',
        type: 'bool[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract IERC165[]',
        name: 'contracts',
        type: 'address[]',
      },
      {
        internalType: 'bytes4[]',
        name: 'interfaceIds',
        type: 'bytes4[]',
      },
    ],
    name: 'supportsMultipleInterfaces',
    outputs: [
      {
        internalType: 'bool[]',
        name: 'result',
        type: 'bool[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]);

export function getmMulti165CallData(contractAddresses: string[]): {
  to: string;
  data: string;
} {
  const data = multicallInterface.encodeFunctionData('supportsInterface', [
    contractAddresses,
    '0x80ac58cd',
  ]);
  return { to: '0x9f83e74173A34d59D0DFa951AE22336b835AB196', data };
}

export async function multi165(
  endpoint: string,
  contractAddresses: string[],
): Promise<boolean[]> {
  console.log(
    `checking ${contractAddresses.length} contracts for ERC721 via ERC165...`,
  );
  const callData = getmMulti165CallData(contractAddresses);
  // TODO specify blockHash for event post the deployment of Multi165 ?
  // console.log(contractAddresses);
  const response = await send<any, string>(endpoint, 'eth_call', [
    { ...callData, gas: '0x' + (28000000).toString(16) },
  ]);
  const result: boolean[] = multicallInterface.decodeFunctionResult(
    'supportsInterface',
    response,
  )[0];
  // console.log(result);
  console.log(` => found ${result.filter((v) => v).length} ERC721 contracts`);
  return result;
}

export async function splitCallAndJoin(
  endpoint: string,
  contractAddresses: string[],
) {
  let result: boolean[] = [];
  const len = contractAddresses.length;
  let start = 0;
  while (start < len) {
    const end = Math.min(start + 800, len);
    const addresses = contractAddresses.slice(start, end);
    const tmp = await multi165(endpoint, addresses);
    result = result.concat(tmp);
    start = end;
  }
  return result;
}

export function createER721Filter(
  endpoint: string,
  options?: { skipUnParsedEvents?: boolean },
): (eventsFetched: LogEvent[]) => Promise<LogEvent[]> {
  const erc721Contracts: { [address: string]: boolean } = {};
  return async (eventsFetched: LogEvent[]): Promise<LogEvent[]> => {
    const addressesMap: { [address: string]: true } = {};
    const addressesToCheck: string[] = [];

    if (options?.skipUnParsedEvents) {
      eventsFetched = eventsFetched.filter((v) => !!v.args);
    }

    for (const event of eventsFetched) {
      if (
        !erc721Contracts[event.address.toLowerCase()] &&
        !addressesMap[event.address.toLowerCase()]
      ) {
        addressesToCheck.push(event.address);
        addressesMap[event.address.toLowerCase()] = true;
      }
    }
    if (addressesToCheck.length > 0) {
      console.log(`${addressesToCheck.length} addresses need to be checked...`);
      const responses = await splitCallAndJoin(endpoint, addressesToCheck);
      for (let i = 0; i < addressesToCheck.length; i++) {
        erc721Contracts[addressesToCheck[i]] = responses[i];
      }
    }

    const events = [];
    for (const event of eventsFetched) {
      const inCache = erc721Contracts[event.address.toLowerCase()];
      if (inCache === true) {
        events.push(event);
        continue;
      } else if (inCache === false) {
        continue;
      }
    }
    return events;
  };
}

const tokenURIInterface = new InterfaceWithLowerCaseAddresses([
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'id',
        type: 'uint256',
      },
    ],
    name: 'tokenURI',
    outputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]);

export async function tokenURI(
  endpoint: string,
  contract: string,
  tokenID: string,
  blockHash: string,
): Promise<string> {
  const data = tokenURIInterface.encodeFunctionData('tokenURI', [tokenID]);
  const response = await send<any, string>(endpoint, 'eth_call', [
    { to: contract, data },
    { blockHash },
  ]);
  // TODO blockHash

  const result: string = tokenURIInterface.decodeFunctionResult(
    'tokenURI',
    response,
  )[0];
  return result;
}

export function createER721TokenURIFetcher(
  endpoint: string,
): (event: LogEvent) => Promise<JSONType | undefined> {
  return async (event: LogEvent): Promise<JSONType | undefined> => {
    if (
      !event.args ||
      !event.args['tokenId'] ||
      !event.args['from'] ||
      event.args['from'] !== '0x0000000000000000000000000000000000000000'
    ) {
      return undefined;
    }

    try {
      const uri = await tokenURI(
        endpoint,
        event.address,
        event.args['tokenId'] as string,
        event.blockHash,
      );
      console.log({ uri });
      if (uri) {
        return {
          tokenURIAtMint: uri,
        };
      } else {
        console.log(
          `no uri for contract: ${event.address} tokenId: ${event.args['tokenId']}`,
        );
      }
    } catch (e) {
      console.error(e);
    }
  };
}
