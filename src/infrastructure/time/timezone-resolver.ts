import { find as geoTzFind } from "geo-tz/dist/find-now";

export type TimezoneResolution =
  | Readonly<{ kind: "resolved"; candidate: string }>
  | Readonly<{
      kind: "ambiguous";
      candidates: readonly [string, string, ...string[]];
    }>
  | Readonly<{
      kind: "failure";
      cause: "invalid-coordinates" | "empty-result" | "resolver-error";
    }>;

export interface TimezoneResolver {
  resolve(latitude: number, longitude: number): Promise<TimezoneResolution>;
}

type FindTimezones = (latitude: number, longitude: number) => readonly string[];

function isValidIanaZone(value: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export class GeoTzTimezoneResolver implements TimezoneResolver {
  constructor(private readonly findTimezones: FindTimezones = geoTzFind) {}

  async resolve(
    latitude: number,
    longitude: number,
  ): Promise<TimezoneResolution> {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return { kind: "failure", cause: "invalid-coordinates" };
    }

    try {
      const candidates = [
        ...new Set(this.findTimezones(latitude, longitude)),
      ].filter(isValidIanaZone);
      if (candidates.length === 0) {
        return { kind: "failure", cause: "empty-result" };
      }
      if (candidates.length === 1) {
        return { kind: "resolved", candidate: candidates[0]! };
      }
      return {
        kind: "ambiguous",
        candidates: candidates as [string, string, ...string[]],
      };
    } catch {
      return { kind: "failure", cause: "resolver-error" };
    }
  }
}
