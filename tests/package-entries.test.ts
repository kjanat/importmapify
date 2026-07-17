import { describe, expect, it } from 'bun:test';
import { packageEntries } from '#src/map.ts';

describe('packageEntries', () => {
	it('adds the jsr scheme slash to the trailing-slash entry', () => {
		expect(packageEntries('@std/async', 'jsr:@std/async@^1.0.0')).toEqual({
			'@std/async': 'jsr:@std/async@^1.0.0',
			'@std/async/': 'jsr:/@std/async@^1.0.0/',
		});
	});

	it('adds the npm scheme slash to the trailing-slash entry', () => {
		expect(packageEntries('chalk', 'npm:chalk@5')).toEqual({
			chalk: 'npm:chalk@5',
			'chalk/': 'npm:/chalk@5/',
		});
	});

	it('leaves url and relative targets without a scheme slash', () => {
		expect(packageEntries('virtual', 'https://example.com/virtual')).toEqual({
			virtual: 'https://example.com/virtual',
			'virtual/': 'https://example.com/virtual/',
		});
	});

	it('is idempotent for an already conformant trailing-slash target', () => {
		expect(packageEntries('@std/async', 'jsr:/@std/async@^1.0.0/')['@std/async/']).toBe('jsr:/@std/async@^1.0.0/');
	});
});
