import {InvalidMethod, UnknownRequestType} from './errors';
import type {Env, CronTrigger} from './types';
import {corsHeaders} from './utils';

const BASE_URL = 'http://127.0.0.1';

// In order for the workers runtime to find the class that implements
// our Durable Object namespace, we must export it from the root module.
export {EventList} from './EventList';

function handleOptions(request: Request) {
  if (
    request.headers.get('Origin') !== null &&
    request.headers.get('Access-Control-Request-Method') !== null &&
    request.headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Handle CORS pre-flight request.
    return new Response(null, {
      headers: corsHeaders,
    });
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        Allow: 'GET, HEAD, POST, OPTIONS',
      },
    });
  }
}

function sleep(ms): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}



export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    try {
      const response = await handleRequest(request, env);
      return response;
    } catch (e: unknown) {
      // console.error('ERROR', e);
      const message = (e as {message: string}).message;
      if (message) {
        return new Response(message);
      } else {
        return new Response(e as string);
      }
    }
  },

  sleep_then_schedule(seconds: number, event, env, ctx): Promise<void> {
    const miliseconds = 1000 * seconds;
    const modifiedEvent = {...event};
    modifiedEvent.scheduledTime += miliseconds;
    return sleep(miliseconds).then(() => this._scheduled(event, env, ctx));
  },

  async _scheduled(event, env, ctx) {
    const id = env.EVENT_LIST.idFromName('A');
    const obj = env.EVENT_LIST.get(id);
    if (event.cron === '* * * * *') {
      console.log(`processEvents at ${event.scheduledTime} ...`);
      event.waitUntil(obj.fetch(`${BASE_URL}/processEvents`));
    }
  },

  async scheduled(event, env, ctx) {
    await Promise.all([ // every 10 seconds
      this.sleep_then_schedule(0, event, env, ctx),
      this.sleep_then_schedule(10, event, env, ctx),
      this.sleep_then_schedule(20, event, env, ctx),
      this.sleep_then_schedule(30, event, env, ctx),
      this.sleep_then_schedule(40, event, env, ctx),
      this.sleep_then_schedule(50, event, env, ctx),
    ]);
  }
};

const functions = {GET:['getEvents']};

async function handleRequest(request: Request, env: Env): Promise<Response> {

  const id = env.EVENT_LIST.idFromName('A');
  const obj = env.EVENT_LIST.get(id);

  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.substr(1).split('/');
  const fnc = path[0];

  const found = functions[method].indexOf(fnc) >= 0;
  if (found) {
    let resp = await obj.fetch(url.toString(), request);
    return resp;
  }
  return UnknownRequestType();
}
