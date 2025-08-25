import { describe, it, expect, beforeEach } from 'vitest';
import { App } from '../../app';
import { GuiManager } from '../../gui/gui-manager';
import { Task } from '../models';
import { TaskType } from '../types';
import { DeductionSchema } from '../schemas';

describe('App', () => {
  let app: App;
  let guiManager: GuiManager;

  beforeEach(async () => {
    // Reset the app before each test to ensure isolation, and disable seeding
    app = await App.create(false);
    guiManager = new GuiManager(app);
  });

  describe('User Verification', () => {
    it('should allow a user to verify a belief', async () => {
      // Add a belief to the world model
      await guiManager.add_new_thought('(is a TestBelief)', TaskType.BELIEF);

      // Manually run a tick to get the belief into the world model
      await app.tick();

      const belief_task = Object.values(app.world_model.tasks).find(t => t.type === TaskType.BELIEF);
      expect(belief_task).toBeDefined();
      expect(belief_task!.verified).toBeFalsy();

      // Verify the belief
      guiManager.verify_belief(belief_task!.id);

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

      await guiManager.add_new_thought(premiseContent, TaskType.BELIEF);
      await guiManager.add_new_thought(implicationContent, TaskType.BELIEF);

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

  describe('API Extensibility', () => {
    it('should allow registering and unregistering a custom schema', () => {
      // A simple custom schema for testing
      const customSchema = new DeductionSchema();
      customSchema['id'] = 'custom_schema_id'; // Mock ID for predictability

      // Register
      app.register_schema(customSchema);
      const registry = app.get_schema_registry();
      expect(registry.get('custom_schema_id')).toBe(customSchema);

      // Unregister
      app.unregister_schema('custom_schema_id');
      expect(registry.get('custom_schema_id')).toBeUndefined();
    });

    it('should allow registering and unregistering a custom procedure handler', () => {
      // A simple custom handler for testing
      const customHandler = {
        name: () => 'custom_handler',
        can_handle: (content: string) => content.includes('custom_handler'),
        execute: async (content: string, bindings: Record<string, string>, world_model: any) => {
          return [];
        }
      };

      // Register
      app.register_procedure_handler(customHandler);
      const handlers = app.get_procedure_handlers();
      expect(handlers['custom_handler']).toBe(customHandler);

      // Unregister
      app.unregister_procedure_handler('custom_handler');
      expect(handlers['custom_handler']).toBeUndefined();
    });
  });
});
