import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderProjectActivityPage } from './pages/project-activity/project-activity.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Task Activity';

async function initProjectActivity() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/projects'));
  const page = await renderProjectActivityPage();
  app.append(page);
  app.append(renderFooter());
}

initProjectActivity();
