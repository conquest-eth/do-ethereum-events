import { EthereumEventsDO, EventWithId } from '../EthereumEventsDO';

export class VoidEthereumEventsDO extends EthereumEventsDO {
  async onEventStream(eventStream: EventWithId[]) {}
}
