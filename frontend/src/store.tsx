import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, PLURAL, type RecordType } from "./api";

type Option = { id: number; name: string };
export type CopilotTarget = { type: RecordType; id: number; name: string } | null;
type Store = {
  copilot: { open: boolean; target: CopilotTarget };
  openCopilot: (target?: CopilotTarget) => void;
  closeCopilot: () => void;
  user: { id: number; name: string; role: string } | null;
  setUser: (u: Store["user"]) => void;
  users: Option[];
  options: (t: RecordType | "user") => Option[];
  loadOptions: (t: RecordType) => Promise<void>;
  refName: (t: RecordType | "user", id: number | null | undefined) => string;
};

const Ctx = createContext<Store>(null!);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Store["user"]>(null);
  const [users, setUsers] = useState<Option[]>([]);
  const [copilot, setCopilot] = useState<Store["copilot"]>({ open: false, target: null });
  const openCopilot = (target: CopilotTarget = null) => setCopilot({ open: true, target });
  const closeCopilot = () => setCopilot((c) => ({ ...c, open: false }));
  const [cache, setCache] = useState<Partial<Record<RecordType, Option[]>>>({});

  useEffect(() => {
    if (!user) return;
    api<any[]>("/users").then((u) => setUsers(u.map((x) => ({ id: x.id, name: x.name }))));
    for (const t of ["company", "contact"] as RecordType[]) void loadOptions(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadOptions = useCallback(async (t: RecordType) => {
    const res = await api<{ items: any[] }>(`/${PLURAL[t]}?limit=500&sort=id`);
    setCache((c) => ({ ...c, [t]: res.items.map((r) => ({ id: r.id, name: r.display_name })) }));
  }, []);

  const options = (t: RecordType | "user") => (t === "user" ? users : cache[t] ?? []);
  const refName = (t: RecordType | "user", id: number | null | undefined) =>
    id == null ? "—" : options(t).find((o) => o.id === id)?.name ?? `#${id}`;

  return <Ctx.Provider value={{ copilot, openCopilot, closeCopilot, user, setUser, users, options, loadOptions, refName }}>{children}</Ctx.Provider>;
}
