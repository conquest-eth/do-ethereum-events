import { Contract, ethers } from 'ethers'
import { ajv, Logger, LogLevel } from '../../utils'
import {
  ContractData,
  ContractDataSchema,
  BlockEvents,
  EventWithId,
  EventBlock,
} from '../entities'
import { getLogEvents } from '../helpers'

function lexicographicNumber15(num: number): string {
  return num.toString().padStart(15, '0')
}

const DEFAULT_CONFIRMATIONS = 12
const DEFAULT_MAX_BLOCK_RANGE = 10000

export abstract class BaseEventListener {
  logger: Logger
  provider: ethers.providers.JsonRpcProvider
  contractsData: ContractData[] = []
  contracts: Contract[] = []
  confirmations: number
  maxBlockRange: number
  unconfirmedBlocks: EventBlock[] = []

  constructor(
    rpcEndpoint: string,
    logLevel?: LogLevel,
    confirmations?: number,
    maxBlockRange?: number,
  ) {
    this.logger = new Logger({
      level: logLevel ?? 'info',
      name: BaseEventListener.name,
    })
    this.provider = new ethers.providers.JsonRpcProvider(rpcEndpoint)
    this.confirmations = confirmations ?? DEFAULT_CONFIRMATIONS
    this.maxBlockRange = maxBlockRange ?? DEFAULT_MAX_BLOCK_RANGE
  }

  public setup(contractsData: ContractData[], reset = false): boolean {
    try {
      if (reset) {
        this.contracts = []
        this.contractsData = []
      }

      for (const contractData of contractsData) {
        const validate = ajv.compile(ContractDataSchema)
        const valid = validate(contractData)
        if (!valid) {
          throw new Error(
            validate.errors
              ?.map((err: unknown) => JSON.stringify(err, null, 2))
              .join(','),
          )
        }

        this.contractsData.push(contractData)
        this.contracts.push(
          new Contract(
            contractData.address,
            contractData.eventsABI,
            this.provider,
          ),
        )
      }

      return true
    } catch (e: unknown) {
      this.logger.error('Setup contracts failed!', {
        reset,
        contracts: contractsData.map(
          (contract) => (contract.address, contract.startBlock),
        ),
        error: e,
      })
      return false
    }
  }

  async processEvents(
    fromBlock: number,
    numberOfBlocks?: number,
  ): Promise<Response> {
    let streamID = 0
    let startBlock = 0
    for (const contractData of this.contractsData) {
      if (contractData.startBlock) {
        if (fromBlock === 0) {
          startBlock = contractData.startBlock
        } else if (contractData.startBlock < fromBlock) {
          startBlock = contractData.startBlock
        }
      }
    }

    this.logger.info(`Fetching the events...`, { fromBlock, startBlock })
    const latestBlock = await this.provider.getBlockNumber()
    const toBlock = Math.min(latestBlock, fromBlock + this.maxBlockRange)
    const newEvents = await getLogEvents(this.provider, this.contracts, {
      fromBlock: startBlock,
      toBlock,
    })
    this.logger.debug(`Fetching new events done`, { length: newEvents.length })

    // Grouping the blocks
    const groups: { [hash: string]: BlockEvents } = {}
    const eventsGroupedPerBlock: BlockEvents[] = []
    for (const event of newEvents) {
      let group = groups[event.blockHash]
      if (!group) {
        group = groups[event.blockHash] = {
          hash: event.blockHash,
          number: event.blockNumber,
          events: [],
        }
        eventsGroupedPerBlock.push(group)
      }
      group.events.push(event)
    }

    // set up the new entries to be added to the stream
    // const newEventEntries: DurableObjectEntries<LogEvent> = {};
    const eventStream: EventWithId[] = []

    // find reorgs
    let reorgBlock: EventBlock | undefined
    let currentIndex = 0
    for (const block of eventsGroupedPerBlock) {
      if (currentIndex < this.unconfirmedBlocks.length) {
        const unconfirmedBlockAtIndex = this.unconfirmedBlocks[currentIndex]
        if (unconfirmedBlockAtIndex.hash !== block.hash) {
          reorgBlock = unconfirmedBlockAtIndex
          break
        }
        currentIndex++
      }
    }

    if (reorgBlock) {
      // re-add event to the stream but flag them as removed
      const lastUnconfirmedBlock =
        this.unconfirmedBlocks[this.unconfirmedBlocks.length - 1]
      const unconfirmedEventsMap = await this._getEventsMap(
        reorgBlock.startStreamId,
        lastUnconfirmedBlock.startStreamId + lastUnconfirmedBlock.numEvents,
      )
      if (unconfirmedEventsMap) {
        for (const entry of unconfirmedEventsMap.entries()) {
          const event = entry[1]
          eventStream.push({ streamID: streamID++, ...event, removed: true })
        }
      }
    }

    const startingBlockForNewEvent = reorgBlock
      ? reorgBlock.number
      : unconfirmedBlocks.length > 0
      ? unconfirmedBlocks[unconfirmedBlocks.length - 1].number + 1
      : eventsGroupedPerBlock.length > 0
      ? eventsGroupedPerBlock[0].number
      : undefined

    // new events and new unconfirmed blocks
    const newUnconfirmedBlocks: EventBlock[] = []
    for (const block of eventsGroupedPerBlock) {
      if (block.events.length > 0 && block.number >= startingBlockForNewEvent) {
        const startStreamID = streamID
        for (const event of block.events) {
          // newEventEntries[`${streamID++}`] = {...event};
          eventStream.push({ streamID: streamID++, ...event })
        }
        if (latestBlock - block.number <= this.confirmations) {
          newUnconfirmedBlocks.push({
            hash: block.hash,
            number: block.number,
            numEvents: block.events.length,
            startStreamID,
          })
        }
      }
    }

    let entriesInGroupOf128: DurableObjectEntries<LogEvent> = {}
    let counter = 0
    for (const event of eventStream) {
      entriesInGroupOf128[`event_${lexicographicNumber15(event.streamID)}`] =
        event
      delete event.streamID
      counter++
      if (counter == 128) {
        this.state.storage.put<LogEvent>(entriesInGroupOf128)
        entriesInGroupOf128 = {}
        counter = 0
      }
    }
    if (counter > 0) {
      this.state.storage.put<LogEvent>(entriesInGroupOf128)
    }

    this._putLastSync({
      latestBlock,
      lastToBlock: toBlock,
      unconfirmedBlocks: newUnconfirmedBlocks,
      nextStreamID: streamID,
    })

    this.onEventStream(eventStream)

    return createResponse({ success: true })
  }

  abstract onEventStream(eventStream: EventWithId[])
}
