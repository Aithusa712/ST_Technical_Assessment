import axios from "axios";

export function getErrorMessage(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) ? err.response?.data?.error ?? fallback : fallback;
}
