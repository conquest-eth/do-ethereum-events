import { fetchGlobalDO, handleOptions, pathFromURL } from './utils/request';

export function handlerForEventDO(
  DO: DurableObjectNamespace,
  { basePath }: { basePath?: string },
) {
  if (!basePath) {
    basePath = 'events';
  }
  return function (request: Request) {
    const { patharray, firstPath } = pathFromURL(request.url);
    switch (firstPath) {
      case basePath:
        switch (patharray[1]) {
          case 'list':
            if (request.method === 'OPTIONS') {
              return handleOptions(request);
            }
            return fetchGlobalDO(DO, request, 'getEvents');
          case 'websocket':
            if (request.method === 'OPTIONS') {
              return handleOptions(request);
            }
            return fetchGlobalDO(DO, request, 'websocket');
        }
    }
  };
}
