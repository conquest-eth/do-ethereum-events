// export enum ErrorCode {

import { createResponse } from './utils'

// }

export type ResponseError = {
  code: number //ErrorCode;
  message: string
}

export const DifferentChainIdDetected = () =>
  createErrorResponse({
    code: 5556,
    message:
      'different chainId detected, please check the ethereum node config',
  })

export const InvalidMethod = () =>
  createErrorResponse({ code: 4444, message: 'Invalid Method' })

export const NotAuthorized = () =>
  createErrorResponse({ code: 4202, message: 'Not authorized' })

export const UnknownRequestType = () =>
  createErrorResponse({ code: 4401, message: 'Unknown request type' }) // TODO parametrise to print request type

export function createErrorResponse(
  responseError: ResponseError,
  status: number = 400,
): Response {
  return createResponse({ error: responseError }, { status })
}

// from : https://github.com/cloudflare/workers-chat-demo
// `handleErrors()` is a little utility function that can wrap an HTTP request handler in a
// try/catch and return errors to the client. You probably wouldn't want to use this in production
// code but it is convenient when debugging and iterating.
export async function handleErrors(request, func) {
  try {
    return await func()
  } catch (err) {
    if (request.headers.get('Upgrade') == 'websocket') {
      // Annoyingly, if we return an HTTP error in response to a WebSocket request, Chrome devtools
      // won't show us the response body! So... let's send a WebSocket response with an error
      // frame instead.
      let pair = new WebSocketPair()
      pair[1].accept()
      pair[1].send(JSON.stringify({ error: err.stack }))
      pair[1].close(1011, 'Uncaught exception during session setup')
      return new Response(null, { status: 101, webSocket: pair[0] })
    } else {
      // console.error('ERROR', e);
      const message = (err as { message: string }).message
      if (message) {
        return new Response(message)
      } else {
        return new Response(err as string)
      }
      // return new Response(err.stack, { status: 500 })
    }
  }
}
