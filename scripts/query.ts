import 'isomorphic-fetch';

const args = (globalThis as any).process.argv.slice(2);
const url = args[0] || 'http://localhost:8787/events/query';

const queryString = args[1];

async function main() {
  // const response = await fetch(url, {
  //   method: 'POST',
  //   body: JSON.stringify({
  //     owner,
  //   }),
  // });
  const response = await fetch(url + `?${queryString}`);
  const json = await response.json();
  console.log(json);
}

main();
