import { describe, expect, it } from 'bun:test';
import { packageEntries } from '#src/map';

describe('packageEntries', () => {
	it('adds the jsr scheme slash to the trailing-slash entry', () => {
		expect(packageEntries('@std/async', 'jsr:@std/async@^1.0.0')).toEqual({
			'@std/async': 'jsr:@std/async@^1.0.0',
			'@std/async/': 'jsr:/@std/async@^1.0.0/',
		});
	});

	it('adds the npm scheme slash to the trailing-slash entry', () => {
		expect(packageEntries('ansispeck', 'npm:ansispeck@0.2')).toEqual({
			ansispeck: 'npm:ansispeck@0.2',
			'ansispeck/': 'npm:/ansispeck@0.2/',
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
