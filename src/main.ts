import './style.css';
import { Gui } from './gui/index';
import { App } from './app';
import { GuiManager } from './gui/gui-manager';

document.addEventListener('DOMContentLoaded', async () => {
  const app = await App.create();
  const guiManager = new GuiManager(app);
  const gui = new Gui(guiManager, app.world_model, app.agenda, app.schema_registry);

  // gui.init() now starts the new worker-based simulation loop
  gui.init();
});
