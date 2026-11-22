import { describe, expect, it } from "vitest";
import { parseVideoLink, rememberPosition, resumeAt, RESUME_MAX } from "../src/lib/videotime";

describe("parseVideoLink", () => {
  it("reads the start time of a media fragment in seconds or clock time", () => {
    expect(parseVideoLink("images/explainer.mp4#t=135")).toEqual({ path: "images/explainer.mp4", time: 135 });
    expect(parseVideoLink("a.mp4#t=2:15")).toEqual({ path: "a.mp4", time: 135 });
    expect(parseVideoLink("a.mov#t=1:02:03")).toEqual({ path: "a.mov", time: 3723 });
    expect(parseVideoLink("a.webm#t=12.5")).toEqual({ path: "a.webm", time: 12.5 });
    expect(parseVideoLink("a.mp4#t=npt:10,20")).toEqual({ path: "a.mp4", time: 10 });
  });

  it("decodes the path and treats a missing or bad time as none", () => {
    expect(parseVideoLink("My%20clip.M4V")).toEqual({ path: "My clip.M4V", time: null });
    expect(parseVideoLink("a.mp4#intro")).toEqual({ path: "a.mp4", time: null });
    expect(parseVideoLink("a.mp4#t=soon")).toEqual({ path: "a.mp4", time: null });
  });

  it("ignores links that are not to a video", () => {
    expect(parseVideoLink("notes.md#t=3")).toBeNull();
    expect(parseVideoLink("https://example.com/a.mp4#t=3")).toBeNull();
    expect(parseVideoLink("#t=3")).toBeNull();
  });
});

describe("resume positions", () => {
  it("resumes from a saved place, but not from the very start or the end", () => {
    expect(resumeAt(undefined, 600)).toBe(0);
    expect(resumeAt(95, 600)).toBe(95);
    expect(resumeAt(3, 600)).toBe(0);
    expect(resumeAt(597, 600)).toBe(0);
  });

  it("remembers places, forgets finished videos and keeps the newest few", () => {
    let saved = rememberPosition({}, "/a.mp4", 95, 600);
    expect(saved).toEqual({ "/a.mp4": 95 });
    saved = rememberPosition(saved, "/a.mp4", 598, 600);
    expect(saved).toEqual({});
    for (let i = 0; i < RESUME_MAX + 5; i++) saved = rememberPosition(saved, `/v${i}.mp4`, 30, 600);
    expect(Object.keys(saved)).toHaveLength(RESUME_MAX);
    expect(saved["/v0.mp4"]).toBeUndefined();
    saved = rememberPosition(saved, "/v5.mp4", 40, 600);
    expect(Object.keys(saved).at(-1)).toBe("/v5.mp4");
  });
});
