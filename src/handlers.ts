import {
  fetchGlobalDO,
  getGlobalDO,
  handleOptions,
  pathFromURL,
} from './utils/request';
import { spaceOutGetRequestOptimisitcaly } from './utils/time';

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx?: ExecutionContext,
  ): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }
    try {
      const { patharray } = pathFromURL(request.url);
      switch (patharray[0]) {
        case '':
          // TODO debug UI onoy, main site would be a static website served elsewhere
          return new Response('hello');
        case 'events':
          return fetchGlobalDO(env.ETHEREUM_EVENTS, request);
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (err) {
      return new Response((err as any).toString());
    }
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    // NOTE : it is better to do the setTimeout in the Durable Object itself to reduce billed DO invocation
    //  and actually the best is alarm, see : https://github.com/cloudflare/miniflare/issues/290#issuecomment-1160920429
    // 60 seconds is the minimal duration of a CRON job
    await spaceOutGetRequestOptimisitcaly(
      getGlobalDO(env.ETHEREUM_EVENTS),
      'http://localhost/events/process',
      { interval: 9, duration: 59 },
    );
    console.log('SCHEDULED DONE');
    // await getGlobalDO(env.ETHEREUM_EVENTS).fetch('http://localhost/process');
  },
};
