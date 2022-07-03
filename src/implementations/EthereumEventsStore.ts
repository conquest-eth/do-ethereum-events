import {
  createJSONResponse,
  parseGETParams,
  pathFromURL,
} from '@/utils/request';
import { EventWithId } from '../EthereumEventsDO';
import { EthereumEventsDOWithGenericERC721Support } from './EthereumEventsDOWithGenericERC721Support';
import { JSONDB } from '../../lib/do-json-db/src/index';

export class EthereumEventsStore extends EthereumEventsDOWithGenericERC721Support {
  protected store: JSONDB;
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.store = new JSONDB(state.storage);
  }

  async query(json: any): Promise<Response> {
    const result = await this.store.query('Token', json);
    return createJSONResponse({ result, success: true });
  }

  async onEventStream(eventStream: EventWithId[]) {
    for (const event of eventStream) {
      if (event.name === 'Transfer') {
        if (event.args) {
          const from = event.args[0] as string;
          const to = event.args[1] as string;
          const id = event.args[2] as string;
          const token = {
            id,
            typeName: 'Token',
            owner: to,
          };
          // console.log(token);
          this.store.put(token);
        }
      }
    }
  }

  async fetch(request: Request) {
    const { patharray } = pathFromURL(request.url);
    const params = parseGETParams(request.url);
    switch (patharray[patharray.length - 1]) {
      case 'query': {
        let json;
        if (request.method == 'POST' || request.method == 'PUT') {
          try {
            json = await request.json();
          } catch (e) {
            json = undefined;
          }
        }
        return this.query(json || params);
      }
      case 'get': {
        if (params['typeName']) {
          return createJSONResponse({
            result: await this.store.getFromType(
              params['typeName'] as string,
              params['id'] as string,
            ),
            success: true,
          });
        } else {
          return createJSONResponse({
            result: await this.store.get(params['id'] as string),
            success: true,
          });
        }
      }
      default: {
        return super.fetch(request);
      }
    }
  }
}
