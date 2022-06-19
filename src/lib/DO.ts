import { createErrorResponse, handleErrors } from './errors'
import { DataDogLogger, setupLogger } from './datadog'

export abstract class DO {
  state: DurableObjectState
  env: Env
  private logger: DataDogLogger
  private currentRequest: Request | undefined

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    this.logger = setupLogger(
      env.DATA_DOG_API_KEY,
      'ethereum-events-worker-' +
        (env.ENVIRONMENT ? '-' + env.ENVIRONMENT : ''),
    )
    ;(globalThis as any).logger = this
  }

  info(message: string) {
    if (this.currentRequest) {
      try {
        this.logger.log(this.currentRequest, message, 'info')
      } catch (e) {
        console.error(e)
      }
      console.info(message)
    }
  }

  error(message: string) {
    if (this.currentRequest) {
      try {
        this.logger.log(this.currentRequest, message, 'error')
      } catch (e) {
        console.error(e)
      }
      console.info(message)
    }
  }

  exception(message: string, error: any) {
    if (this.currentRequest) {
      try {
        this.logger.log(this.currentRequest, message, 'error', {
          logger: { name: 'default', thread: '' },
          error: {
            stack: error.stack,
            message: error.message || error.toString ? error.toString() : error,
            kind: error?.constructor?.name,
          },
        })
      } catch (e) {
        console.error(e)
      }
      console.info(message)
    }
  }

  warn(message: string) {
    if (this.currentRequest) {
      try {
        this.logger.log(this.currentRequest, message, 'warn')
      } catch (e) {
        console.warn(e)
      }
      console.info(message)
    }
  }

  async fetch(request: Request): Promise<Response> {
    return await handleErrors(request, async () => {
      this.currentRequest = request
      let url = new URL(request.url)
      const path = url.pathname.substr(1).split('/')
      const fnc = path[0]
      const self = this as unknown as {
        [funcName: string]: (
          path: string[],
          request: Request,
          data: Object | string | number,
        ) => Promise<Response>
      }
      if (self[fnc]) {
        try {
          let json: any | undefined
          if (request.method != 'GET') {
            try {
              json = await request.json()
            } catch (e) {
              json = {}
            }
          }
          // console.log(path.slice(1), json, url, path);
          const response = await self[fnc](path.slice(1), request, json)
          return response
        } catch (e: unknown) {
          const error = e as { message?: string }
          let message = error.message || `Error happen while calling ${fnc}`
          this.error(message)
          return createErrorResponse({ code: 5555, message })
          // console.log(message);
          // throw e;
          // if (error.message) {
          //     message = error.message;
          // } else {
          //     message = message + '  :  ' + e;
          // }
          // return new Response(message, {status: 501});
        }
      } else {
        return new Response('Not found', { status: 404 })
      }
    })
  }
}
