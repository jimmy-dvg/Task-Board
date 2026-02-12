import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderDashboardPage } from './pages/dashboard/dashboard.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Dashboard';

if (app) {
  app.className = 'app-shell';
  app.append(renderHeader('/dashboard'));
  app.append(renderDashboardPage());
  app.append(renderFooter());
}
