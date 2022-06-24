import 'isomorphic-fetch';

const args = (globalThis as any).process.argv.slice(2);
const folder = args[0];
const url = args[1] || 'http://localhost:8787/events/feed';

async function main() {
  const fsName = 'fs';
  const fs = await import(fsName);

  const files = fs.readdirSync(folder);
  const eventFiles = files.filter((v: string) => v.startsWith('events_'));
  if (eventFiles.length > 0) {
    for (const file of eventFiles) {
      const eventStream = JSON.parse(
        fs.readFileSync(`${folder}/${file}`).toString(),
      );
      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
          eventStream,
        }),
      });
      const json = await response.json();
      console.log({ json });
    }
  }
}

main();
