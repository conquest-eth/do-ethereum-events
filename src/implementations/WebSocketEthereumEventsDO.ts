import { pathFromURL } from '@/utils/request';
import { EventWithId } from '../EthereumEventsDO';
import { EthereumEventsDOWithGenericERC721Support } from './EthereumEventsDOWithGenericERC721Support';

export class WebSocketEthereumEventsDO extends EthereumEventsDOWithGenericERC721Support {
  sessions: any[] = [];

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async onEventStream(eventStream: EventWithId[]) {
    const message = JSON.stringify(eventStream);

    // Iterate over all the sessions sending them messages.
    this.sessions = this.sessions.filter((session) => {
      try {
        session.webSocket.send(message);
        return true;
      } catch (err) {
        // Whoops, this connection is dead. Remove it from the list and arrange to notify
        // everyone below.
        // TODO error logging ?
        session.webSocket.close(1011, 'WebSocket broken.');
        return false;
      }
    });
  }

  async websocket(request: Request) {
    // The request is to `/api/room/<name>/websocket`. A client is trying to establish a new
    // WebSocket session.
    if (request.headers.get('Upgrade') != 'websocket') {
      console.error(`expected websocket ${request.headers.get('Upgrade')}`);
      return new Response('expected websocket', { status: 400 });
    }

    // Get the client's IP address for use with the rate limiter.
    let ip = request.headers.get('CF-Connecting-IP');

    // To accept the WebSocket request, we create a WebSocketPair (which is like a socketpair,
    // i.e. two WebSockets that talk to each other), we return one end of the pair in the
    // response, and we operate on the other end. Note that this API is not part of the
    // Fetch API standard; unfortunately, the Fetch API / Service Workers specs do not define
    // any way to act as a WebSocket server today.
    const [client, server] = Object.values(new WebSocketPair());

    await this._handleSession(server, ip);

    // Now we return the other end of the pair to the client.
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request: Request) {
    const { patharray } = pathFromURL(request.url);
    switch (patharray[patharray.length - 1]) {
      case 'websocket': {
        return this.websocket(request);
      }
      default: {
        return super.fetch(request);
      }
    }
  }

  // handleSession() implements our WebSocket-based chat protocol.
  async _handleSession(server: WebSocket, ip: string | null) {
    console.log(`handling session from ${ip}`);

    // Accept our end of the WebSocket. This tells the runtime that we'll be terminating the
    // WebSocket in JavaScript, not sending it elsewhere.
    server.accept();
    // server.addEventListener('message', event => {
    //   server.send(event.data)
    // })

    // Create our session and add it to the sessions list.
    // We don't send any messages to the client until it has sent us the initial user info
    // message. Until then, we will queue messages in `session.blockedMessages`.
    let session = { webSocket: server };
    this.sessions.push(session);

    // On "close" and "error" events, remove the WebSocket from the sessions list and broadcast
    // a quit message.
    let closeOrErrorHandler = (evt: CloseEvent | ErrorEvent) => {
      console.error(`closing because of`, evt);
      this.sessions = this.sessions.filter((member) => member !== session);
    };
    server.addEventListener('close', closeOrErrorHandler);
    server.addEventListener('error', closeOrErrorHandler);
  }
}
