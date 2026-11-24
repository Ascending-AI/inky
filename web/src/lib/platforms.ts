/*
 * The platforms of the download page, and the rules that the page's script uses.
 *
 * To add a platform's build: give the platform an installer here, and make the release workflow
 * (.github/workflows/release.yml) publish that file and its entry in app/latest.json.
 * The page needs no other change.
 */

export type PlatformId = 'macos' | 'windows' | 'linux';

/** One file that a person downloads to install Inky. */
export interface Installer {
	/** The build, for example "Apple silicon". */
	label: string;
	/** The path of the latest installer on the download host. The file at this path changes with each release. */
	path: string;
	/** The key of this build in the `platforms` of app/latest.json (Tauri's `<os>-<arch>`). */
	feedKey: string;
}

export interface Platform {
	id: PlatformId;
	name: string;
	/** What the build needs. Shown only when the platform has an installer. */
	requirement: string;
	/** The first installer is the one that the main button offers. An empty list: no build yet. */
	installers: Installer[];
	/** A line under the main button, for something people meet when they install. */
	note?: string;
}

export const PLATFORMS: Platform[] = [
	{
		id: 'macos',
		name: 'macOS',
		requirement: 'macOS 11 or later',
		installers: [{ label: 'Apple silicon', path: 'Inky.dmg', feedKey: 'darwin-aarch64' }]
	},
	{
		id: 'windows',
		name: 'Windows',
		requirement: 'Windows 10 or later',
		installers: [{ label: '64-bit', path: 'Inky-setup.exe', feedKey: 'windows-x86_64' }],
		// The installer is not code signed yet, so SmartScreen stops it the first time.
		note: 'If Windows says it protected your PC, choose More info, then Run anyway.'
	},
	{ id: 'linux', name: 'Linux', requirement: '', installers: [] }
];

/** Names as a sentence: "macOS", "macOS and Windows", "macOS, Windows and Linux". */
export function nameList(names: string[]): string {
	if (names.length < 2) return names.join('');
	return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The download host. A build can set another one with PUBLIC_DOWNLOAD_BASE. */
export const DEFAULT_DOWNLOAD_BASE = 'https://inky-downloads.ascending.ai';

/** The base without a trailing slash. An empty or missing value gives the default. */
export function downloadBase(value: string | undefined): string {
	const base = (value ?? '').trim().replace(/\/+$/, '');
	return base === '' ? DEFAULT_DOWNLOAD_BASE : base;
}

export function installerUrl(base: string, installer: Installer): string {
	return `${base}/${installer.path}`;
}

export function feedUrl(base: string): string {
	return `${base}/app/latest.json`;
}

/**
 * The visitor's platform, or null for a phone, a tablet or an unknown system.
 * An iPad can send a Mac user agent: its touch points tell the two apart.
 */
export function detectPlatform(userAgent: string, touchPoints = 0): PlatformId | null {
	if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return null;
	if (/Macintosh|Mac OS X/i.test(userAgent)) return touchPoints > 1 ? null : 'macos';
	if (/Windows/i.test(userAgent)) return 'windows';
	if (/Linux|X11/i.test(userAgent)) return 'linux';
	return null;
}

const VERSION = /^\d+\.\d+\.\d+$/;

/** The version that the feed (app/latest.json) offers for one build, or null. */
export function feedVersion(feed: unknown, feedKey: string): string | null {
	if (typeof feed !== 'object' || feed === null) return null;
	const { version, platforms } = feed as { version?: unknown; platforms?: unknown };
	if (typeof version !== 'string' || !VERSION.test(version)) return null;
	if (typeof platforms !== 'object' || platforms === null) return null;
	return Object.hasOwn(platforms, feedKey) ? version : null;
}
