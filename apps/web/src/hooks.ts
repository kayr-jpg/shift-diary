import { useQuery } from "@tanstack/react-query";
import { getDay, getDays } from "./api";

export const dayKey = (date: string) => ["day", date] as const;
export const daysKey = ["days"] as const;

export function useDay(date: string | null) {
  return useQuery({
    queryKey: dayKey(date ?? ""),
    queryFn: () => getDay(date as string),
    enabled: date !== null,
  });
}

export function useDays() {
  return useQuery({ queryKey: daysKey, queryFn: getDays });
}
