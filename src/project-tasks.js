import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderProjectDetailsPage } from './pages/project-details/project-details.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Project Tasks';

async function initProjectTasks() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/projects'));
  const projectPage = await renderProjectDetailsPage();
  app.append(projectPage);
  app.append(renderFooter());
}

initProjectTasks();
