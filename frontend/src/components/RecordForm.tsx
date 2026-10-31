import { useEffect, useState } from "react";
import { api, PLURAL, type RecordType } from "../api";
import { FIELDS, LABELS } from "../fields";
import { useStore } from "../store";
import { Modal } from "./ui";

type Props = {
  type: RecordType;
  record?: Record<string, any>;
  defaults?: Record<string, any>;
  targets?: { type: string; id: number }[];
  onClose: () => void;
  onSaved: (r: any) => void;
};

const toInput = (kind: string | undefined, v: any) => {
  if (v == null) return "";
  if (kind === "money") return String(v / 1e6);
  if (kind === "date") return String(v).slice(0, 10);
  return String(v);
};
const fromInput = (kind: string | undefined, v: string) => {
  if (v === "") return null;
  if (kind === "money") return Math.round(parseFloat(v) * 1e6);
  if (kind === "number" || kind === "ref") return Number(v);
  return v;
};

export default function RecordForm({ type, record, defaults, targets, onClose, onSaved }: Props) {
  const fields = FIELDS[type];
  const { options, loadOptions } = useStore();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, toInput(f.kind, record?.[f.key] ?? defaults?.[f.key])])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fields.filter((f) => f.kind === "ref" && f.ref !== "user").forEach((f) => void loadOptions(f.ref as RecordType));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, any> = {};
    for (const f of fields) {
      const nv = fromInput(f.kind, values[f.key]);
      if (record ? nv !== (record[f.key] ?? null) : nv !== null) body[f.key] = nv;
    }
    try {
      const saved = record
        ? await api(`/${PLURAL[type]}/${record.id}`, { method: "PATCH", body })
        : await api(`/${PLURAL[type]}`, { body: { ...body, ...(targets ? { targets } : {}) } });
      onSaved(saved);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${record ? "Edit" : "New"} ${LABELS[type][0].toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} className="form">
        {fields.map((f) => (
          <label key={f.key} className={f.kind === "textarea" ? "span2" : ""}>
            <span>{f.label}{f.required && " *"}</span>
            {f.kind === "select" ? (
              <select value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                <option value="">—</option>
                {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.kind === "ref" ? (
              <select value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                <option value="">—</option>
                {options(f.ref!).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : f.kind === "textarea" ? (
              <textarea rows={3} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            ) : (
              <input
                required={f.required}
                type={f.kind === "money" || f.kind === "number" ? "number" : f.kind === "date" ? "date" : f.kind === "email" ? "email" : "text"}
                step="any"
                value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
        {error && <div className="error span2">{error}</div>}
        <div className="actions span2">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
