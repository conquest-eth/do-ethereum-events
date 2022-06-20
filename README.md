# An ethereum event stream based on cloudflare worker and durable object

## Use

### install

`npm i ethereum-events-do`

### extend EthereumEventsDO and implement `onEventStream`

```typescript
/// MyEthereumEventsDO.ts
import { EthereumEventsDO, EventWithId } from 'ethereum-events-do';

export class MyEthereumEventsDO extends EthereumEventsDO {

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  onEventStream(eventStream: EventWithId[]) {
    // TODO whatever you want
  }

  // optionaly you can add more endpoint, like a normal DO
  async fetch(request: Request): Promise<Response> {
    ...
    return super.fetch(request);
  }

}

```

Example: [the websocket implementation](src/implementations/WebSocketEthereumEventsDO.ts.ts)

### hook it up in the worker

Indeed, as a Durable Object you still need to hook its request from the worker like so for example:

```typescript
/// worker.ts
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    switch (new URL(request.url).pathname) {
      case '/events/setup':
      case '/events/list':
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

### frequency of updates

By default the DO use cloudflare worker alarm and these are called every 30s at max.
To disable the alarm : `EthereumEventsDO.alarm = null;`
To set a specific interval that the DO will try to perform : `EthereumEventsDO.alarm = { interval: 6 };`

If you disable the alarm, the events won't be processed. the DO also expose a `process` endpoint and you can call it in a worker CRON handler instead
CRON have a resolution of 1 minite so you ll need to also call it several time

The DO can do that for your automatically via : `EthereumEventsDO.scheduled = {interval: 6}`

You could also trigger it externaly. Technically it is idemptotent so there should be no need to protect it behind authentication even

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
