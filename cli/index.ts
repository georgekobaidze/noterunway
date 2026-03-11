#!/usr/bin/env node

import { Command } from 'commander'

const program = new Command()

program
  .name('noterunway')
  .description('AI-powered Notion workspace management tool')
  .version('0.1.0')

// Commands will be registered here as they are implemented
// program.addCommand(require('./commands/init').default)
// program.addCommand(require('./commands/doctor').default)
// program.addCommand(require('./commands/graph').default)
// program.addCommand(require('./commands/query').default)
// program.addCommand(require('./commands/ask').default)

program.parse(process.argv)
