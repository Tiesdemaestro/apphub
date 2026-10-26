#!/usr/bin/env node
import { createCLI } from './create.mjs';
process.exitCode = await createCLI();
