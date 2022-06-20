# An ethereum event stream

## Use

### install

`npm i ethereum-event-do`

### extend BaseEventList and implement `onEventStream`

```typescript
/// MyEventList.ts
import { BaseEventList, EventWithId } from 'ethereum-event-do';

export class MyEventList extends BaseEventList {

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  onEventStream(eventStream: EventWithId[]) {
    // TODO whatever you want
  }

  // optionaly you can add more endpoint, like a normal DO
  async fetch(request: Request) {
    ...
  }

}

```

Example: [the websocket implementation](src/implementations/WebSocketEventList.ts)

### hook it up in the worker

Indeed, as a Durable Object you still need to hook its request from the worker like so for example:

```typescript
/// index.ts
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    switch (new URL(request.url).pathname) {
      case 'events/setup':
      case 'events/list':
        // we only need one DO so we use _GLOBAL_ id
        const namespace = env.EVENT_LIST;
        const DO = namespace.get(namespace.idFromName('_GLOBAL_'));

        return DO.fetch(request);
      }
      default:
        return new Response('Not found', { status: 404 });
    }
  },
};


export { MyEventList as EventList } from './MyEventList';
```

This is just for demonstration purpose, admin checks need to be set for `setup`

- `setup` expect to be called once with the contract data. then the durable object will call itself and fetch the events for these, store then and call `onEventStream`
- `list` is simply a getter to fetch the event, you might not want to expose it. it accept 2 get param `start` and `limit`

You also need to export its class (as shown above) and declare it in the wrangler.toml (See cloudflare doc)

for example:

```toml
...
[durable_objects]
bindings = [{name = "EVENT_LIST", class_name = "EventList"}]
...
```

## Development

### install dev env

```sh
pnpm i
```

### Websocket tests

To test

in one console:

```sh
pnpm dev
```

in another :

```
pnpm ts-node scripts/test.ts
```

then you can use a websocket tool (like https://chrome.google.com/webstore/detail/websocket-test-client/fgponpodhbmadfljofbimhhlengambbn) on `ws://localhost:8787/websocket` and connect and see the stream of event
