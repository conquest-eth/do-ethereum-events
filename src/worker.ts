import { EthereumEventsDO } from './EthereumEventsDO';
import workerHandlers from './handlers';

// export for tests
export async function handleRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
) {
  return workerHandlers.fetch(request, env, ctx);
}

const worker: ExportedHandler<Env> = {
  fetch: handleRequest,
  // scheduled: workerHandlers.scheduled,
};

// export { VoidEthereumEventsDO as EthereumEventsDO} from './lib/implementations/VoidEthereumEventsDO'
// export { WebSocketEthereumEventsDO as EthereumEventsDO } from './implementations/WebSocketEthereumEventsDO';
export { EthereumEventsStore as EthereumEventsDO } from './implementations/EthereumEventsStore';
// EthereumEventsDO.alarm = { interval: 6 };
EthereumEventsDO.alarm = { interval: 6, individualCall: true };
// EthereumEventsDO.alarm = null;
// EthereumEventsDO.scheduled = { interval: 6 };
// EthereumEventsDO.scheduled = {interval: 0};

// export worker
export default worker;
