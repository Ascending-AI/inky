import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DOWNLOAD_BASE,
	PLATFORMS,
	detectPlatform,
	downloadBase,
	feedUrl,
	feedVersion,
	installerUrl
} from './platforms';

const MAC =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15';
const WINDOWS =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const ANDROID =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1';

describe('detectPlatform', () => {
	it('names the desktop systems', () => {
		expect(detectPlatform(MAC)).toBe('macos');
		expect(detectPlatform(WINDOWS)).toBe('windows');
		expect(detectPlatform(LINUX)).toBe('linux');
	});

	it('gives null for phones and tablets', () => {
		expect(detectPlatform(ANDROID)).toBeNull();
		expect(detectPlatform(IPHONE)).toBeNull();
		// An iPad that asks for the desktop site sends the Mac user agent.
		expect(detectPlatform(MAC, 5)).toBeNull();
	});

	it('gives null for an unknown system', () => {
		expect(detectPlatform('')).toBeNull();
	});
});

describe('the download host', () => {
	it('uses the default without a value', () => {
		expect(downloadBase(undefined)).toBe(DEFAULT_DOWNLOAD_BASE);
		expect(downloadBase('  ')).toBe(DEFAULT_DOWNLOAD_BASE);
	});

	it('removes a trailing slash', () => {
		expect(downloadBase('https://downloads.example.com/inky/')).toBe(
			'https://downloads.example.com/inky'
		);
	});

	it('builds the links', () => {
		const base = 'https://downloads.example.com';
		expect(feedUrl(base)).toBe('https://downloads.example.com/app/latest.json');
		const mac = PLATFORMS.find((p) => p.id === 'macos');
		expect(installerUrl(base, mac!.installers[0])).toBe('https://downloads.example.com/Inky.dmg');
		const windows = PLATFORMS.find((p) => p.id === 'windows');
		expect(installerUrl(base, windows!.installers[0])).toBe(
			'https://downloads.example.com/Inky-setup.exe'
		);
		expect(windows!.installers[0].feedKey).toBe('windows-x86_64');
	});
});

describe('PLATFORMS', () => {
	it('has macOS, Windows and Linux, each id and feed key once', () => {
		expect(PLATFORMS.map((p) => p.id)).toEqual(['macos', 'windows', 'linux']);
		const keys = PLATFORMS.flatMap((p) => p.installers.map((i) => i.feedKey));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('gives a requirement to each platform with an installer', () => {
		for (const p of PLATFORMS.filter((p) => p.installers.length > 0)) {
			expect(p.requirement).not.toBe('');
		}
	});
});

describe('feedVersion', () => {
	const feed = {
		version: '1.2.3',
		platforms: { 'darwin-aarch64': { signature: 's', url: 'u' } }
	};

	it('gives the version of a build that the feed has', () => {
		expect(feedVersion(feed, 'darwin-aarch64')).toBe('1.2.3');
	});

	it('gives null for a build that the feed does not have', () => {
		expect(feedVersion(feed, 'windows-x86_64')).toBeNull();
		expect(feedVersion(feed, 'toString')).toBeNull();
	});

	it('gives null for a feed that is not valid', () => {
		expect(feedVersion(null, 'darwin-aarch64')).toBeNull();
		expect(feedVersion('1.2.3', 'darwin-aarch64')).toBeNull();
		expect(feedVersion({ version: '1.2.3' }, 'darwin-aarch64')).toBeNull();
		expect(feedVersion({ ...feed, version: '<b>1</b>' }, 'darwin-aarch64')).toBeNull();
	});
});
