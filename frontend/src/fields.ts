import type { RecordType } from "./api";

export type Field = {
  key: string;
  label: string;
  kind?: "text" | "number" | "money" | "date" | "select" | "ref" | "textarea" | "email";
  options?: string[];
  ref?: RecordType | "user";
  list?: boolean;
  required?: boolean;
};

export const STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

export const FIELDS: Record<RecordType, Field[]> = {
  company: [
    { key: "name", label: "Name", required: true, list: true },
    { key: "domain", label: "Domain", list: true },
    { key: "industry", label: "Industry", list: true },
    { key: "employees", label: "Employees", kind: "number", list: true },
    { key: "annual_revenue_micros", label: "Annual revenue", kind: "money" },
    { key: "city", label: "City", list: true },
    { key: "owner_id", label: "Owner", kind: "ref", ref: "user", list: true },
  ],
  contact: [
    { key: "first_name", label: "First name", required: true },
    { key: "last_name", label: "Last name" },
    { key: "email", label: "Email", kind: "email", list: true },
    { key: "phone", label: "Phone", list: true },
    { key: "job_title", label: "Job title", list: true },
    { key: "company_id", label: "Company", kind: "ref", ref: "company", list: true },
    { key: "owner_id", label: "Owner", kind: "ref", ref: "user" },
  ],
  lead: [
    { key: "first_name", label: "First name", required: true },
    { key: "last_name", label: "Last name" },
    { key: "email", label: "Email", kind: "email", list: true },
    { key: "phone", label: "Phone" },
    { key: "job_title", label: "Job title", list: true },
    { key: "company_name", label: "Company", list: true },
    { key: "source", label: "Source", kind: "select", options: ["referral", "event", "website", "ads", "cold"], list: true },
    { key: "status", label: "Status", kind: "select", options: ["new", "contacted", "qualified", "unqualified", "converted"], list: true },
    { key: "budget_micros", label: "Budget", kind: "money" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "owner_id", label: "Owner", kind: "ref", ref: "user" },
  ],
  deal: [
    { key: "name", label: "Name", required: true, list: true },
    { key: "amount_micros", label: "Amount", kind: "money", list: true },
    { key: "stage", label: "Stage", kind: "select", options: STAGES, list: true },
    { key: "close_date", label: "Close date", kind: "date", list: true },
    { key: "company_id", label: "Company", kind: "ref", ref: "company", list: true },
    { key: "contact_id", label: "Point of contact", kind: "ref", ref: "contact" },
    { key: "probability", label: "Probability override %", kind: "number" },
    { key: "lost_reason", label: "Lost reason" },
    { key: "owner_id", label: "Owner", kind: "ref", ref: "user", list: true },
  ],
  task: [
    { key: "title", label: "Title", required: true, list: true },
    { key: "status", label: "Status", kind: "select", options: ["TODO", "IN_PROGRESS", "DONE"], list: true },
    { key: "due_at", label: "Due", kind: "date", list: true },
    { key: "assignee_id", label: "Assignee", kind: "ref", ref: "user", list: true },
    { key: "body", label: "Details", kind: "textarea" },
  ],
  note: [
    { key: "title", label: "Title", required: true, list: true },
    { key: "body", label: "Body", kind: "textarea", list: true },
  ],
};

export const LABELS: Record<RecordType, [string, string]> = {
  company: ["Company", "Companies"], contact: ["Contact", "Contacts"], lead: ["Lead", "Leads"],
  deal: ["Deal", "Deals"], task: ["Task", "Tasks"], note: ["Note", "Notes"],
};
