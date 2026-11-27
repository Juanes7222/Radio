// @ts-check

import http from "k6/http";
import { Counter } from "k6/metrics";
import { withThrottleTag } from "./tags.js";

/** @typedef {{ headers?: Record<string, string>, tags?: Record<string, string>, timeout?: string, responseCallback?: unknown }} HttpParams */

const throttledRequests = new Counter("throttled_requests");

// k6 assigns tags before the response exists, so a 429 cannot retroactively
// change the tag on http_req_failed. Marking 429 as expected keeps nginx
// throttling out of the backend failure rate; the counter records it as
// throttled:yes for the report.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 429));

/**
 * Sends a GET with caller tags and counts nginx throttling separately.
 *
 * @param {string} url
 * @param {HttpParams} params
 * @param {Record<string, string>} tags
 */
export function requestWithTags(url, params, tags) {
  const mergedParams = {
    ...params,
    tags: { ...(params.tags ?? {}), ...tags },
  };
  const response = http.get(url, mergedParams);
  if (response.status === 429) {
    throttledRequests.add(1, withThrottleTag(tags, response.status));
  }
  return response;
}
