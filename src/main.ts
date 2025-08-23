import './style.css';
import { initGUI, render } from './gui';
import { App } from './app';

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  initGUI(app);

  // Simulate the cognitive cycle
  setInterval(() => {
    app.tick();
    render();
  }, 1000); // Tick every second
});
