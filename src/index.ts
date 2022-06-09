import { handlers } from './lib/handlers'

// In order for the workers runtime to find the class that implements
// our Durable Object namespace, we must export it from the root module.
// export { VoidEventList as EventList} from './lib/implementations/VoidEventList'
export { WebSocketEventList as EventList } from './lib/implementations/WebSocketEventList'

export default handlers({
  interval: 6,
  functions: {
    GET: ['getEvents', 'processEvents', 'websocket'],
    POST: ['setup'],
  },
})
