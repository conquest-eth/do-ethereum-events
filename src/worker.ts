import { EthereumEventsDO } from './EthereumEventsDO';
import workerHandlers from './handlers';

const worker: ExportedHandler<Env> = {
  fetch: workerHandlers.fetch,
  scheduled: workerHandlers.scheduled,
};

// export { VoidEthereumEventsDO as EthereumEventsDO} from './lib/implementations/VoidEthereumEventsDO'
export { WebSocketEthereumEventsDO as EthereumEventsDO } from './implementations/WebSocketEthereumEventsDO';
// EthereumEventsDO.alarm = { interval: 6 };
EthereumEventsDO.alarm = null;
// EthereumEventsDO.scheduled = { interval: 6 };

// export worker
export default worker;
