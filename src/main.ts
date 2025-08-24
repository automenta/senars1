import './style.css';
import { Gui } from './gui';
import { App } from './app';

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  const gui = new Gui(app, app.world_model, app.agenda, app.schema_registry);
  gui.init();

  setInterval(() => {
    app.tick();
    gui.render();
  }, 1000);
});
