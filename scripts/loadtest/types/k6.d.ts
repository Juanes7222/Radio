declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
  exitCode?: number;
};

declare const __VU: number;
declare const __ITER: number;

declare class URL {
  constructor(input: string);
  protocol: string;
  hostname: string;
}

declare module "k6" {
  export function check<T>(value: T, checks: Record<string, (checked: T) => boolean>): boolean;
  export function sleep(seconds: number): void;
}

declare module "k6/http" {
  export interface Response {
    status: number;
    body: string | null;
    headers: Record<string, string>;
    timings: { duration: number };
    json(): Record<string, unknown>;
  }

  export interface Params {
    headers?: Record<string, string>;
    tags?: Record<string, string>;
    timeout?: string;
    responseCallback?: unknown;
  }

  interface HttpClient {
    get(url: string, params?: Params): Response;
    post(url: string, body?: unknown, params?: Params): Response;
    setResponseCallback(callback: unknown): void;
    expectedStatuses(...statuses: Array<number | { min: number; max: number }>): unknown;
  }

  const http: HttpClient;
  export default http;
}

declare module "k6/metrics" {
  export class Counter {
    constructor(name: string);
    add(value: number, tags?: Record<string, string>): void;
  }

  export class Trend {
    constructor(name: string, isTime?: boolean);
    add(value: number, tags?: Record<string, string>): void;
  }
}

declare module "https://jslib.k6.io/k6-utils/1.3.0/index.js" {
  export function tagWithCurrentStageIndex(): void;
}
