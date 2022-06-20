import { EthereumEventsDO, EventWithId } from '../EthereumEventsDO';

export class VoidEthereumEventsDO extends EthereumEventsDO {
  onEventStream(eventStream: EventWithId[]) {}
}
