// 큐티 날짜 파서 단위테스트 (가장 중요한 집계 로직 보호).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractQtDays } from "../lib/scrape.js";

// 2026년 2월(28일) 기준
const Y = 2026, M = 2, DIM = 28;
const cases = [
  ["[큐티나눔] 260215 말씀묵상", [15]],
  ["큐티나눔 20260203", [3]],
  ["큐티 나눔 0207 은혜", [7]],
  ["2월9일 큐티나눔", [9]],
  ["큐티나눔 2.5", [5]],
  ["큐티나눔 02/14", [14]],
  ["큐티나눔 2월28일", [28]],
  ["큐티나눔 2월30일", []],   // 월 범위 초과
  ["큐티나눔 0301", []],      // 다음 달
];

for (const [title, expected] of cases) {
  test(`extractQtDays: ${JSON.stringify(title)}`, () => {
    assert.deepEqual(extractQtDays(title, Y, M, DIM), expected);
  });
}
