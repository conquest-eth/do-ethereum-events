import {
  LogEventFetcher,
  LogEvent,
  getBlockNumber,
  RawLog,
} from './utils/ethereum';
import {
  createJSONResponse,
  parseGETParams,
  pathFromURL,
} from './utils/request';
import { SECONDS, spaceOutCallOptimisitcaly } from './utils/time';

function lexicographicNumber15(num: number): string {
  return num.toString().padStart(15, '0');
}

export type ContractSetup = {
  reset?: boolean;
  start?: boolean;
  list?: ContractData[];
  all?: AllContractData;
};

export type EventBlock = {
  number: number;
  hash: string;
  startStreamID: number;
  numEvents: number;
};

export type LastSync = {
  enabled: boolean;
  latestBlock: number;
  lastToBlock: number;
  // toBlockLastIndex: number; // TODO if a block cannot be ingested in one go?
  unconfirmedBlocks: EventBlock[];
  nextStreamID: number;
};

export type EventWithId = LogEvent & {
  streamID: number;
};

export { LogEvent } from './utils/ethereum';

export type BlockEvents = { hash: string; number: number; events: LogEvent[] };

export type ContractData = {
  eventsABI: any[];
  address: string;
  startBlock?: number;
};

export type AllContractData = { eventsABI: any[]; startBlock?: number };

export abstract class EthereumEventsDO {
  static alarm: { interval?: number; individualCall?: boolean } | null = {};
  static scheduled: { interval: number } = { interval: 0 };

  logEventFetcher: LogEventFetcher | undefined;
  nodeEndpoint: string;
  contractsData: ContractData[] | AllContractData | undefined;
  finality: number;

  /// requires ETHEREUM_NODE
  constructor(protected state: DurableObjectState, protected env: Env) {
    // super(state, env);
    console.log(`ethereum node : ${env.ETHEREUM_NODE}`);
    this.nodeEndpoint = env.ETHEREUM_NODE;
    this.finality = 12; // TODO
  }

  async setup(data: ContractSetup) {
    await this._setupContracts();

    if (!data) {
      throw new Error(`invalid contract data, undefined`);
    }

    if (data.list && data.all) {
      throw new Error(`invalid contract data, use list OR all, ot both`);
    }
    if (!data.list && !data.all) {
      throw new Error(`invalid contract data, need list or all`);
    }

    // TODO only admin
    let reset = data.reset;

    if (!this.contractsData) {
      reset = true;
    } else {
      if (data.list) {
        if (!Array.isArray(this.contractsData)) {
          reset = true;
        } else {
          for (const contractData of data.list) {
            if (
              !this.contractsData.find(
                (v) =>
                  v.address.toLowerCase() ===
                  contractData.address.toLowerCase(),
              )
            ) {
              reset = true;
            }
          }

          for (const contract of this.contractsData) {
            if (
              !data.list.find(
                (v) =>
                  v.address.toLowerCase() === contract.address.toLowerCase(),
              )
            ) {
              reset = true;
            }
          }
        }
      } else if (data.all) {
        if (Array.isArray(this.contractsData)) {
          reset = true;
        } else {
          reset = false; // TODO allow reset ?
          // this also applies to list if only eventABI changes
        }
      }
    }

    if (reset) {
      this._reset(
        data.list !== undefined
          ? (data.list as ContractData[])
          : (data.all as AllContractData),
      );
    } else {
      this.state.storage.put<ContractData[] | AllContractData>(
        '_contracts_',
        data.list !== undefined
          ? (data.list as ContractData[])
          : (data.all as AllContractData),
      );
    }

    console.log({ reset, numContracts: data.list ? data.list.length : ' all' });

    if (data.start) {
      await this.start();
    }
    return createJSONResponse({ success: true, reset });
  }

  async start(): Promise<Response> {
    const lastSync = await this._getLastSync();
    lastSync.enabled = true;
    await this._putLastSync(lastSync);
    if (EthereumEventsDO.alarm) {
      await this._setAlarmDelta(
        (EthereumEventsDO.alarm.interval || 30) * SECONDS,
      );
    }
    return createJSONResponse({
      success: true,
      alarmTriggered: EthereumEventsDO.alarm,
    });
  }

  async triggerAlarm(): Promise<Response> {
    if (EthereumEventsDO.alarm) {
      // let currentAlarm = await this.state.storage.getAlarm();
      // if (currentAlarm == null) {
      //   this.state.storage.setAlarm(Date.now() + 1 * SECONDS);
      // }
      await this.alarm();
      return new Response('Alarm Executed');
    }
    return new Response('Alarm Disabled');
  }

  async fetchLogsAndProcess(
    { status }: { status?: boolean } = { status: false },
  ): Promise<Response> {
    if (EthereumEventsDO.scheduled.interval) {
      await spaceOutCallOptimisitcaly(
        async () => {
          await this._fetchAndProcess();
        },
        { interval: EthereumEventsDO.scheduled.interval, duration: 60 },
      );
    } else {
      await this._fetchAndProcess();
    }
    if (status) {
      return this.getStatus();
    } else {
      return createJSONResponse({ success: true });
    }
  }

  async feedWithLogs({
    logs,
  }: {
    logs: (LogEvent | RawLog)[];
  }): Promise<Response> {
    if (logs.length === 0) {
      return createJSONResponse({ success: true });
    }

    if (typeof logs[0].blockNumber === 'string') {
      await this._setupContracts();
      if (!this.logEventFetcher) {
        return createJSONResponse({
          error: `no conract data available to parse`,
        });
      }
      logs = this.logEventFetcher.parse(logs as RawLog[]);
    }

    const newEvents = await this.filter(logs as LogEvent[]);

    if (newEvents.length === 0) {
      return createJSONResponse({ success: true });
    }

    const lastSync: LastSync = await this._getLastSync();

    const firstLog = newEvents[0];
    const lastLog = newEvents[newEvents.length - 1];

    const latestBlock = await getBlockNumber(this.nodeEndpoint);

    if (latestBlock - lastLog.blockNumber < this.finality) {
      return createJSONResponse({ error: 'do not accept unconfirmed blocks' });
    }

    if (firstLog.blockNumber <= lastSync.lastToBlock) {
      return createJSONResponse({
        // TODO use lastSync.toBlockLastIndex ?
        error: 'do not accept event from already digested blocks',
      });
    }

    const { eventStream, newLastSync } = await this._generateStreamToAppend(
      newEvents,
      lastSync,
    );

    await this.onEventStream(eventStream);

    // We save after eventStream has been processed
    // if onEventStream fails it need to handle this
    this._saveStream(eventStream, newLastSync);

    return createJSONResponse({ success: true });
  }

  async feed({
    eventStream,
  }: {
    eventStream: EventWithId[];
  }): Promise<Response> {
    if (eventStream.length === 0) {
      return createJSONResponse({ success: true });
    }

    // console.log({ eventStream });

    const lastSync: LastSync = await this._getLastSync();

    const firstEvent = eventStream[0];
    const lastEvent = eventStream[eventStream.length - 1];

    const latestBlock = await getBlockNumber(this.nodeEndpoint);

    if (latestBlock - lastEvent.blockNumber < this.finality) {
      return createJSONResponse({ error: 'do not accept unconfirmed blocks' });
    }

    if (firstEvent.streamID === lastSync.nextStreamID) {
      const newLastSync = {
        enabled: lastSync.enabled,
        latestBlock: latestBlock,
        lastToBlock: lastEvent.blockNumber,
        unconfirmedBlocks: [],
        nextStreamID: lastEvent.streamID + 1,
      };

      await this.onEventStream(eventStream);

      // We save after eventStream has been processed
      // if onEventStream fails it need to handle this
      this._saveStream(eventStream, newLastSync);

      return createJSONResponse({ success: true });
    } else {
      return createJSONResponse({
        error: `invalid nextStreamID, ${firstEvent.streamID} === ${lastSync.nextStreamID}`,
      });
    }
  }

  async getEvents({
    start,
    limit,
  }: {
    start?: number;
    limit?: number;
  } = {}): Promise<Response> {
    if (!start) {
      start = 0;
    }
    if (!limit) {
      limit = 1000;
    }
    const eventsMap = await this._getEventsMap(start, limit);
    const events = [];
    if (eventsMap) {
      for (const entry of eventsMap.entries()) {
        const eventID = entry[0];
        const event = entry[1];
        events.push({ streamID: parseInt(eventID.slice(6)), ...event });
      }
    }

    return createJSONResponse({ events, success: true });
  }

  async getStatus(): Promise<Response> {
    const lastSync = await this._getLastSync();
    const alarm = await this.state.storage.getAlarm();

    return createJSONResponse({
      status: {
        lastSync,
        alarm,
        BUILD_VERSION: (globalThis as any).process.env.BUILD_VERSION,
      },
      success: true,
    });
  }

  // --------------------------------------------------------------------------
  // CAN BE OVERRIDEN
  // --------------------------------------------------------------------------

  protected abstract onEventStream(eventStream: EventWithId[]): Promise<void>;

  protected async reset(): Promise<void> {}

  protected async filter(eventsFetched: LogEvent[]): Promise<LogEvent[]> {
    return eventsFetched;
  }

  // --------------------------------------------------------------------------
  // ENTRY POINTS
  // --------------------------------------------------------------------------

  async fetch(request: Request) {
    const { patharray } = pathFromURL(request.url);
    let json;
    if (request.method == 'POST' || request.method == 'PUT') {
      try {
        json = await request.json();
        // console.log({ json });
      } catch (e) {
        console.error(`JSON e: ${e}`);
        json = undefined;
      }
    }
    const params = parseGETParams(request.url);
    // take the last path so that user can choose their prefix
    switch (patharray[patharray.length - 1]) {
      case 'setup':
        return this.setup(json as ContractSetup);
      case 'fetchLogsAndProcess':
        return this.fetchLogsAndProcess(params);
      case 'feed':
        return this.feed(json as { eventStream: EventWithId[] });
      case 'feedWithLogs':
        return this.feedWithLogs(json as { logs: RawLog[] | LogEvent[] });
      case 'start':
        return this.start();
      case 'list':
      case 'events':
        return this.getEvents(params);
      case 'trigger-alarm':
        return this.triggerAlarm();
      case 'status':
        return this.getStatus();
      default: {
        console.log({ patharray, pathname: new URL(request.url).pathname });
        return new Response('Not found', { status: 404 });
      }
    }
  }

  async alarm() {
    if (EthereumEventsDO.alarm) {
      console.log(`interval : ${EthereumEventsDO.alarm.interval}s`);
      const timestampInMilliseconds = Date.now();
      if (!EthereumEventsDO.alarm.individualCall) {
        if (EthereumEventsDO.alarm.interval) {
          try {
            await spaceOutCallOptimisitcaly(
              async () => {
                await this._fetchAndProcess();
              },
              { interval: EthereumEventsDO.alarm.interval, duration: 60 },
            );
          } finally {
            await this._setAlarmDelta(
              EthereumEventsDO.alarm.interval * SECONDS,
            );
          }
        } else {
          await this._setAlarmDelta(30 * SECONDS);
          await this._fetchAndProcess();
        }
      } else {
        await this._fetchAndProcess();
        await this._setAlarmDelta(
          (EthereumEventsDO.alarm.interval || 30) * SECONDS,
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // INTERNAL
  // --------------------------------------------------------------------------

  private _processing = false;
  async _fetchAndProcess(): Promise<string> {
    if (this._processing) {
      console.log(`still processing... skipping...`);
      return 'processing';
    }
    this._processing = true;
    try {
      await this._setupContracts();

      if (!this.contractsData || !this.logEventFetcher) {
        this._processing = false;
        return 'Not Ready';
      }

      const lastSync = await this._getLastSync();
      if (!lastSync.enabled) {
        this._processing = false;
        return 'Not Enabled';
      }
      let fromBlock = 0;
      if (Array.isArray(this.contractsData)) {
        for (const contractData of this.contractsData) {
          if (contractData.startBlock) {
            if (fromBlock === 0) {
              fromBlock = contractData.startBlock;
            } else if (contractData.startBlock < fromBlock) {
              fromBlock = contractData.startBlock;
            }
          }
        }
      } else {
        fromBlock = this.contractsData.startBlock || 0;
      }

      const unconfirmedBlocks = lastSync.unconfirmedBlocks;
      let streamID = lastSync.nextStreamID;
      if (unconfirmedBlocks.length > 0) {
        fromBlock = lastSync.unconfirmedBlocks[0].number;
      } else {
        if (lastSync.lastToBlock !== 0) {
          fromBlock = lastSync.lastToBlock + 1;
        }
      }

      const latestBlock = await getBlockNumber(this.nodeEndpoint);

      let toBlock = latestBlock;

      if (fromBlock > toBlock) {
        console.log(`no new block yet, skip`);
        this._processing = false;
        return 'no new block yet, skip';
      }

      console.log(`fetching...`);
      const { events: eventsFetched, toBlockUsed: newToBlock } =
        await this.logEventFetcher.getLogEvents({
          fromBlock,
          toBlock: toBlock,
        });
      toBlock = newToBlock;

      const newEvents = await this.filter(eventsFetched);

      console.log({
        latestBlock,
        fromBlock,
        toBlock,
        newEvents: newEvents.length,
      });

      const { eventStream, newLastSync } = await this._generateStreamToAppend(
        newEvents,
        {
          enabled: lastSync?.enabled || false,
          latestBlock,
          lastToBlock: toBlock,
          nextStreamID: streamID,
          unconfirmedBlocks,
        },
      );

      await this.onEventStream(eventStream);

      // We save after eventStream has been processed
      // if onEventStream fails it need to handle this
      this._saveStream(eventStream, newLastSync);

      this._processing = false;
      return 'Done';
    } catch (e: any) {
      this._processing = false;
      return 'Error ' + e.toString();
    }
  }

  async _generateStreamToAppend(
    newEvents: LogEvent[],
    {
      enabled,
      latestBlock,
      lastToBlock,
      unconfirmedBlocks,
      nextStreamID,
    }: LastSync,
  ): Promise<{ eventStream: EventWithId[]; newLastSync: LastSync }> {
    // grouping per block...
    const groups: { [hash: string]: BlockEvents } = {};
    const eventsGroupedPerBlock: BlockEvents[] = [];
    for (const event of newEvents) {
      let group = groups[event.blockHash];
      if (!group) {
        group = groups[event.blockHash] = {
          hash: event.blockHash,
          number: event.blockNumber,
          events: [],
        };
        eventsGroupedPerBlock.push(group);
      }
      group.events.push(event);
    }

    // set up the new entries to be added to the stream
    // const newEventEntries: DurableObjectEntries<LogEvent> = {};
    const eventStream: EventWithId[] = [];

    // find reorgs
    let reorgBlock: EventBlock | undefined;
    let currentIndex = 0;
    for (const block of eventsGroupedPerBlock) {
      if (currentIndex < unconfirmedBlocks.length) {
        const unconfirmedBlockAtIndex = unconfirmedBlocks[currentIndex];
        if (unconfirmedBlockAtIndex.hash !== block.hash) {
          reorgBlock = unconfirmedBlockAtIndex;
          break;
        }
        currentIndex++;
      }
    }

    if (reorgBlock) {
      // re-add event to the stream but flag them as removed
      const lastUnconfirmedBlock =
        unconfirmedBlocks[unconfirmedBlocks.length - 1];
      const unconfirmedEventsMap = await this._getEventsMap(
        reorgBlock.startStreamID,
        lastUnconfirmedBlock.startStreamID + lastUnconfirmedBlock.numEvents,
      );
      if (unconfirmedEventsMap) {
        for (const entry of unconfirmedEventsMap.entries()) {
          const event = entry[1];
          // newEventEntries[`${streamID++}`] = {...event, removed: true};
          eventStream.push({
            streamID: nextStreamID++,
            ...event,
            removed: true,
          });
        }
      }
    }

    const startingBlockForNewEvent = reorgBlock
      ? reorgBlock.number
      : unconfirmedBlocks.length > 0
      ? unconfirmedBlocks[unconfirmedBlocks.length - 1].number + 1
      : eventsGroupedPerBlock.length > 0
      ? eventsGroupedPerBlock[0].number
      : 0; // was undefined // TODO undefined ?

    // new events and new unconfirmed blocks
    const newUnconfirmedBlocks: EventBlock[] = [];
    for (const block of eventsGroupedPerBlock) {
      if (block.events.length > 0 && block.number >= startingBlockForNewEvent) {
        const startStreamID = nextStreamID;
        for (const event of block.events) {
          // newEventEntries[`${streamID++}`] = {...event};
          eventStream.push({ streamID: nextStreamID++, ...event });
        }
        if (latestBlock - block.number <= this.finality) {
          newUnconfirmedBlocks.push({
            hash: block.hash,
            number: block.number,
            numEvents: block.events.length,
            startStreamID,
          });
        }
      }
    }

    return {
      eventStream,
      newLastSync: {
        enabled,
        latestBlock,
        lastToBlock,
        unconfirmedBlocks,
        nextStreamID,
      },
    };
  }

  _saveStream(eventStream: EventWithId[], lastSync: LastSync) {
    let entriesInGroupOf128: Record<string, LogEvent> = {};
    let counter = 0;
    for (const event of eventStream) {
      entriesInGroupOf128[`event_${lexicographicNumber15(event.streamID)}`] =
        event;
      // TODO remove streamID to not waste space ?
      counter++;
      if (counter == 128) {
        this.state.storage.put<LogEvent>(entriesInGroupOf128);
        entriesInGroupOf128 = {};
        counter = 0;
      }
    }
    if (counter > 0) {
      this.state.storage.put<LogEvent>(entriesInGroupOf128);
    }

    this._putLastSync(lastSync);
  }

  private async _reset(data?: ContractData[] | AllContractData) {
    await this.state.storage.deleteAll();
    this.contractsData = undefined;
    this.logEventFetcher = undefined;
    this.reset();

    if (data) {
      await this.state.storage.put<ContractData[] | AllContractData>(
        '_contracts_',
        data,
      );
    }
  }

  async _setupContracts() {
    if (!this.contractsData) {
      this.contractsData = await this.state.storage.get<ContractData[]>(
        '_contracts_',
      );
      if (this.contractsData) {
        this.logEventFetcher = new LogEventFetcher(
          this.nodeEndpoint,
          this.contractsData,
        );
      }
    }
  }

  async _setAlarmDelta(delta: number): Promise<void> {
    const alarmTime = Date.now() + delta;
    console.log(`ALARM DELTA: ${delta / 1000}s`);
    await this._setAlarm(alarmTime);
  }
  async _setAlarm(alarmTime: number): Promise<void> {
    console.log(`ALARM TIME: ${alarmTime}`);
    const existingAlarm = await this.state.storage.getAlarm();
    console.log(`EXISTING ALARM: ${existingAlarm}`);
    if (existingAlarm) {
      console.log(`DELETING ALARM`);
      await this.state.storage.deleteAlarm();
    }
    console.log(`SETTING ALAR`);
    await this.state.storage.setAlarm(alarmTime);
    console.log(`ALARM SET`);
  }

  async _getEventsMap(
    start: number,
    limit: number,
  ): Promise<Map<string, LogEvent> | undefined> {
    if (start < 0) {
      const lastSync = await this._getLastSync();
      if (lastSync.nextStreamID === 1) {
        start = 0;
      } else {
        start = Math.max(0, lastSync.nextStreamID + start);
      }
    }
    return this.state.storage.list<LogEvent>({
      start: `event_${lexicographicNumber15(start)}`,
      limit,
    });
  }

  async _getLastSync(): Promise<LastSync> {
    return (
      (await this.state.storage.get<LastSync>(`_sync_`)) || {
        enabled: false,
        latestBlock: 0,
        lastToBlock: 0,
        unconfirmedBlocks: [],
        nextStreamID: 1,
      }
    );
  }

  async _putLastSync(lastSync: LastSync): Promise<void> {
    await this.state.storage.put<LastSync>(`_sync_`, lastSync);
  }
}
