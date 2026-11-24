import { describe, expect, it } from "vitest";
import {
  breadcrumbs,
  displayDir,
  isImagePath,
  isVideoPath,
  resolveFrom,
  localMediaPath,
  isInside,
  parsePathList,
  remapPath,
} from "$lib/paths";

describe("isInside", () => {
  it("matches the root itself and its descendants only", () => {
    expect(isInside("/lib", "/lib")).toBe(true);
    expect(isInside("/lib/a.md", "/lib")).toBe(true);
    expect(isInside("/library/a.md", "/lib")).toBe(false);
    expect(isInside("/a.md", "")).toBe(false);
  });
});

describe("displayDir", () => {
  it("shows the parent folder with ~ for home", () => {
    expect(displayDir("/Users/me/repo/README.md", "/Users/me")).toBe("~/repo");
    expect(displayDir("/Users/me/a.md", "/Users/me")).toBe("~");
    expect(displayDir("/opt/x.md", "/Users/me")).toBe("/opt");
    expect(displayDir("/opt/x.md", "")).toBe("/opt");
  });
});

describe("breadcrumbs", () => {
  const roots = { library: "/Users/me/Inky", workspace: null, home: "/Users/me" };

  it("lists Library then each folder down to the document's own folder", () => {
    expect(breadcrumbs("/Users/me/Inky/Brains/00 Start/05 Catalog.md", roots)).toEqual([
      { label: "Library", dir: "/Users/me/Inky", browsable: true },
      { label: "Brains", dir: "/Users/me/Inky/Brains", browsable: true },
      { label: "00 Start", dir: "/Users/me/Inky/Brains/00 Start", browsable: true },
    ]);
  });

  it("a document at the library root has only the Library crumb", () => {
    expect(breadcrumbs("/Users/me/Inky/a.md", roots)).toEqual([
      { label: "Library", dir: "/Users/me/Inky", browsable: true },
    ]);
  });

  it("roots at the opened folder, even when it sits inside the library", () => {
    const ws = { ...roots, workspace: "/Users/me/Inky/Brains" };
    expect(breadcrumbs("/Users/me/Inky/Brains/x/a.md", ws)).toEqual([
      { label: "Brains", dir: "/Users/me/Inky/Brains", browsable: true },
      { label: "x", dir: "/Users/me/Inky/Brains/x", browsable: true },
    ]);
  });

  it("an outside document shows its folder, not browsable", () => {
    expect(breadcrumbs("/Users/me/repo/docs/README.md", roots)).toEqual([
      { label: "~/repo/docs", dir: "/Users/me/repo/docs", browsable: false },
    ]);
  });
});

describe("resolveFrom", () => {
  it("resolves a relative path against a document's folder, . and .. included", () => {
    expect(resolveFrom("/lib/Notes", "clip.mp4")).toBe("/lib/Notes/clip.mp4");
    expect(resolveFrom("/lib/Notes", "./media/clip.mp4")).toBe("/lib/Notes/media/clip.mp4");
    expect(resolveFrom("/lib/Notes/Deep", "../../videos/clip.mp4")).toBe("/lib/videos/clip.mp4");
    expect(resolveFrom("/lib/Notes", "/abs/clip.mp4")).toBe("/abs/clip.mp4");
  });

  it("works on Windows paths, which the backend sends with /", () => {
    expect(resolveFrom("C:/Users/me/Inky/Guides", "../media/dot.png")).toBe("C:/Users/me/Inky/media/dot.png");
    expect(resolveFrom("C:/Users/me/Inky", "../../../../x.png")).toBe("C:/x.png");
    expect(resolveFrom("C:/Users/me/Inky", "D:/Pictures/a.png")).toBe("D:/Pictures/a.png");
    expect(resolveFrom("C:/Users/me/Inky", "D:\\Pictures\\a.png")).toBe("D:/Pictures/a.png");
  });
});

describe("localMediaPath", () => {
  it("decodes and resolves a picture's or video's src, so no .. reaches the file server", () => {
    expect(localMediaPath("/lib/Guides", "../media/dot.png")).toBe("/lib/media/dot.png");
    expect(localMediaPath("/lib/Notes", "My%20clip.mp4")).toBe("/lib/Notes/My clip.mp4");
    expect(localMediaPath("/lib/Notes", "100%.png")).toBe("/lib/Notes/100%.png");
  });
});

describe("isVideoPath", () => {
  it("matches the video formats macOS plays, in any case", () => {
    expect(isVideoPath("/a/explainer.mp4")).toBe(true);
    expect(isVideoPath("/a/demo.MOV")).toBe(true);
    expect(isVideoPath("/a/clip.m4v")).toBe(true);
    expect(isVideoPath("/a/talk.webm")).toBe(true);
    expect(isVideoPath("/a/raw.avi")).toBe(false);
    expect(isVideoPath("/a/mp4.md")).toBe(false);
    expect(isVideoPath("/a/shot.png")).toBe(false);
  });
});

describe("isImagePath", () => {
  it("matches image extensions in any case", () => {
    expect(isImagePath("/a/shot.PNG")).toBe(true);
    expect(isImagePath("/a/photo.jpeg")).toBe(true);
    expect(isImagePath("/a/diagram.svg")).toBe(true);
    expect(isImagePath("/a/notes.md")).toBe(false);
    expect(isImagePath("/a/png")).toBe(false);
  });
});

describe("remapPath", () => {
  it("follows a renamed file or folder", () => {
    expect(remapPath("/a/x.png", "/a/x.png", "/a/y.png")).toBe("/a/y.png");
    expect(remapPath("/a/img/x.png", "/a/img", "/b/img")).toBe("/b/img/x.png");
    expect(remapPath("/a/imgs/x.png", "/a/img", "/b/img")).toBe("/a/imgs/x.png");
  });
});

describe("parsePathList", () => {
  it("reads a stored list and ignores anything malformed", () => {
    expect(parsePathList('["/lib/a","/lib/b"]')).toEqual(["/lib/a", "/lib/b"]);
    expect(parsePathList('["/lib/a",3,null]')).toEqual(["/lib/a"]);
    expect(parsePathList(null)).toEqual([]);
    expect(parsePathList("{oops")).toEqual([]);
    expect(parsePathList('{"a":1}')).toEqual([]);
  });
});
