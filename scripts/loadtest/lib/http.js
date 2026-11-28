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
  const response = http.get(url, withCallerTags(params, tags));
  countThrottle(response.status, tags);
  return response;
}

/**
 * Sends a POST with caller tags and the same throttle accounting as GET.
 *
 * @param {string} url
 * @param {unknown} body
 * @param {HttpParams} params
 * @param {Record<string, string>} tags
 */
export function postWithTags(url, body, params, tags) {
  const response = http.post(url, body, withCallerTags(params, tags));
  countThrottle(response.status, tags);
  return response;
}

/**
 * @param {HttpParams} params
 * @param {Record<string, string>} tags
 */
function withCallerTags(params, tags) {
  return { ...params, tags: { ...(params.tags ?? {}), ...tags } };
}

/** @param {number} status @param {Record<string, string>} tags */
function countThrottle(status, tags) {
  if (status === 429) {
    throttledRequests.add(1, withThrottleTag(tags, status));
  }
}
