import { handlers } from './lib/handlers'

// In order for the workers runtime to find the class that implements
// our Durable Object namespace, we must export it from the root module.
export { VoidEventList } from './lib/ethereum/implementations/VoidEventList'

export default handlers({ interval: 6 })
