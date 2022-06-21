import { send } from '@/utils/ethereum';
import { EthereumEventsDO, LogEvent } from '../EthereumEventsDO';

export abstract class EthereumEventsDOWithGenericERC721Support extends EthereumEventsDO {
  sessions: any[] = [];

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async filter(eventsFetched: LogEvent[]): Promise<LogEvent[]> {
    // automatically detect ERC721 generic
    if (!Array.isArray(this.contractsData)) {
      if (this.contractsData?.eventsABI.find((v) => v.name === 'Transfer')) {
        return this.erc721Filter(eventsFetched);
      }
    }
    return eventsFetched;
  }

  protected erc721Contracts: { [address: string]: boolean } = {};
  protected async erc721Filter(eventsFetched: LogEvent[]): Promise<LogEvent[]> {
    // return eventsFetched;
    const events = [];
    for (const event of eventsFetched) {
      const inCache = this.erc721Contracts[event.address.toLowerCase()];
      if (inCache === true) {
        events.push(event);
        continue;
      } else if (inCache === false) {
        continue;
      }

      console.log(
        `new contract found : ${event.address}, checking support for erc721...`,
      );
      // const contract = new Contract(
      //   event.address,
      //   [
      //     {
      //       inputs: [
      //         { internalType: 'bytes4', name: '_interfaceId', type: 'bytes4' },
      //       ],
      //       name: 'supportsInterface',
      //       outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      //       stateMutability: 'view',
      //       type: 'function',
      //     },
      //   ],
      //   this.provider,
      // );
      let supportsERC721 = false;
      try {
        // supportsERC721 = await contract.callStatic.supportsInterface(
        //   '0x80ac58cd',
        //   { blockTag: event.blockHash },
        // );

        const response: string = await send<any, string>(
          this.nodeEndpoint,
          'eth_call',
          [
            {
              to: event.address,
              data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
            },
            { blockHash: event.blockHash },
          ],
        );
        // TODO check other condition where a non-zero value would not include a one and still be interpreted as a bool
        supportsERC721 = response.indexOf('1') != -1;

        // console.log({ supportsERC721 });
      } catch (err) {
        // console.error('ERR', err);
      }
      // TODO store in Durable Object Storage ?
      this.erc721Contracts[event.address.toLowerCase()] = supportsERC721;

      if (supportsERC721) {
        console.log(`!! contract ${event.address} support ERC721`);
      } else {
        console.log(`contract ${event.address} does not support ERC721`);
      }

      if (supportsERC721) {
        events.push(event);
      }
    }
    return events;
  }
}
