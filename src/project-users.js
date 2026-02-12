import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderProjectUsersPage } from './pages/project-users/project-users.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Project Users';

async function initProjectUsers() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/projects'));
  const page = await renderProjectUsersPage();
  app.append(page);
  app.append(renderFooter());
}

initProjectUsers();
