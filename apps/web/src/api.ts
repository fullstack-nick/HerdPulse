import { createClient } from 'graphql-ws';

export const ORGANIZATION_ID = 'org-demo-farm';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/graphql';
export const WS_URL = import.meta.env.VITE_WS_URL || API_URL.replace(/^http/, 'ws');

export type Variables = Record<string, unknown>;

export async function graphQL<T>(
  query: string,
  variables: Variables = {},
  token = 'demo-manager',
): Promise<T> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length)
    throw new Error(body.errors?.[0]?.message || `API request failed (${response.status})`);
  return body.data;
}

export function subscribeToChanges(token: string, onChange: () => void) {
  const client = createClient({
    url: WS_URL,
    connectionParams: { authorization: `Bearer ${token}` },
    retryAttempts: Infinity,
  });
  const subscriptions = ['healthCaseChanged', 'taskChanged', 'deviceStatusChanged'].map((field) =>
    client.subscribe(
      {
        query: `subscription Live($organizationId: ID!) { ${field}(organizationId: $organizationId) { entityId changeType } }`,
        variables: { organizationId: ORGANIZATION_ID },
      },
      { next: onChange, error: () => undefined, complete: () => undefined },
    ),
  );
  return () => {
    subscriptions.forEach((dispose) => dispose());
    void client.dispose();
  };
}
