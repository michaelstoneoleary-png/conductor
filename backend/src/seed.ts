import prisma from './lib/prisma';

async function main() {
  console.log('Seeding database...');

  await prisma.settings.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      globalKillSwitch: false,
      dailyTokenCap: 500000,
      perRunTokenCap: 8000,
      maxParallelRuns: 3,
      maxReviewLoops: 2,
    },
  });

  const agents = [
    { role: 'CoS', name: 'Chief of Staff', provider: 'anthropic', model: 'claude-opus-4-6' },
    { role: 'PM', name: 'Product Manager', provider: 'anthropic', model: 'claude-sonnet-4-6' },
    { role: 'UX', name: 'UX Designer', provider: 'anthropic', model: 'claude-sonnet-4-6' },
    { role: 'Dev1', name: 'Developer (Builder)', provider: 'openai', model: 'gpt-4o' },
    { role: 'Dev2', name: 'Developer (Reviewer)', provider: 'anthropic', model: 'claude-sonnet-4-6' },
    { role: 'QA', name: 'QA Engineer', provider: 'openai', model: 'gpt-4o-mini' },
    { role: 'Research', name: 'Research Analyst', provider: 'openai', model: 'gpt-4o' },
    { role: 'Growth', name: 'Growth & Marketing', provider: 'anthropic', model: 'claude-sonnet-4-6' },
  ];

  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { role: agent.role },
      update: { name: agent.name, provider: agent.provider, model: agent.model },
      create: { ...agent, isEnabled: true, status: 'idle' },
    });
  }

  console.log(`Seeded ${agents.length} agents and global settings.`);
  console.log('Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
