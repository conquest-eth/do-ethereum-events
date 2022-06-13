import { BigNumber, Contract, providers, utils } from 'ethers'
import { deepCopy } from 'ethers/lib/utils'
import { LogEvent, Log } from '../entities'

/**
 * Gets the log events from the provider for the specified contracts within the given blocks
 *
 * @param provider - The RPC provider
 * @param contracts - The array of contracts you're gonna get the events for
 * @param options - The option to specify the startBlock and endBlock
 *
 * @return - The array of log events
 */
export const getLogEvents = async (
  provider: providers.JsonRpcProvider,
  contracts: Contract[],
  options: { fromBlock: number; toBlock: number },
): Promise<LogEvent[]> => {
  const logEvents: LogEvent[] = []
  try {
    const logs: Log[] = await provider.send('eth_getLogs', [
      {
        address: contracts.map((v) => v.address),
        fromBlock: BigNumber.from(options.fromBlock).toHexString(),
        toBlock: BigNumber.from(options.toBlock).toHexString(),
      },
    ])

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i]
      const eventAddress = utils.getAddress(log.address)
      const correspondingContract = contracts.find(
        (v) => v.address.toLowerCase() === eventAddress.toLowerCase(),
      )
      if (correspondingContract) {
        let event: LogEvent = <LogEvent>deepCopy(log)
        try {
          const parsed = correspondingContract.interface.parseLog(log)
          if (parsed) {
            event.args = parsed.args
            event.event = parsed.name
            event.eventSignature = parsed.signature

            logEvents.push(event)
          }
        } catch (e: unknown) {
          console.error(`Parsing the log failed!`, e)
        }
      } else {
        globalThis.logger &&
          globalThis.logger.error(`unknown contract: ${eventAddress}`)
      }
    }
  } catch (e: unknown) {
    console.error(`Getting the log events failed!`, e)
  }

  return logEvents
}
