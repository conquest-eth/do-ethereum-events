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
