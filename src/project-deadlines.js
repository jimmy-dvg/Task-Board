import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderProjectDeadlinesPage } from './pages/project-deadlines/project-deadlines.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Tasks by Deadline';

async function initProjectDeadlines() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/projects'));
  const page = await renderProjectDeadlinesPage();
  app.append(page);
  app.append(renderFooter());
}

initProjectDeadlines();
