import 'isomorphic-fetch';

const args = (globalThis as any).process.argv.slice(2);
const url = args[0] || 'http://localhost:8787/events/setup';
const dataFilepath = args[1];
const reset = args[2] === 'reset' || args[3] === 'reset';
const start = args[2] === 'start' || args[3] === 'start';

async function main() {
  const fsName = 'fs';
  const fs = await import(fsName);
  const dataFromFile = JSON.parse(fs.readFileSync(dataFilepath).toString());

  let list: any;
  let all: any;
  if (Array.isArray(dataFromFile)) {
    list = dataFromFile;
  } else {
    all = dataFromFile;
  }

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      list,
      all,
      reset,
      start,
    }),
  });
  const clone = response.clone();
  try {
    const json = await response.json();
    console.log(json);
  } catch (err) {
    const message = await clone.text();
    console.log({ message });
  }
}

main();
