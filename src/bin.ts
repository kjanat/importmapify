#!/usr/bin/env node
import { cli } from '@kjanat/dreamcli';
import { generateCommand } from './cli.ts';

cli('importmapify')
	.manifest({ from: import.meta.url })
	.default(generateCommand)
	.completions()
	.run();
