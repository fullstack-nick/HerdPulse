import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

const roles = ['manager', 'worker', 'vet', 'owner'] as const;
export type DemoRole = (typeof roles)[number];

interface SessionValue {
  role: DemoRole;
  token: string;
  setRole: (role: DemoRole) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [role, updateRole] = useState<DemoRole>(
    () => (localStorage.getItem('herdpulse-role') as DemoRole) || 'manager',
  );
  const value = useMemo(
    () => ({
      role,
      token: `demo-${role}`,
      setRole: (next: DemoRole) => {
        localStorage.setItem('herdpulse-role', next);
        updateRole(next);
      },
    }),
    [role],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing.');
  return value;
}

export { roles };
