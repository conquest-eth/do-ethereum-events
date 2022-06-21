import 'isomorphic-fetch';

async function main() {
  await fetch('http://localhost:8787/events/setup', {
    method: 'POST',
    body: JSON.stringify({
      all: {
        startBlock: 5806610,
        eventsABI: [
          {
            anonymous: false,
            inputs: [
              {
                indexed: true,
                internalType: 'address',
                name: 'owner',
                type: 'address',
              },
              {
                indexed: true,
                internalType: 'address',
                name: 'approved',
                type: 'address',
              },
              {
                indexed: true,
                internalType: 'uint256',
                name: 'tokenId',
                type: 'uint256',
              },
            ],
            name: 'Approval',
            type: 'event',
          },
          {
            anonymous: false,
            inputs: [
              {
                indexed: true,
                internalType: 'address',
                name: 'owner',
                type: 'address',
              },
              {
                indexed: true,
                internalType: 'address',
                name: 'operator',
                type: 'address',
              },
              {
                indexed: false,
                internalType: 'bool',
                name: 'approved',
                type: 'bool',
              },
            ],
            name: 'ApprovalForAll',
            type: 'event',
          },
          {
            anonymous: false,
            inputs: [
              {
                indexed: true,
                internalType: 'address',
                name: 'from',
                type: 'address',
              },
              {
                indexed: true,
                internalType: 'address',
                name: 'to',
                type: 'address',
              },
              {
                indexed: true,
                internalType: 'uint256',
                name: 'tokenId',
                type: 'uint256',
              },
            ],
            name: 'Transfer',
            type: 'event',
          },
        ],
      },
    }),
  });
}

main();
