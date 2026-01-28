import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const DEFAULT_QUERY_OPTIONS = {
  staleTime: 60_000,
};

export function useListCountries(options = {}) {
  return useQuery({
    queryKey: ["countries"],
    queryFn: () => api.listCountries(),
    ...DEFAULT_QUERY_OPTIONS,
    ...options,
  });
}

export function useListSchools(params = {}, options = {}) {
  return useQuery({
    queryKey: ["schools", params],
    queryFn: () => api.listSchools(params),
    ...DEFAULT_QUERY_OPTIONS,
    ...options,
  });
}

export function useAdminUsers(params = {}, options = {}) {
  return useQuery({
    queryKey: ["adminUsers", params],
    queryFn: () => api.listUsers(params),
    ...DEFAULT_QUERY_OPTIONS,
    ...options,
  });
}

export function useManagerUsers(params = {}, options = {}) {
  return useQuery({
    queryKey: ["managerUsers", params],
    queryFn: () => api.managerListUsers(params),
    ...DEFAULT_QUERY_OPTIONS,
    ...options,
  });
}
