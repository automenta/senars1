import './style.css';
import { Gui } from './gui/index';
import { App } from './app';

document.addEventListener('DOMContentLoaded', async () => {
  const app = await App.create();
  const gui = new Gui(app, app.world_model, app.agenda, app.schema_registry);

  // gui.init() now starts the new worker-based simulation loop
  gui.init();
});
