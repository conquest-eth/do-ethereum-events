# An ethereum event stream

## Use

### install

`npm i ethereum-event-do`

### extend EthereumEventsDO and implement `onEventStream`

```typescript
/// MyEthereumEventsDO.ts
import { EthereumEventsDO, EventWithId } from 'ethereum-event-do';

export class MyEthereumEventsDO extends EthereumEventsDO {

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

Example: [the websocket implementation](src/implementations/WebSocketEthereumEventsDO.ts.ts)

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
        const namespace = env.ETHEREUM_EVENTS;
        const DO = namespace.get(namespace.idFromName('_GLOBAL_'));

        return DO.fetch(request);
      }
      default:
        return new Response('Not found', { status: 404 });
    }
  },
};

// TODO rename

export { MyEthereumEventsDO as EthereumEventsDO } from './MyEthereumEventsDO';
```

This is just for demonstration purpose, admin checks need to be set for `setup`

- `setup` expect to be called once with the contract data. then the durable object will call itself and fetch the events for these, store then and call `onEventStream`
- `list` is simply a getter to fetch the event, you might not want to expose it. it accept 2 get param `start` and `limit`

You also need to export its class (as shown above) and declare it in the wrangler.toml (See cloudflare doc)

for example:

```toml
...
[durable_objects]
bindings = [{name = "ETHEREUM_EVENTS", class_name = "EthereumEventsDO"}]
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
