import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderProjectFormPage } from './pages/project-form/project-form.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Project';

async function initProjectForm() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/projects'));
  const formPage = await renderProjectFormPage();
  app.append(formPage);
  app.append(renderFooter());
}

initProjectForm();
