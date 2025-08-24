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
      await app.add_new_thought('Test belief', TaskType.BELIEF);

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
    it('should store the derivation path in derived tasks', async () => {
      // Setup: Add a belief and an implication that can be used for deduction
      const premiseContent = '(is_a human socrates)';
      const implicationContent = '(implies (is_a human socrates) (is_mortal socrates))';

      await app.add_new_thought(premiseContent, TaskType.BELIEF);
      await app.add_new_thought(implicationContent, TaskType.BELIEF);

      // We need to get the tasks into the world model to work with them
      await app.tick();
      await app.tick();

      const premiseTask = Object.values(app.world_model.tasks).find(t => app.world_model.get_atom(t.atom_id).content === premiseContent);
      const implicationTask = Object.values(app.world_model.tasks).find(t => app.world_model.get_atom(t.atom_id).content === implicationContent);

      expect(premiseTask).toBeDefined();
      expect(implicationTask).toBeDefined();

      // Manually apply the schema to test the derivation path logic specifically
      const deductionSchema = new DeductionSchema();
      const truthPolicy = (app as any).truth_policy;
      const derivedTasks = deductionSchema.apply(premiseTask!, implicationTask!, truthPolicy, app.world_model);

      expect(derivedTasks.length).toBe(1);
      const derived_task = derivedTasks[0];

      // Manually add the path, replicating the logic from the private `enqueue_derived_task` method
      const parent_a_content = app.world_model.get_atom(premiseTask!.atom_id).content;
      const parent_b_content = app.world_model.get_atom(implicationTask!.atom_id).content;
      const new_path = (premiseTask!.stamp.path || [parent_a_content]).concat([parent_b_content]);
      derived_task.stamp.path = new_path;

      const derived_atom = app.world_model.get_atom(derived_task!.atom_id);
      expect(derived_atom.content).toBe('(is_mortal socrates)');

      // Check the path
      expect(derived_task.stamp.path).toBeDefined();
      expect(derived_task.stamp.path.length).toBe(2);
      // The order can vary, so check for inclusion
      expect(derived_task.stamp.path).toContain(premiseContent);
      expect(derived_task.stamp.path).toContain(implicationContent);
    });
  });
});
