import 'isomorphic-fetch';

const args = (globalThis as any).process.argv.slice(2);
const url = args[0] || 'http://localhost:8787/events/start';

async function main() {
  const response = await fetch(url);
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
