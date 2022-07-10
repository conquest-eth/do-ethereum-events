import 'isomorphic-fetch';

const args = (globalThis as any).process.argv.slice(2);
const folder = args[0];
const url = args[1] || 'http://localhost:8787/events';

async function feed(eventStream: any[]) {
  const response = await fetch(url + '/feed', {
    method: 'POST',
    body: JSON.stringify({
      eventStream,
    }),
  });
  const cloned = response.clone();
  try {
    const json = await response.json();
    console.log({ json });
  } catch (e) {
    const text = await cloned.text();
    console.log({ text });
  }
}

async function getStatus(): Promise<{ nextStreamID: number } | undefined> {
  try {
    const response = await fetch(url + '/status');
    const json: { status: { lastSync: { nextStreamID: number } } } =
      await response.json();
    console.log(json);
    return json?.status?.lastSync ? json.status.lastSync : undefined;
  } catch (err) {
    return undefined;
  }
}

async function main() {
  const fsName = 'fs';
  const fs = await import(fsName);

  let status = await getStatus();
  console.log(status);

  const files = fs.readdirSync(folder);
  const eventFiles = files.filter((v: string) => v.startsWith('events_'));
  if (eventFiles.length > 0) {
    for (const file of eventFiles) {
      const eventStream: { streamID: number }[] = JSON.parse(
        fs.readFileSync(`${folder}/${file}`).toString(),
      );
      const maxBatchSize = 128;
      if (eventStream.length > maxBatchSize) {
        console.log(
          `eventStream size bigger than ${maxBatchSize} : ${eventStream.length}`,
        );
        for (let i = 0; i < eventStream.length; i += maxBatchSize) {
          const subStream = eventStream.slice(i, i + maxBatchSize);
          console.log(
            `sending ${subStream.length} (from ${i} to ${
              i + maxBatchSize - 1
            })`,
          );
          if (!status || status.nextStreamID === subStream[0].streamID) {
            status = undefined;
            await feed(subStream);
          } else {
            console.log(
              `skip as streamID do not match (status : ${status?.nextStreamID}, stream: ${subStream[0].streamID})`,
            );
          }
        }
      } else {
        if (!status || status.nextStreamID === eventStream[0].streamID) {
          status = undefined;
          await feed(eventStream);
        } else {
          console.log(
            `skip as streamID do not match (status : ${status?.nextStreamID}, stream: ${eventStream[0].streamID})`,
          );
        }
      }
    }
  }
}

main();
