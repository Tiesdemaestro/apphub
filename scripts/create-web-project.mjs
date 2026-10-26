#!/usr/bin/env node
import { createCLI } from '../skills/build-apphub-project/scripts/create.mjs';
process.exitCode = await createCLI();
