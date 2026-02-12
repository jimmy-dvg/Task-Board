import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderDashboardPage } from './pages/dashboard/dashboard.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Dashboard';

async function initDashboard() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/dashboard'));
  const dashboardPage = await renderDashboardPage();
  app.append(dashboardPage);
  app.append(renderFooter());
}

initDashboard();
