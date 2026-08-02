import { access, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { networkInterfaces } from 'node:os';

const target = new URL('../.env', import.meta.url);
const source = new URL('../.env.example', import.meta.url);
const mobileTarget = new URL('../apps/mobile/.env.local', import.meta.url);
const webTarget = new URL('../apps/web/.env.local', import.meta.url);

const addresses = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter((entry) => entry.family === 'IPv4' && !entry.internal)
  .map((entry) => entry.address);
const preferredAddress =
  addresses.find((address) => address.startsWith('192.168.')) ??
  addresses.find((address) => address.startsWith('10.')) ??
  addresses[0] ??
  '127.0.0.1';

try {
  await access(target, constants.F_OK);
  console.log('.env already exists; leaving it unchanged.');
} catch {
  const template = await readFile(source, 'utf8');
  const rendered = template.replaceAll('192.168.0.1', preferredAddress);
  await writeFile(target, rendered, 'utf8');
  console.log(`Created .env from .env.example using Android host ${preferredAddress}.`);
}

for (const [clientTarget, contents] of [
  [mobileTarget, `EXPO_PUBLIC_API_URL=http://${preferredAddress}:4000/graphql\n`],
  [
    webTarget,
    'VITE_API_URL=http://localhost:4000/graphql\nVITE_WS_URL=ws://localhost:4000/graphql\n',
  ],
] as const) {
  try {
    await access(clientTarget, constants.F_OK);
  } catch {
    await writeFile(clientTarget, contents, 'utf8');
  }
}
console.log(`Client environment points Android to ${preferredAddress}:4000.`);
