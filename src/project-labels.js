import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderProjectLabelsPage } from './pages/project-labels/project-labels.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Tasks by Label';

async function initProjectLabels() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/projects'));
  const page = await renderProjectLabelsPage();
  app.append(page);
  app.append(renderFooter());
}

initProjectLabels();
