import { db } from '../../database';
import { agents } from '../../database/schemas/agent';
import { eq, lt, and, isNotNull } from 'drizzle-orm';
import Cron from 'croner';

export const checkDueAgents = async () => {
  const now = new Date();
  const dueAgents = await db.select().from(agents).where(
    and(isNotNull(agents.schedule), lt(agents.nextRunAt, now))
  );
  
  for (const agent of dueAgents) {
    // Logic to trigger agent execution
    console.log(`Triggering scheduled agent: ${agent.id}`);
    const cron = new Cron(agent.schedule!);
    await db.update(agents).set({
      lastRunAt: now,
      nextRunAt: cron.nextRun()
    }).where(eq(agents.id, agent.id));
  }
};
