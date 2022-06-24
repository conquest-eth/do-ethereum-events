import { LocalEthereumEventsDO } from './LocalEthereumEventsDO';

const process = (globalThis as any).process;

const args = process.argv.slice(2);
const dataFilepath = args[0];

async function main() {
  const fsName = 'fs';
  const fs = await import(fsName);
  const dataFromFile = JSON.parse(fs.readFileSync(dataFilepath).toString());
  let list;
  let all;
  if (Array.isArray(dataFromFile)) {
    list = dataFromFile;
  } else {
    all = dataFromFile;
  }

  const ethereumEventsDO = new LocalEthereumEventsDO();

  for (let i = 0; i < 1000; i++) {
    const result = await ethereumEventsDO.fetchAndProcess();
    console.log(result);
  }
}
main();
