import {BigNumber, Contract, ethers, Wallet, utils} from 'ethers';
import type {Env} from './types';
import {DO} from './DO';
import { createResponse } from './utils';
import {getLogEvents, LogEvent} from './ethereum/utils'

// needed because of : https://github.com/cloudflare/durable-objects-typescript-rollup-esm/issues/3
type State = DurableObjectState & {blockConcurrencyWhile: (func: () => Promise<void>) => void};

function lexicographicNumber15(num: number): string {
  return num.toString().padStart(15, '0');
}

type EventBlock = {
  number: number;
  hash: string;
  startStreamID: number;
  numEvents: number;
}


type LastSync = {
  latestBlock: number;
  lastToBlock: number;
  unconfirmedBlocks: EventBlock[];
  nextStreamID: number;
}

type EventWithId = LogEvent & {
  streamID: string;
}


type BlockEvents = {hash: string, number: number; events: LogEvent[]};

export class EventList extends DO {
  provider: ethers.providers.JsonRpcProvider;
  contracts: ethers.Contract[];
  finality: number;

  constructor(state: State, env: Env) {
    super(state, env);
    this.provider = new ethers.providers.JsonRpcProvider(env.ETHEREUM_NODE);
    this.finality = 12; // TODO
  }

  async setup(path: string[], data: {reset?: boolean, list: {eventsABI: any[], address: string}[]}): Promise<Response> {
    // TODO only admin
    let reset = data.reset;

    for (const contractData of data.list) {
      if (!this.contracts.find(v => v.address.toLowerCase() === contractData.address.toLowerCase())) {
        reset = true;
      }
    }

    for (const contract of this.contracts) {
      if (!data.list.find(v => v.address.toLowerCase() === contract.address.toLowerCase())) {
        reset = true;
      }
    }

    if (reset) {
      this.contracts = [];
      await this.state.storage.deleteAll();
      for (const contractData of data.list) {
        this.contracts.push(new Contract(contractData.address, contractData.eventsABI, this.provider));
      }
    }

    return createResponse({success: true, reset})
  }

  _getEventsMap(start: number, limit: number): Promise<Map<string, LogEvent> | undefined> {
    return this.state.storage.list<LogEvent>({start: `event_${lexicographicNumber15(start)}`, limit})
  }


  _getLastSync(): Promise<LastSync | undefined> {
    return this.state.storage.get<LastSync>(`_sync_`);
  }

  async _putLastSync(lastSync: LastSync): Promise<void> {
    await this.state.storage.put<LastSync>(`_sync_`, lastSync);
  }


  async getEvents(path: string[]): Promise<Response> {
    const start = parseInt(path[0]);
    const limit = parseInt(path[1]);


    const eventsMap = await this._getEventsMap(start, limit);
    const events = [];
    if (eventsMap) {
      for (const entry of eventsMap.entries()) {
        const eventID = entry[0];
        const event = entry[1];
        events.push({streamID: parseInt(eventID.slice(6)), ...event});
      }
    }

    return createResponse({events, success: true});
  }


  async processEvents(path: string[]): Promise<Response> {

    const lastSync = await this._getLastSync();
    let streamID = 0;
    let fromBlock = 0;
    let unconfirmedBlocks: EventBlock[] = [];
    if (lastSync) {
      unconfirmedBlocks = lastSync.unconfirmedBlocks;
      streamID = lastSync.nextStreamID;
      if (unconfirmedBlocks.length > 0) {
        fromBlock = lastSync.unconfirmedBlocks[0].number;
      } else {
        fromBlock = lastSync.lastToBlock + 1;
      }
    }

    const latestBlock = await this.provider.getBlockNumber();

    const toBlock = Math.min(latestBlock, fromBlock + 10000); // TODO Config: 10,000 max block range

    const newEvents = await getLogEvents(this.provider, this.contracts, {fromBlock, toBlock});

    // grouping per block...
    const groups: {[hash:string]: BlockEvents} = {};
    const eventsGroupedPerBlock: BlockEvents[] = [];
    for(const event of newEvents) {
      let group = groups[event.blockHash];
      if (!group) {
        group = groups[event.blockHash] = {
          hash: event.blockHash, number: event.blockNumber, events: []
        };
        eventsGroupedPerBlock.push(group);
      }
      group.events.push(event);
    }

    // set up the new entries to be added to the stream
    const newEventEntries: DurableObjectEntries<LogEvent> = {};

    // find reorgs
    let reorgBlock: EventBlock | undefined;
    let currentIndex = 0;
    for(const block of eventsGroupedPerBlock) {
      if (currentIndex < unconfirmedBlocks.length) {
        const unconfirmedBlockAtIndex = unconfirmedBlocks[currentIndex];
        if (unconfirmedBlockAtIndex.hash !== block.hash) {
          reorgBlock = unconfirmedBlockAtIndex;
          break;
        }
        currentIndex ++;
      }
    }

    if (reorgBlock) {
      // re-add event to the stream but flag them as removed
      const lastUnconfirmedBlock = unconfirmedBlocks[unconfirmedBlocks.length-1];
      const unconfirmedEventsMap = await this._getEventsMap(reorgBlock.startStreamID, lastUnconfirmedBlock.startStreamID + lastUnconfirmedBlock.numEvents);
      if (unconfirmedEventsMap) {
        for (const entry of unconfirmedEventsMap.entries()) {
          const event = entry[1];
          newEventEntries[`${streamID++}`] = {...event, removed: true};
        }
      }
    }


    // new events and new unconfirmed blocks
    const newUnconfirmedBlocks: EventBlock[] = [];
    for(const block of eventsGroupedPerBlock) {
      if (block.events.length > 0) {
        const startStreamID = streamID;
        for (const event of block.events) {
          newEventEntries[`${streamID++}`] = {...event};
        }
        if (latestBlock - block.number <= this.finality) {
          newUnconfirmedBlocks.push({
            hash: block.hash,
            number: block.number,
            numEvents: block.events.length,
            startStreamID
          })
        }
      }

    }

    if (Object.keys(newEventEntries).length > 0) {
      this.state.storage.put<LogEvent>(newEventEntries);
    }
    this._putLastSync({
      latestBlock,
      lastToBlock: toBlock,
      unconfirmedBlocks: newUnconfirmedBlocks,
      nextStreamID: streamID
    })

    return createResponse({success: true});
  }
}
