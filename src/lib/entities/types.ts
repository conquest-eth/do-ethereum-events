import { Type, Static } from '@sinclair/typebox'
export const TAddress = Type.RegEx(/^0x[a-fA-F0-9]{40}$/)

export const LogSchema = Type.Object({
  blockNumber: Type.Number(),
  blockHash: Type.String(),
  transactionIndex: Type.Number(),
  removed: Type.Boolean(),
  address: TAddress,
  data: Type.String(),
  topics: Type.Array(Type.String()),
  transactionHash: Type.String(),
  logIndex: Type.Number(),
})
export type Log = Static<typeof LogSchema>

export const EventResultSchema = Type.Record(Type.String(), Type.Any())
export type EventResult = Static<typeof EventResultSchema>

export const LogEventSchema = Type.Intersect([
  LogSchema,
  Type.Object({
    event: Type.Optional(Type.String()),
    eventSignature: Type.Optional(Type.String()),
    args: Type.Optional(EventResultSchema),
    decodeError: Type.Optional(Type.Any()),
  }),
])
export type LogEvent = Static<typeof LogEventSchema>

export const EventBlockSchema = Type.Object({
  number: Type.Number(),
  hash: Type.String(),
  startStreamId: Type.Number(),
  numEvents: Type.Number(),
})

export type EventBlock = Static<typeof EventBlockSchema>

export const LastSyncSchema = Type.Object({
  latestBlock: Type.Number(),
  lastToBlock: Type.Number(),
  unconfirmedBlocks: Type.Array(EventBlockSchema),
  nextStreamID: Type.Number(),
})
export type LastSync = Static<typeof LastSyncSchema>

export const EventWithIdSchema = Type.Intersect([
  LogEventSchema,
  Type.Object({
    streamId: Type.Number(),
  }),
])
export type EventWithId = Static<typeof EventWithIdSchema>

export const BlockEventsSchema = Type.Object({
  hash: Type.String(),
  number: Type.Number(),
  events: Type.Array(LogEventSchema),
})
export type BlockEvents = Static<typeof BlockEventsSchema>

export const ContractDataSchema = Type.Object({
  eventsABI: Type.Array(Type.Any()),
  address: TAddress,
  startBlock: Type.Optional(Type.Number()),
})
export type ContractData = Static<typeof ContractDataSchema>
