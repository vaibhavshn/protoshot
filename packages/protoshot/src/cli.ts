#!/usr/bin/env node
import { runCli } from "./run.ts";

process.exitCode = await runCli(process.argv.slice(2));
