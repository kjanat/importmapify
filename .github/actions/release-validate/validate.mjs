#!/usr/bin/env node
// @ts-check
/// <reference types="node" />
import { error, log } from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import { env as processEnv, exit } from 'node:process';

const SEMVER_PATTERN =
	/^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+(?<buildmetadata>[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const NPM_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

/**
 * @param {string} name
 * @returns {string}
 */
const input = (name) => {
	const key = `INPUT_${name.toUpperCase()}`;
	return processEnv[key] ?? processEnv[key.replace(/-/g, '_')] ?? '';
};

/**
 * @param {string} name
 * @returns {string}
 */
const readEnv = (name) => processEnv[name] ?? '';

const EVENT_NAME = input('event-name') || readEnv('GITHUB_EVENT_NAME') || readEnv('EVENT_NAME');
const REF_NAME = input('ref-name') || readEnv('GITHUB_REF_NAME') || readEnv('REF_NAME');
const GITHUB_OUTPUT = readEnv('GITHUB_OUTPUT');

/**
 * @param {string} message
 * @returns {never}
 */
const fail = (message) => {
	error(`::error::${message}`);
	exit(1);
};

/**
 * @param {string} path
 * @returns {object}
 */
const readJson = (path) => {
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8'));
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			fail(`Invalid JSON object in ${path}`);
		}
		return parsed;
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return fail(`Failed to read ${path}: ${message}`);
	}
};

/**
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
 */
const safeOutputValue = (name, value) => {
	const text = String(value);
	if (text.includes('\n') || text.includes('\r')) fail(`Invalid ${name}: contains newline`);
	return text;
};

/**
 * @param {object} source
 * @param {string} path
 * @param {string} key
 * @returns {string}
 */
const stringField = (source, path, key) => {
	const value = Object.getOwnPropertyDescriptor(source, key)?.value;
	if (typeof value !== 'string' || value.length === 0) fail(`Missing or empty ${key} in ${path}`);
	return safeOutputValue(`${path}.${key}`, value);
};

/**
 * @param {string} value
 * @param {string} label
 * @returns {{ value: string; prerelease: boolean }}
 */
const parseSemver = (value, label) => {
	const match = SEMVER_PATTERN.exec(value);
	if (match === null) {
		return fail(`Invalid SemVer in ${label}: ${value}`);
	}
	return { value, prerelease: match.groups?.prerelease !== undefined };
};

/**
 * @param {string} name
 * @param {string} value
 * @param {RegExp} pattern
 */
const validateName = (name, value, pattern) => {
	if (!pattern.test(value)) fail(`Invalid ${name}: ${value}`);
};

const pkg = readJson('package.json');
const pkgName = stringField(pkg, 'package.json', 'name');
const pkgVersion = stringField(pkg, 'package.json', 'version');

validateName('npm package name', pkgName, NPM_NAME_PATTERN);

const manifestSemver = parseSemver(pkgVersion, 'package.json');

let version = `v${manifestSemver.value}`;
let versionSemver = manifestSemver;
let isPush = false;
let isTag = false;

switch (EVENT_NAME) {
	case 'pull_request':
		log(`PR mode: version from package.json: ${pkgVersion}`);
		break;

	case 'push': {
		isPush = true;

		if (!REF_NAME.startsWith('v')) {
			fail(`Push event requires REF_NAME starting with 'v', got: ${REF_NAME}`);
		}

		isTag = true;
		const semver = REF_NAME.slice(1);
		versionSemver = parseSemver(semver, 'tag');
		version = `v${versionSemver.value}`;
		log(`Tag version: ${semver}`);
		log(`Manifest version: ${pkgVersion}`);

		if (versionSemver.value !== pkgVersion) {
			fail(`Version mismatch: tag=${semver}, package.json=${pkgVersion}`);
		}

		break;
	}

	default:
		fail(`Unsupported event: ${EVENT_NAME || '<empty>'}`);
}

const prerelease = versionSemver.prerelease;
const isStable = isTag && !prerelease;
const mode = isTag ? 'publish' : 'dry-run';
const versionNumber = version.replace(/^v/, '');

const outputs = {
	version,
	is_push: isPush,
	is_tag: isTag,
	prerelease,
	is_stable: isStable,
	mode,
	npm_url: `https://npm.im/package/${pkgName}/v/${versionNumber}`,
};

const outputText = `${Object.entries(outputs)
	.map(([key, value]) => `${key}=${safeOutputValue(`output ${key}`, value)}`)
	.join('\n')}\n`;

if (GITHUB_OUTPUT) {
	writeFileSync(GITHUB_OUTPUT, outputText, { flag: 'a' });
} else {
	log(outputText.trimEnd());
}
