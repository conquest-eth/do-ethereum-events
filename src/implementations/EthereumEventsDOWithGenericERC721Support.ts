import { createER721Filter, send } from '@/utils/ethereum';
import { EthereumEventsDO, LogEvent } from '../EthereumEventsDO';

export abstract class EthereumEventsDOWithGenericERC721Support extends EthereumEventsDO {
  sessions: any[] = [];

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  protected erc721Filter?: (eventsFetched: LogEvent[]) => Promise<LogEvent[]>;
  async filter(eventsFetched: LogEvent[]): Promise<LogEvent[]> {
    // automatically detect ERC721 generic
    if (!Array.isArray(this.contractsData)) {
      if (this.contractsData?.eventsABI.find((v) => v.name === 'Transfer')) {
        if (!this.erc721Filter) {
          this.erc721Filter = createER721Filter(this.env.ETHEREUM_NODE, {
            skipUnParsedEvents: true,
          });
        }
        return this.erc721Filter(eventsFetched);
      }
    }
    return eventsFetched;
  }
}
