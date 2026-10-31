import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, PLURAL, type RecordType } from "./api";

type Option = { id: number; name: string };
export type AssistantTarget = { type: RecordType; id: number; name: string } | null;
type Store = {
  assistant: { open: boolean; target: AssistantTarget };
  openAssistant: (target?: AssistantTarget) => void;
  closeAssistant: () => void;
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
  const [assistant, setAssistant] = useState<Store["assistant"]>({ open: false, target: null });
  const openAssistant = (target: AssistantTarget = null) => setAssistant({ open: true, target });
  const closeAssistant = () => setAssistant((a) => ({ ...a, open: false }));
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
    id == null ? "-" : options(t).find((o) => o.id === id)?.name ?? `#${id}`;

  return <Ctx.Provider value={{ assistant, openAssistant, closeAssistant, user, setUser, users, options, loadOptions, refName }}>{children}</Ctx.Provider>;
}
