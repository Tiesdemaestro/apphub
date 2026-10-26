#!/usr/bin/env node
import { auditCLI } from './audit.mjs';
process.exitCode = await auditCLI();
