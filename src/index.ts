import { BaseEventList } from './BaseEventList';
import workerHandlers from './handlers';
import { WebSocketEventList } from './implementations/WebSocketEventList';

export async function handleRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
) {
  return workerHandlers.fetch(request, env, ctx);
}

const worker: ExportedHandler<Env> = { fetch: handleRequest };

// export { VoidEventList as EventList} from './lib/implementations/VoidEventList'
export { WebSocketEventList as EventList } from './implementations/WebSocketEventList';

BaseEventList.interval = 6;

// export worker
export default worker;
