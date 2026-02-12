import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderProjectsPage } from './pages/projects/projects.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Projects';

async function initProjects() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/projects'));
  const projectsPage = await renderProjectsPage();
  app.append(projectsPage);
  app.append(renderFooter());
}

initProjects();
