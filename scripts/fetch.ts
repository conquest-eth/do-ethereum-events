import 'isomorphic-fetch';
import { EventBlock, LastSync, LogEvent } from '../src/EthereumEventsDO';
import {
  createER721Filter,
  getBlockNumber,
  LogEventFetcher,
} from '../src/utils/ethereum';
import { LocalEthereumEventsDO } from './LocalEthereumEventsDO';

const process = (globalThis as any).process;

function lexicographicNumber15(num: number): string {
  return num.toString().padStart(15, '0');
}

const args = process.argv.slice(2);
const dataFilepath = args[0];
const folder = args[1];

if (!folder) {
  console.error(`need to specify folder as second arg`);
  process.exit(1);
}

async function main() {
  const fsName = 'fs';
  const fs = await import(fsName);
  const dataFromFile = JSON.parse(fs.readFileSync(dataFilepath).toString());

  try {
    fs.mkdirSync(folder);
  } catch (e) {}

  const endpoint = process.env.ETHEREUM_NODE;

  const logEventFetcher = new LogEventFetcher(endpoint, dataFromFile);

  const erc721Filter = createER721Filter(endpoint);

  async function fetchAndProcess(
    endpoint: string,
    counter: number,
  ): Promise<{ newCounter: number; message?: string; code?: number }> {
    let lastSync: LastSync;
    try {
      lastSync = JSON.parse(
        fs.readFileSync(folder + '/lastSync.json').toString(),
      );
    } catch (e) {
      console.error(e);
      lastSync = {
        enabled: true,
        lastToBlock: 0,
        latestBlock: 0,
        nextStreamID: 1,
        unconfirmedBlocks: [],
      };
    }
    let streamID = lastSync.nextStreamID;

    let fromBlock = 0;

    if (Array.isArray(dataFromFile)) {
      for (const contractData of dataFromFile) {
        if (contractData.startBlock) {
          if (fromBlock === 0) {
            fromBlock = contractData.startBlock;
          } else if (contractData.startBlock < fromBlock) {
            fromBlock = contractData.startBlock;
          }
        }
      }
    } else {
      fromBlock = dataFromFile.startBlock || 0;
    }

    // skip unconfirmed blocks as we use final blocks only, see -12
    if (lastSync.lastToBlock !== 0) {
      fromBlock = lastSync.lastToBlock + 1;
    }

    const latestBlock = await getBlockNumber(endpoint);

    let toBlock = latestBlock - 12; // final only, // TODO configure

    if (fromBlock > toBlock) {
      console.log(`no new block yet, skip`);
      fs.writeFileSync(
        folder + `/lastSync.json`,
        JSON.stringify({
          enabled: true,
          latestBlock,
          lastToBlock: toBlock,
          nextStreamID: streamID,
          unconfirmedBlocks: [],
        }),
      );
      return {
        newCounter: counter,
        message: 'no new block yet, skip',
        code: 1111,
      };
    }

    console.log(`fetching...`);
    const { events: eventsFetched, toBlockUsed: newToBlock } =
      await logEventFetcher.getLogEvents({
        fromBlock,
        toBlock: toBlock,
      });
    toBlock = newToBlock;

    const newEvents = await erc721Filter(eventsFetched);

    if (newEvents.length == 0) {
      fs.writeFileSync(
        folder + `/lastSync.json`,
        JSON.stringify({
          enabled: true,
          latestBlock,
          lastToBlock: toBlock,
          nextStreamID: streamID,
          unconfirmedBlocks: [],
        }),
      );
      return { newCounter: counter, message: 'No Events' };
    }

    const eventStream = [];
    for (const event of newEvents) {
      eventStream.push({ ...event, streamID });
      streamID++;
    }

    const filename = `events_${lexicographicNumber15(
      lastSync.nextStreamID,
    )}_${lexicographicNumber15(streamID - 1)}.json`;
    fs.writeFileSync(folder + `/${filename}`, JSON.stringify(eventStream));
    fs.writeFileSync(
      folder + `/lastSync.json`,
      JSON.stringify({
        enabled: true,
        latestBlock,
        lastToBlock: toBlock,
        nextStreamID: streamID,
        unconfirmedBlocks: [],
      }),
    );
    return { newCounter: counter + 1 };
  }

  let done = false;
  const files = fs.readdirSync(folder);
  const eventFiles = files.filter((v: string) => v.startsWith('events_'));
  let counter = 0;
  if (eventFiles.length > 0) {
    const lastEventFile = eventFiles[eventFiles.length - 1];
    const underscoreIndex = lastEventFile.indexOf('_');
    const dotIndex = lastEventFile.indexOf('.');
    const substr = lastEventFile.substring(underscoreIndex + 1, dotIndex);
    counter = parseInt(substr);
  }
  while (!done) {
    const result = await fetchAndProcess(endpoint, counter);
    if (result.message) {
      console.log(result);
    }
    if (result.code === 1111) {
      done = true;
    }
    counter = result.newCounter;
  }
}
main();
