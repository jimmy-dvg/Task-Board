import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderLoginPage } from './pages/login/login.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Login';

if (app) {
  app.className = 'app-shell';
  app.append(renderHeader('/login'));
  app.append(renderLoginPage());
  app.append(renderFooter());
}
