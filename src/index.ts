import { EthereumEventsDO } from './EthereumEventsDO';
import workerHandlers from './handlers';

export async function handleRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
) {
  return workerHandlers.fetch(request, env, ctx);
}

const worker: ExportedHandler<Env> = { fetch: handleRequest };

// export { VoidEthereumEventsDO as EthereumEventsDO} from './lib/implementations/VoidEthereumEventsDO'
export { WebSocketEthereumEventsDO as EthereumEventsDO } from './implementations/WebSocketEthereumEventsDO';
EthereumEventsDO.alarm = { interval: 6 };

// export worker
export default worker;
