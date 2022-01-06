import { BaseEventList } from '../../BaseEventList'
import { LogEvent } from '../utils'

export class VoidEventList extends BaseEventList {
  onNewEventEntries(newEventEntries: DurableObjectEntries<LogEvent>) {}
}
