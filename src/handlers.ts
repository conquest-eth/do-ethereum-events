import { fetchGlobalDO, handleOptions, pathFromURL } from './utils/request';

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
      const { patharray, firstPath } = pathFromURL(request.url);
      switch (firstPath) {
        case '':
          // TODO debug UI onoy, main site would be a static website served elsewhere
          return new Response('hello');
        case 'events':
          switch (patharray[1]) {
            case 'setup':
              return fetchGlobalDO(env.EVENT_LIST, request, 'setup');
            case 'list':
              return fetchGlobalDO(env.EVENT_LIST, request, 'getEvents');
            case 'websocket':
              return fetchGlobalDO(env.EVENT_LIST, request, 'websocket');
          }
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (err) {
      return new Response((err as any).toString());
    }
  },
};
