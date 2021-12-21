const fs = require('fs-extra')
const args = process.argv.slice(2)
const environment = args[0]

if (environment) {
  const envFile = `.env.${environment}`

  if (!fs.existsSync(envFile)) {
    throw new Error(`env file ${envFile} does not exist.`)
  }

  require('dotenv').config({ path: envFile })
}

require('dotenv').config({ path: '.env' })

const Handlebars = require('handlebars')

const template = Handlebars.compile(
  fs.readFileSync('./templates/wrangler.toml.hbs').toString(),
)
const result = template({
  devMode: 'true', // TODO ?
  environment,
  ETHEREUM_NODE: process.env.ETHEREUM_NODE,
  DATA_DOG_API_KEY: process.env.DATA_DOG_API_KEY,
})
fs.writeFileSync('./wrangler.toml', result)
