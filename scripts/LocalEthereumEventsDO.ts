import { EthereumEventsDO, EventWithId } from '../src/EthereumEventsDO';
const process = (globalThis as any).process;

export class LocalEthereumEventsDO extends EthereumEventsDO {
  constructor() {
    const localState = {
      storage: {
        get() {},
        put() {},
        list() {},
      },
    };

    super(
      localState as any,
      {
        ETHEREUM_EVENTS: undefined, //TODO
        ENVIRONMENT: 'unknown',
        ETHEREUM_NODE: process.env.ETHEREUM_NODE,
      } as any,
    );
  }

  fetchAndProcess(): Promise<string> {
    return this._fetchAndProcess();
  }

  async onEventStream(eventStream: EventWithId[]) {
    console.log(eventStream.length);
  }
}
