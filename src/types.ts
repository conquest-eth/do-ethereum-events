export type Env = {
  EVENT_LIST: DurableObjectNamespace
  ENVIRONMENT: string
  ETHEREUM_NODE: string
  DATA_DOG_API_KEY: string
}

export type CronTrigger = { cron: string; scheduledTime: number }
