import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderAdminPage } from './pages/admin/admin.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Admin';

async function initAdmin() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/admin'));
  const adminPage = await renderAdminPage();
  app.append(adminPage);
  app.append(renderFooter());
}

initAdmin();
