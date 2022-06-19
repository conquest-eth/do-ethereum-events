interface Env {
  EVENT_LIST: DurableObjectNamespace
  ENVIRONMENT: string
  ETHEREUM_NODE: string
  DATA_DOG_API_KEY: string
}

interface CronTrigger {
  cron: string
  scheduledTime: number
}
