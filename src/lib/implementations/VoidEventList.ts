import { BaseEventList, EventWithId } from '../BaseEventList';

export class VoidEventList extends BaseEventList {
  onEventStream(eventStream: EventWithId[]) {}
}
