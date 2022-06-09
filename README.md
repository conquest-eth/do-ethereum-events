## A ethereum event streamer

# install dev env

```sh
pnpm i
```

# Websocket implementation

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
