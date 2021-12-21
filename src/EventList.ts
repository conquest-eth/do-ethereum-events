import {ethers} from 'ethers';
import type {Env} from './types';
import {DO} from './DO';
import { createResponse } from './utils';

// needed because of : https://github.com/cloudflare/durable-objects-typescript-rollup-esm/issues/3
type State = DurableObjectState & {blockConcurrencyWhile: (func: () => Promise<void>) => void};

function lexicographicNumber15(num: number): string {
  return num.toString().padStart(15, '0');
}

export class EventList extends DO {
  provider: ethers.providers.JsonRpcProvider;
  
  constructor(state: State, env: Env) {
    super(state, env);
    this.provider = new ethers.providers.JsonRpcProvider(env.ETHEREUM_NODE);
  }

  async getEvents(path: string[]): Promise<Response> {
    const start = parseInt(path[0]);
    const limit = parseInt(path[1]);
    const eventsMap = (await this.state.storage.list({start: `event_${lexicographicNumber15(start)}`, limit})) as
      | Map<string, Event>
      | undefined;
    const events = [];
    if (eventsMap) {
      for (const entry of eventsMap.entries()) {
        const eventID = entry[0];
        const event = entry[1];
        events.push({id: eventID, ...event}); // TODO not needed if event contains its own id
      }
    }

    return createResponse({events, success: true});
  }


  async processEvents(path: string[]): Promise<Response> {
    // TODO
    return createResponse({success: true});
  }
}
