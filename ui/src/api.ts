const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface Incident {
  id: string;
  pagerdutyIncidentId: string;
  title: string;
  urgency: string;
  serviceName: string;
  status: string;
  prUrl: string | null;
  prNumber: number | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface Service {
  id: string;
  name: string;
  pagerdutyServiceId: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  slackChannelId: string;
  logSource: string;
  logQuery: string | null;
}

export const api = {
  getIncidents: () => request<Incident[]>("/incidents"),
  getIncident: (id: string) => request<Incident>(`/incidents/${id}`),
  getServices: () => request<Service[]>("/services"),
  createService: (data: Omit<Service, "id">) =>
    request<{ id: string }>("/services", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateService: (id: string, data: Omit<Service, "id">) =>
    request<{ status: string }>(`/services/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteService: (id: string) =>
    request<{ status: string }>(`/services/${id}`, { method: "DELETE" }),
};
