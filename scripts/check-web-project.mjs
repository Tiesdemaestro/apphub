#!/usr/bin/env node
import { auditCLI } from '../skills/build-apphub-project/scripts/audit.mjs';
process.exitCode = await auditCLI();
