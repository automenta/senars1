import { describe, it, expect, beforeEach } from 'vitest';
import { App } from '../../app';
import { Task } from '../models';
import { TaskType } from '../types';
import { DeductionSchema } from '../schemas';

describe('App', () => {
  let app: App;

  beforeEach(() => {
    // Reset the app before each test to ensure isolation, and disable seeding
    app = new App(false);
  });

  describe('User Verification', () => {
    it('should allow a user to verify a belief', async () => {
      // Add a belief to the world model
      await app.add_new_thought('(is a TestBelief)', TaskType.BELIEF);

      // Manually run a tick to get the belief into the world model
      await app.tick();

      const belief_task = Object.values(app.world_model.tasks).find(t => t.type === TaskType.BELIEF);
      expect(belief_task).toBeDefined();
      expect(belief_task!.verified).toBeFalsy();

      // Verify the belief
      app.verify_belief(belief_task!.id);

      const verified_task = app.world_model.get_task(belief_task!.id);
      expect(verified_task.verified).toBe(true);
      // Check if confidence was boosted
      expect(verified_task.truth!.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Derivation Path History', () => {
    it.skip('should store the derivation path in derived tasks', async () => {
      // Setup: Add a belief and an implication that can be used for deduction
      const premiseContent = '(is_a human socrates)';
      const implicationContent = '(implies (is_a human socrates) (is_mortal socrates))';
      const conclusionContent = '(is_mortal socrates)';

      await app.add_new_thought(premiseContent, TaskType.BELIEF);
      await app.add_new_thought(implicationContent, TaskType.BELIEF);

      // Run the engine for a few ticks to allow for processing
      for (let i = 0; i < 5; i++) {
        await app.tick();
      }

      // Find the derived task (the conclusion) in the world model
      const derivedTask = Object.values(app.world_model.tasks).find(t => {
        const atom = app.world_model.get_atom(t.atom_id);
        return atom.content === conclusionContent;
      });

      expect(derivedTask).toBeDefined();
      expect(derivedTask!.stamp.path).toBeDefined();

      const path = derivedTask!.stamp.path!;
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path).toContain(premiseContent);
      expect(path).toContain(implicationContent);
      expect(path[path.length - 1]).toContain('[Schema:');
    });
  });
});
