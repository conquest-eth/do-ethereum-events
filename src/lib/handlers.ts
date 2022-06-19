import { handleErrors, InvalidMethod, UnknownRequestType } from './errors';
import { corsHeaders } from './utils';

const BASE_URL = 'http://127.0.0.1';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

async function _scheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
) {
  const id = env.EVENT_LIST.idFromName('A');
  const obj = env.EVENT_LIST.get(id);
  if (event.cron === '* * * * *') {
    console.log(`processEvents at ${event.scheduledTime} ...`);
    ctx.waitUntil(obj.fetch(`${BASE_URL}/processEvents`));
  }
}

function sleep_then_schedule(
  seconds: number,
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
) {
  const miliseconds = 1000 * seconds;
  const modifiedEvent = { ...event };
  modifiedEvent.scheduledTime = event.scheduledTime + miliseconds;
  if (seconds === 0) {
    console.log(`first sync`);
    _scheduled(modifiedEvent as ScheduledEvent, env, ctx);
  } else {
    console.log(
      `seconds: ${seconds}, timestamp : ${modifiedEvent.scheduledTime}`,
    );
    return sleep(miliseconds).then(() =>
      _scheduled(modifiedEvent as ScheduledEvent, env, ctx),
    );
  }
}

export const handlers = (options: {
  interval: number;
  functions: { POST: string[]; GET: string[] };
}) => {
  async function handleRequest(request: Request, env: Env): Promise<Response> {
    const id = env.EVENT_LIST.idFromName('A');
    const obj = env.EVENT_LIST.get(id);

    const functions = options.functions;

    const url = new URL(request.url);
    const method = request.method;
    if (url.pathname === '/') {
      return new Response('hello');
    }
    const path = url.pathname.substr(1).split('/');
    const fnc = path[0];

    const found = (functions as any)[method].indexOf(fnc) !== -1;

    console.log({ found, method });
    if (found) {
      let resp = await obj.fetch(url.toString(), request);
      return resp;
    }
    return UnknownRequestType();
  }

  if (options.interval > 60) {
    // TODO
    throw new Error(
      `interval to big, need to be equal or smaller than 60, but note that 30 < x <= 60 means one process per cron`,
    );
  } else if (options.interval > 30) {
    console.warn(
      `with interval > 30 seconds, the interval will basically be 60 seconds`,
    );
  } else if (60 / options.interval !== Math.floor(60 / options.interval)) {
    console.warn(
      `interval is not a diviser of 60, this means that a bigger gap will happen at the end of the cron process (before the next one).`,
    );
  }

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      return await handleErrors(request, async () => {
        if (request.method === 'OPTIONS') {
          return handleOptions(request);
        }
        const response = await handleRequest(request, env);
        return response;
      });
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
      const processes = [];

      for (
        let delay = 0;
        delay <= 60 - options.interval;
        delay += options.interval
      ) {
        processes.push(sleep_then_schedule(delay, event, env, ctx));
      }
      await Promise.all(processes);
    },
  };
};
